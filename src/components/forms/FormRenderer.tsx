"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type SignatureCanvas from "react-signature-canvas";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  type Control,
  Controller,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type {
  FormSchemaV1,
  FieldDef,
  TempField,
  DynamicTableField,
  FormSection,
  FormStyle,
} from "@/types/forms";
import { buildDefaultValues, buildZodSchema } from "@/lib/schemaDrivenForm";
import { NotificationModal } from "@/components/NotificationModal";
import { GridField } from "@/components/forms/GridField";
import { addOfflineSubmittedForm, enqueueAuditSync } from "@/lib/client/auditSyncQueue";
import { isAppOffline } from "@/lib/client/appOffline";
import { apiUrl } from "@/lib/client/apiBase";
import { collectTemperatureAlerts } from "@/lib/temperatureMonitoring";
import { dbClearDraft, dbGetDraft, dbPutDraft } from "@/lib/client/formsDb";
import { dbEnqueueOutbox } from "@/lib/client/formsDb";

type Props = {
  tenantSlug: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  templateId: string;
  initialAuditId?: string;
  schema: FormSchemaV1;
};

type FormValues = Record<string, unknown>;

const DEFAULT_EVIDENCE_FIELD_ID = "__default_photo_evidence";

function ensureDefaultPhotoEvidence(schema: FormSchemaV1): FormSchemaV1 {
  const sections: FormSection[] =
    Array.isArray(schema.sections) && schema.sections.length
      ? schema.sections.map((s) =>
          s.type === "fields"
            ? { ...s, fields: [...s.fields] }
            : { ...s, columns: [...s.columns] }
        )
      : [{ type: "fields", title: "Fields", fields: [...(schema.fields ?? [])] }];

  const hasPhoto = sections.some(
    (section) =>
      section.type === "fields" &&
      section.fields.some((field) => field.isActive !== false && field.type === "photo")
  );

  if (hasPhoto) {
    return { ...schema, sections };
  }

  const evidenceField: FieldDef = {
    id: DEFAULT_EVIDENCE_FIELD_ID,
    type: "photo",
    label: "Photo evidence",
    required: false,
    isActive: true,
    helpText: "Capture evidence photo for this form.",
  };

  const footerIndex = sections.findIndex(
    (section) => section.type === "fields" && /footer/i.test(section.title || "")
  );

  if (footerIndex >= 0 && sections[footerIndex].type === "fields") {
    sections[footerIndex] = {
      ...sections[footerIndex],
      fields: [...sections[footerIndex].fields, evidenceField],
    };
  } else {
    sections.push({ type: "fields", title: "Evidence", fields: [evidenceField] });
  }

  return {
    ...schema,
    sections,
  };
}

function sectionColumnsClass(columns?: number) {
  if (columns === 2) return "grid grid-cols-1 gap-4 md:grid-cols-2";
  if (columns === 3) return "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";
  if (columns === 4) return "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4";
  return "grid grid-cols-1 gap-4 md:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]";
}

function formStyleTokens(style: FormStyle) {
  if (style === "compact") {
    return {
      section: "gap-3 p-3 sm:p-4",
      fieldCard: "rounded-md border border-foreground/20 bg-background p-2 shadow-sm",
    };
  }
  if (style === "report") {
    return {
      section: "gap-4 p-5 sm:p-6",
      fieldCard: "rounded-lg border border-foreground/20 bg-background p-3 shadow-sm",
    };
  }
  return {
    section: "gap-4 p-4 sm:p-5",
    fieldCard: "rounded-lg border border-foreground/20 bg-background p-3 shadow-sm",
  };
}

function draftCacheKey(userId: string | null, tenantSlug: string, templateId: string) {
  return `audit-local-draft:v1:${userId || "anon"}:${tenantSlug}:${templateId}`;
}

function draftFetchCooldownKey(userId: string | null, tenantSlug: string, templateId: string) {
  return `audit-draft-fetch-cooldown:v1:${userId || "anon"}:${tenantSlug}:${templateId}`;
}

function shouldSkipDraftFetch(userId: string | null, tenantSlug: string, templateId: string, ttlMs: number) {
  try {
    const raw = localStorage.getItem(draftFetchCooldownKey(userId, tenantSlug, templateId));
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < ttlMs;
  } catch {
    return false;
  }
}

function markDraftFetch(userId: string | null, tenantSlug: string, templateId: string) {
  try {
    localStorage.setItem(draftFetchCooldownKey(userId, tenantSlug, templateId), String(Date.now()));
  } catch {
    // ignore
  }
}

function writeQueuedNotice(tenantSlug: string, notice: string) {
  try {
    localStorage.setItem(`workspace-notice:v1:${tenantSlug}`, notice);
  } catch {
    // ignore
  }
}

function scheduleBackgroundTask(task: () => void, delayMs: number) {
  let idleId: number | null = null;
  const timeoutId = window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      idleId = (window as any).requestIdleCallback(task, { timeout: 1200 });
      return;
    }
    task();
  }, delayMs);

  return () => {
    window.clearTimeout(timeoutId);
    if (idleId !== null && "cancelIdleCallback" in window) {
      (window as any).cancelIdleCallback(idleId);
    }
  };
}

function writeLocalDraft(
  userId: string | null,
  tenantSlug: string,
  templateId: string,
  values: FormValues,
  auditId?: string | null,
  options?: { durable?: boolean }
) {
  try {
    localStorage.setItem(
      draftCacheKey(userId, tenantSlug, templateId),
      JSON.stringify({ ts: Date.now(), values, auditId: auditId || null })
    );
  } catch {
    // ignore
  }

  if (options?.durable !== false) {
    // Durable write (IndexedDB) – does not block UI.
    void dbPutDraft({
      tenantSlug,
      templateId,
      auditId: auditId || null,
      payload: values as Record<string, unknown>,
    });
  }
}

function clearLocalDraft(userId: string | null, tenantSlug: string, templateId: string) {
  try {
    localStorage.removeItem(draftCacheKey(userId, tenantSlug, templateId));
  } catch {
    // ignore
  }
  void dbClearDraft(tenantSlug, templateId);
}

function readLocalDraft(
  userId: string | null,
  tenantSlug: string,
  templateId: string
): { ts: number; values: FormValues; auditId: string | null } | null {
  try {
    const raw = localStorage.getItem(draftCacheKey(userId, tenantSlug, templateId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; values?: FormValues; auditId?: string | null };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.ts !== "number" || !Number.isFinite(parsed.ts)) return null;
    if (!parsed.values || typeof parsed.values !== "object") return null;
    return { ts: parsed.ts, values: parsed.values, auditId: parsed.auditId || null };
  } catch {
    return null;
  }
}

async function readLocalDraftAsync(
  tenantSlug: string,
  templateId: string
): Promise<{ ts: number; values: FormValues; auditId: string | null } | null> {
  const row = await dbGetDraft(tenantSlug, templateId);
  if (!row) return null;
  return { ts: row.updatedAtLocal, values: row.payload as FormValues, auditId: row.auditId || null };
}

function isNetworkFailure(error: unknown) {
  if (isAppOffline()) return true;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|network request failed|load failed|unable to resolve host|cannot resolve host|name or service not known|temporary failure in name resolution|etimedout|econnreset/i.test(
    message
  );
}

function isTimedOutRequest(error: unknown) {
  return (error as any)?.name === "AbortError";
}

function normalizePhotoValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }
  return [] as string[];
}

function isOfflineQueueableServerError(error: unknown) {
  const status = (error as any)?.status;
  const code = (error as any)?.code;
  if (status !== 503) return false;
  return code === "AUTH_SERVICE_UNAVAILABLE";
}

export function FormRenderer({ tenantSlug, tenantName, tenantLogoUrl, templateId, initialAuditId, schema }: Props) {
  const router = useRouter();
  const { session, user } = useAuth();
  const currentUserId = user?.id || session?.user?.id || null;
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [draftAuditId, setDraftAuditId] = useState<string | null>(null);
  const [activeStaffName, setActiveStaffName] = useState<string>("");
  const [notification, setNotification] = useState<{ title: string; message: string; tone?: "default" | "success" | "warning" | "error" } | null>(null);
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const hasSeenUserEditRef = useRef(false);
  const autoSaveInFlightRef = useRef(false);
  const autoSavePauseUntilRef = useRef(0);
  const suppressLocalDraftWriteUntilRef = useRef(0);
  const localDraftWriteTimerRef = useRef<number | null>(null);

  const effectiveSchema = useMemo(() => ensureDefaultPhotoEvidence(schema), [schema]);
  const formStyle = (schema.meta?.formStyle || "default") as FormStyle;
  const styleTokens = formStyleTokens(formStyle);

  const zodSchema = useMemo(() => buildZodSchema(effectiveSchema), [effectiveSchema]);
  const defaultValues = useMemo(() => buildDefaultValues(effectiveSchema), [effectiveSchema]);
  const defaultValuesRef = useRef(defaultValues);
  defaultValuesRef.current = defaultValues;

  const form = useForm<FormValues>({
    resolver: zodResolver(zodSchema),
    defaultValues,
    mode: "onBlur",
  });

  const sections: FormSection[] = Array.isArray(effectiveSchema.sections) && effectiveSchema.sections.length
    ? effectiveSchema.sections
    : [{ type: "fields", fields: effectiveSchema.fields ?? [] }];

  const visibleSections: FormSection[] = useMemo(
    () =>
      sections
        .map((section) => {
          if (section.type === "fields") {
            return {
              ...section,
              fields: section.fields.filter((f) => f.isActive !== false),
            };
          }
          return {
            ...section,
            columns: section.columns.filter((c) => c.isActive !== false),
          };
        })
        .filter((section) => (section.type === "fields" ? section.fields.length > 0 : section.columns.length > 0)),
    [sections]
  );

  const watchedValues = useWatch({ control: form.control }) as FormValues;
  const temperatureAlerts = useMemo(
    () => collectTemperatureAlerts(effectiveSchema, (watchedValues || {}) as Record<string, unknown>),
    [effectiveSchema, watchedValues]
  );

  function safeReset(nextValues: FormValues) {
    // When we rehydrate drafts, `useWatch` fires and can overwrite local draft storage.
    // Suppress local draft writes briefly to avoid clobbering server/local drafts.
    suppressLocalDraftWriteUntilRef.current = Date.now() + 1200;
    form.reset(nextValues);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("active-staff-profile:v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { tenantSlug?: string | null; name?: string | null };
      if (parsed?.tenantSlug && parsed.tenantSlug !== tenantSlug) return;
      if (typeof parsed?.name === "string" && parsed.name.trim()) {
        setActiveStaffName(parsed.name.trim());
      }
    } catch {
      // ignore
    }
  }, [tenantSlug]);

  useEffect(() => {
    let alive = true;
    const baseValues = defaultValuesRef.current;

    const local = readLocalDraft(currentUserId, tenantSlug, templateId);
    if (local) {
      if (initialAuditId && local.auditId && local.auditId !== initialAuditId) return;
      setDraftAuditId(local.auditId || null);
      safeReset({ ...baseValues, ...local.values });
      return;
    }

    // Durable draft (IndexedDB) – async after mount.
    (async () => {
      const fromDb = await readLocalDraftAsync(tenantSlug, templateId);
      if (!alive || !fromDb) return;
      if (initialAuditId && fromDb.auditId && fromDb.auditId !== initialAuditId) return;
      setDraftAuditId(fromDb.auditId || null);
      safeReset({ ...defaultValuesRef.current, ...fromDb.values });
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, tenantSlug, currentUserId, initialAuditId]);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (!accessToken || !tenantSlug || !templateId) return;
    if (isAppOffline()) {
      setIsLoadingDraft(false);
      return;
    }

    const local = readLocalDraft(currentUserId, tenantSlug, templateId);
    if (local && shouldSkipDraftFetch(currentUserId, tenantSlug, templateId, 5 * 60_000)) {
      setIsLoadingDraft(false);
      return;
    }

    let controller: AbortController | null = null;
    let timeout: number | null = null;
    let hardStop: number | null = null;

    const runFetch = () => {
      const showBlockingSpinner = !local;
      if (showBlockingSpinner) setIsLoadingDraft(true);
      const url = new URL(apiUrl("/api/audit/draft"));
      url.searchParams.set("tenantSlug", tenantSlug);
      url.searchParams.set("templateId", templateId);
      if (initialAuditId) url.searchParams.set("auditId", initialAuditId);

      controller = new AbortController();
      timeout = window.setTimeout(() => controller?.abort(), 2500);

      fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || "Failed to load draft");
          return data as {
            draft: null | {
              id: string;
              payload: Record<string, unknown>;
              updatedAt: string;
            };
          };
        })
        .then((data) => {
          if (!data.draft) return;
          const serverUpdatedAt = data.draft.updatedAt ? new Date(data.draft.updatedAt).getTime() : 0;
          const shouldAdoptServerDraft = !local || !Number.isFinite(serverUpdatedAt) || serverUpdatedAt >= local.ts;

          if (shouldAdoptServerDraft) {
            setDraftAuditId(data.draft.id);
            safeReset({ ...defaultValues, ...data.draft.payload });
            writeLocalDraft(currentUserId, tenantSlug, templateId, data.draft.payload, data.draft.id);
          }

          markDraftFetch(currentUserId, tenantSlug, templateId);
        })
        .catch(() => {
          // Silent fallback: form starts from defaults when no draft is available.
        })
        .finally(() => {
          if (timeout !== null) window.clearTimeout(timeout);
          if (hardStop !== null) window.clearTimeout(hardStop);
          setIsLoadingDraft(false);
        });
    };

    hardStop = window.setTimeout(() => {
      setIsLoadingDraft(false);
    }, 4000);

    const cancelDeferred = local
      ? scheduleBackgroundTask(runFetch, 900)
      : (() => {
          runFetch();
          return () => {
            // no-op
          };
        })();

    return () => {
      cancelDeferred();
      if (timeout !== null) window.clearTimeout(timeout);
      if (hardStop !== null) window.clearTimeout(hardStop);
      controller?.abort();
      setIsLoadingDraft(false);
    };
  }, [session?.access_token, templateId, tenantSlug, currentUserId, initialAuditId]);

  // Persist local draft quickly on edits (signatures, tables, photos — not only isDirty text fields).
  useEffect(() => {
    if (isLoadingDraft) return;
    if (!tenantSlug || !templateId) return;
    if (!currentUserId && !session?.access_token) return;
    if (Date.now() < suppressLocalDraftWriteUntilRef.current) return;

    if (!hasSeenUserEditRef.current) {
      hasSeenUserEditRef.current = true;
      return;
    }

    if (localDraftWriteTimerRef.current !== null) {
      window.clearTimeout(localDraftWriteTimerRef.current);
      localDraftWriteTimerRef.current = null;
    }

    localDraftWriteTimerRef.current = window.setTimeout(() => {
      const values = form.getValues();
      writeLocalDraft(currentUserId, tenantSlug, templateId, values, draftAuditId, { durable: true });
    }, 400);

    return () => {
      if (localDraftWriteTimerRef.current !== null) {
        window.clearTimeout(localDraftWriteTimerRef.current);
        localDraftWriteTimerRef.current = null;
      }
    };
  }, [watchedValues, isLoadingDraft, tenantSlug, templateId, currentUserId, draftAuditId, form, session?.access_token]);

  async function persistAudit(
    values: FormValues,
    mode: "submit" | "draft",
    options?: { silent?: boolean; allowQueue?: boolean }
  ) {
    const silent = Boolean(options?.silent);
    const allowQueue = options?.allowQueue !== false;
    const accessToken = session?.access_token;
    if (!accessToken) {
      if (!silent) {
        setNotification({
          title: "Sign in required",
          message: "Your session is missing or expired. Please sign in again to continue.",
          tone: "warning",
        });
      }
      router.push("/login");
      return false;
    }

    const normalizedCorrectiveAction = correctiveAction.trim();
    const payloadWithMeta: FormValues = {
      ...values,
      __temperatureMeta: {
        alerts: temperatureAlerts,
        correctiveAction: normalizedCorrectiveAction || null,
        capturedAt: new Date().toISOString(),
      },
    };

    if (mode === "submit" && temperatureAlerts.length > 0 && !normalizedCorrectiveAction) {
      if (!silent) {
        setNotification({
          title: "Corrective action required",
          message: "Please record corrective action details for out-of-spec temperatures before submitting.",
          tone: "warning",
        });
      }
      return false;
    }

    if (mode === "draft") {
      writeLocalDraft(currentUserId, tenantSlug, templateId, payloadWithMeta, draftAuditId);
    }

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);

      const res = await fetch(apiUrl("/api/audit/submit"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, templateId, payload: payloadWithMeta, mode, auditId: draftAuditId ?? undefined }),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          (typeof data?.error === "string" && data.error) ||
          (mode === "draft" ? "Saving draft failed" : "Submit failed");
        const error = new Error(message) as Error & { status?: number; code?: string };
        error.status = res.status;
        if (typeof data?.code === "string") {
          error.code = data.code;
        }
        throw error;
      }

      const json = (await res.json()) as { auditId: string };
      setDraftAuditId(json.auditId);

      if (mode === "draft") {
        writeLocalDraft(currentUserId, tenantSlug, templateId, payloadWithMeta, json.auditId);
        if (!silent) {
          setNotification({
            title: "Draft saved",
            message: "Your draft was saved successfully.",
            tone: "success",
          });
        }
        return true;
      }

      clearLocalDraft(currentUserId, tenantSlug, templateId);
      setDraftAuditId(null);
      router.push(`/${tenantSlug}/audits?status=SUBMITTED&notice=submitted&auditId=${encodeURIComponent(json.auditId)}`);
      return true;
    } catch (error: unknown) {
      const timedOut = isTimedOutRequest(error);
      const shouldQueue = allowQueue && (isNetworkFailure(error) || isOfflineQueueableServerError(error) || timedOut);
      if (!shouldQueue) {
        if (!silent) {
          setNotification({
            title: mode === "draft" ? "Draft save failed" : "Submission failed",
            message:
              (error as any)?.message ||
              (mode === "draft"
                ? "Could not save draft on server. Please retry."
                : "Could not submit on server. Please retry."),
            tone: "error",
          });
        }
        return false;
      }

      const queued = enqueueAuditSync({
        tenantSlug,
        templateId,
        payload: payloadWithMeta,
        mode,
        auditId: draftAuditId ?? undefined,
      });

      // Durable outbox copy (IndexedDB) so refresh/localStorage cleanup won't lose queued work.
      void dbEnqueueOutbox({
        tenantSlug,
        templateId,
        mode,
        auditId: draftAuditId ?? undefined,
        payload: payloadWithMeta,
      });
      if (!silent) {
        setNotification({
          title: mode === "draft" ? "Draft saved locally" : "Submission queued",
          message:
            mode === "draft"
              ? timedOut
                ? "The draft is stored locally and will finish syncing in the background."
                : "Your draft will sync automatically when the connection returns."
              : "Your submission will sync automatically when the connection returns.",
          tone: "warning",
        });
      }

      if (mode === "submit") {
        addOfflineSubmittedForm({
          queueId: queued.id,
          tenantSlug,
          templateId,
          templateTitle: effectiveSchema.title || "Form",
          payload: payloadWithMeta,
        });
        clearLocalDraft(currentUserId, tenantSlug, templateId);
        setDraftAuditId(null);
        writeQueuedNotice(tenantSlug, "Submission queued while offline. It will sync once connection is restored.");
        router.push(`/${tenantSlug}/audits?status=SUBMITTED&notice=queued-submit`);
      }

      return true;
    }
  }

  useEffect(() => {
    if (isLoadingDraft) return;
    if (form.formState.isSubmitting || isSavingDraft) return;
    if (!session?.access_token || !tenantSlug || !templateId) return;
    if (Date.now() < autoSavePauseUntilRef.current) return;

    if (!hasSeenUserEditRef.current) {
      hasSeenUserEditRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      if (autoSaveInFlightRef.current) return;
      const values = form.getValues();
      writeLocalDraft(currentUserId, tenantSlug, templateId, values, draftAuditId, { durable: false });

      autoSaveInFlightRef.current = true;
      setIsAutoSaving(true);
      try {
        const ok = await persistAudit(values, "draft", { silent: true, allowQueue: false });
        if (ok) setLastAutoSavedAt(Date.now());
        if (!ok) {
          // Back off autosave API retries when server is under pressure.
          autoSavePauseUntilRef.current = Date.now() + 30_000;
        }
      } finally {
        autoSaveInFlightRef.current = false;
        setIsAutoSaving(false);
      }
    }, 10_000);

    return () => window.clearTimeout(timeoutId);
  }, [watchedValues, form, isLoadingDraft, isSavingDraft, session?.access_token, tenantSlug, templateId, currentUserId, draftAuditId]);

  async function onSubmit(values: FormValues) {
    await persistAudit(values, "submit");
  }

  async function onSaveDraft() {
    setIsSavingDraft(true);
    try {
      const values = form.getValues();
      await persistAudit(values, "draft");
    } finally {
      setIsSavingDraft(false);
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-xl border border-foreground/20 bg-background p-4 shadow-sm sm:p-6"
    >
      {isLoadingDraft ? (
        <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/[0.03] px-3 py-2 text-sm text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading saved draft...
        </div>
      ) : null}

      {tenantName ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-foreground/20 bg-background">
              {tenantLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenantLogoUrl}
                  alt={`${tenantName} logo`}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <span className="text-sm font-semibold">{tenantName[0] ?? ""}</span>
              )}
            </div>
            <div className="flex flex-col leading-tight">
              <div className="text-sm font-semibold">{tenantName}</div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-xl font-semibold tracking-tight">{schema.title}</div>
            {activeStaffName ? (
              <div className="mt-1 text-xs text-foreground/70">Staff: {activeStaffName}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {visibleSections.map((section, idx) => {
        if (section.type === "fields") {
          return (
            <div
              key={`fields-${idx}`}
              className={`flex flex-col rounded-lg border border-foreground/15 bg-background ${styleTokens.section}`}
            >
              {section.title ? (
                section.title.trim().toLowerCase() !== "fields" && section.title.trim().toLowerCase() !== "metadata header" ? (
                  <div className="flex items-center justify-between gap-3 border-b border-foreground/10 pb-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      {section.title}
                    </div>
                  </div>
                ) : null
              ) : null}
              <div className={sectionColumnsClass(section.columns)}>
                {section.fields.map((field) => (
                  <div
                    key={field.id}
                    className={
                      field.type === "dynamic-table" || field.type === "photo" || field.type === "signature"
                        ? `md:[grid-column:1/-1] ${styleTokens.fieldCard}`
                        : styleTokens.fieldCard
                    }
                  >
                    <Field
                      field={field}
                      control={form.control}
                      register={form.register}
                      errors={form.formState.errors}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (section.type === "grid") {
          const key = section.id || "form_data";
          return (
            <GridField
              key={`grid-${key}-${idx}`}
              grid={section}
              formStyle={formStyle}
              name={key}
              control={form.control}
              register={form.register}
              errors={form.formState.errors}
              setValue={form.setValue}
              watch={form.watch}
            />
          );
        }

        return null;
      })}

      {temperatureAlerts.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-900">Out-of-spec temperature alert</div>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {temperatureAlerts.slice(0, 6).map((alert) => (
              <li key={alert.key}>
                {alert.label}: {alert.value}
                {alert.unit ? ` ${alert.unit === "F" ? "°F" : "°C"}` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-amber-900">Corrective action</label>
            <textarea
              className="min-h-24 w-full rounded-md border border-amber-300 bg-background p-2 text-sm"
              placeholder="Describe the corrective action taken"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-2 z-20 -mx-2 rounded-xl border border-foreground/15 bg-background/95 p-2 shadow-sm backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
        <div className="mr-auto text-xs text-foreground/60">
          {isAutoSaving ? "Auto-saving draft..." : lastAutoSavedAt ? `Auto-saved ${new Date(lastAutoSavedAt).toLocaleTimeString()}` : "Auto-save on"}
        </div>
        <button
          type="button"
          className="h-11 w-full rounded-md border border-foreground/20 px-4 text-foreground disabled:opacity-50 sm:h-12 sm:w-auto inline-flex items-center justify-center gap-2"
          onClick={onSaveDraft}
          disabled={isSavingDraft || form.formState.isSubmitting}
        >
          {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSavingDraft ? "Saving draft..." : "Save draft"}
        </button>
        <button
          type="submit"
          className="h-11 w-full rounded-md bg-foreground px-4 text-background disabled:opacity-50 sm:h-12 sm:w-auto inline-flex items-center justify-center gap-2"
          disabled={isSavingDraft || form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {form.formState.isSubmitting ? "Submitting..." : "Submit"}
        </button>
      </div>
      </div>

      <NotificationModal
        open={Boolean(notification)}
        title={notification?.title || ""}
        message={notification?.message || ""}
        tone={notification?.tone || "default"}
        onClose={() => setNotification(null)}
      />
    </form>
  );
}

function Field({
  field,
  control,
  register,
  errors,
}: {
  field: FieldDef;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;
  const lineInputClass =
    "h-10 w-full border-0 border-b border-foreground/25 bg-transparent px-1 text-sm outline-none focus:border-foreground/60";
  const lineSelectClass =
    "h-10 w-full border-0 border-b border-foreground/25 bg-transparent px-1 text-sm outline-none focus:border-foreground/60";
  const lineTextareaClass =
    "min-h-20 w-full resize-y border-0 border-b border-foreground/25 bg-transparent px-1 py-2 text-sm outline-none focus:border-foreground/60";

  if (field.type === "text") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="ml-1">*</span> : null}
        </label>
        {field.multiline ? (
          <textarea
            id={field.id}
            className={lineTextareaClass}
            placeholder={(field as any).placeholder || undefined}
            {...register(field.id)}
          />
        ) : (
          <input
            id={field.id}
            className={lineInputClass}
            placeholder={(field as any).placeholder || undefined}
            {...register(field.id)}
          />
        )}
        {field.helpText ? (
          <p className="text-sm text-foreground/70">{field.helpText}</p>
        ) : null}
        {errorMessage ? (
          <p className="text-sm text-red-700">{errorMessage}</p>
        ) : null}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="ml-1">*</span> : null}
        </label>
        <input
          id={field.id}
          type="date"
          className={lineInputClass}
          placeholder={(field as any).placeholder || undefined}
          {...register(field.id)}
        />
        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="ml-1">*</span> : null}
        </label>
        <input
          id={field.id}
          type="number"
          inputMode="decimal"
          step={typeof (field as any).step === "number" ? String((field as any).step) : "any"}
          className={lineInputClass}
          placeholder={(field as any).placeholder || undefined}
          {...register(field.id)}
        />
        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (field.type === "temp") {
    return <TempFieldInput field={field} control={control} errors={errors} />;
  }

  if (field.type === "photo") {
    return <PhotoFieldInput field={field} control={control} errors={errors} />;
  }

  if (field.type === "signature") {
    return <SignatureFieldInput field={field} control={control} errors={errors} />;
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="ml-1">*</span> : null}
        </label>
        <input
          id={field.id}
          type="checkbox"
          className="h-6 w-6 accent-foreground"
          {...register(field.id)}
        />
        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (field.type === "yesno") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="ml-1">*</span> : null}
        </label>
        <select
          id={field.id}
          className={lineSelectClass}
          {...register(field.id)}
        >
          <option value="">Select…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        {field.helpText ? <p className="text-sm text-foreground/70">{field.helpText}</p> : null}
        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (field.type === "time") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="ml-1">*</span> : null}
        </label>
        <input
          id={field.id}
          type="time"
          className={lineInputClass}
          {...register(field.id)}
        />
        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (field.type === "dynamic-table") {
    return <DynamicTableInput field={field} control={control} errors={errors} />;
  }

  return null;
}

function TempFieldInput({
  field,
  control,
  errors,
}: {
  field: TempField;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;
  const lineTempClass = "h-10 w-full border-0 border-b px-1 bg-transparent outline-none";

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={field.id}>
        {field.label}
        {field.required ? <span className="ml-1">*</span> : null}
      </label>
      <Controller
        control={control}
        name={field.id as never}
        render={({ field: rhfField }) => {
          const value = rhfField.value;
          const numeric = typeof value === "number" ? value : Number(value);
          const isAlertAbove =
            typeof field.alertAbove === "number" &&
            Number.isFinite(numeric) &&
            numeric > field.alertAbove;
          const isAlertBelow =
            typeof field.alertBelow === "number" &&
            Number.isFinite(numeric) &&
            numeric < field.alertBelow;

          const alert = isAlertAbove || isAlertBelow;

          return (
            <input
              id={field.id}
              inputMode="decimal"
              className={
                lineTempClass + " " + (alert ? "border-red-700" : "border-foreground/25")
              }
              value={typeof value === "number" ? String(value) : String(value ?? "")}
              onChange={(e) => rhfField.onChange(e.target.value)}
            />
          );
        }}
      />
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </div>
  );
}

function SignatureFieldInput({
  field,
  control,
  errors,
}: {
  field: { id: string; label: string; required?: boolean };
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;
  const sigRef = useRef<SignatureCanvas | null>(null);
  const hydratedValueRef = useRef<string | null>(null);
  const [SignatureCanvasInput, setSignatureCanvasInput] = useState<React.ComponentType<any> | null>(null);
  const currentValue = useWatch({ control, name: field.id as never }) as unknown;
  const savedDataUrl =
    typeof currentValue === "string" && currentValue.startsWith("data:image") ? currentValue : "";

  useEffect(() => {
    let alive = true;
    import("react-signature-canvas")
      .then((mod) => {
        if (!alive) return;
        setSignatureCanvasInput(() => mod.default as unknown as React.ComponentType<any>);
      })
      .catch(() => {
        if (!alive) return;
        setSignatureCanvasInput(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = sigRef.current;
    if (!canvas || !savedDataUrl) return;
    if (hydratedValueRef.current === savedDataUrl) return;

    const id = window.requestAnimationFrame(() => {
      try {
        canvas.fromDataURL(savedDataUrl);
        hydratedValueRef.current = savedDataUrl;
      } catch {
        // Ignore malformed data URLs and keep canvas editable.
      }
    });

    return () => window.cancelAnimationFrame(id);
  }, [savedDataUrl, SignatureCanvasInput]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{field.label}</label>
      <Controller
        control={control}
        name={field.id as never}
        render={({ field: rhfField }) => (
          <div className="rounded-md border border-foreground/20 bg-background p-2">
            {savedDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={savedDataUrl}
                alt={`${field.label} signature`}
                className="mb-2 h-20 w-full object-contain"
              />
            ) : null}
            {SignatureCanvasInput ? (
              <SignatureCanvasInput
                ref={(ref: SignatureCanvas | null) => {
                  sigRef.current = ref;
                }}
                penColor="black"
                canvasProps={{ className: "h-20 w-full" }}
                onEnd={() => {
                  const dataUrl = sigRef.current?.toDataURL("image/png") ?? "";
                  if (!dataUrl) return;
                  hydratedValueRef.current = dataUrl;
                  rhfField.onChange(dataUrl, { shouldDirty: true, shouldTouch: true });
                }}
              />
            ) : (
              <div className="h-20 animate-pulse rounded bg-foreground/5" />
            )}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="h-8 rounded-md border border-foreground/20 px-2.5 text-xs"
                onClick={() => {
                  sigRef.current?.clear();
                  hydratedValueRef.current = null;
                  rhfField.onChange("", { shouldDirty: true, shouldTouch: true });
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      />
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </div>
  );
}

function DynamicTableInput({
  field,
  control,
  errors,
}: {
  field: DynamicTableField;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;
  const { fields, append, remove } = useFieldArray({
    control,
    name: field.id as never,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium">{field.label}</label>
        <button
          type="button"
          className="h-10 rounded-md border border-foreground/20 px-3"
          onClick={() => append({})}
        >
          Add row
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-foreground/20">
        <table className="min-w-full text-sm">
          <thead className="bg-foreground/5">
            <tr>
              {field.columns.map((c) => (
                <th key={c.id} className="px-3 py-2 text-left font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-6 text-foreground/70"
                  colSpan={field.columns.length + 1}
                >
                  No rows yet
                </td>
              </tr>
            ) : null}

            {fields.map((row, rowIndex) => (
              <tr key={row.id} className="border-t border-foreground/10">
                {field.columns.map((c) => (
                  <td key={c.id} className="px-3 py-2">
                    <Controller
                      control={control}
                      name={`${field.id}.${rowIndex}.${c.id}` as never}
                      render={({ field: rhfField }) => (
                        <input
                          className="h-10 w-full rounded-md border border-foreground/20 bg-background px-2"
                          value={String(rhfField.value ?? "")}
                          onChange={(e) => rhfField.onChange(e.target.value)}
                        />
                      )}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="h-10 rounded-md border border-foreground/20 px-3"
                    onClick={() => remove(rowIndex)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </div>
  );
}

function PhotoFieldInput({
  field,
  control,
  errors,
}: {
  field: { id: string; label: string; required?: boolean };
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;
  const value = useWatch({ control, name: field.id as never }) as unknown;
  const photos = normalizePhotoValue(value);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!previewSrc) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewSrc]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={field.id}>
        {field.label}
        {field.required ? <span className="ml-1">*</span> : null}
      </label>
      <Controller
        control={control}
        name={field.id as never}
        render={({ field: rhfField }) => (
          <>
            <input
              id={field.id}
              type="file"
              accept="image/*"
              capture="environment"
              className="h-12 rounded-md border border-foreground/20 bg-background px-3 py-2"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const next = typeof reader.result === "string" ? reader.result : "";
                  if (!next) return;
                  const current = normalizePhotoValue(rhfField.value);
                  rhfField.onChange([...current, next]);
                };
                reader.readAsDataURL(file);
              }}
            />
            {photos.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <button
                    key={`${field.id}_${index}`}
                    type="button"
                    onClick={() => setPreviewSrc(photo)}
                    className="relative block w-16 overflow-hidden rounded-md border border-foreground/20"
                    title="Click to view full image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt={`${field.label} ${index + 1}`} className="h-14 w-16 object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                className="h-8 rounded-md border border-foreground/20 px-2 text-xs"
                onClick={() => rhfField.onChange([])}
              >
                Clear photos
              </button>
            </div>

            {previewSrc ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                onClick={() => setPreviewSrc(null)}
                role="dialog"
                aria-modal="true"
              >
                <div className="relative max-h-[90vh] w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs text-white"
                    onClick={() => setPreviewSrc(null)}
                  >
                    Close
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewSrc} alt={`${field.label} preview`} className="max-h-[90vh] w-full rounded-md object-contain" />
                </div>
              </div>
            ) : null}
          </>
        )}
      />
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </div>
  );
}
