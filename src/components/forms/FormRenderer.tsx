"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
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
} from "@/types/forms";
import { buildDefaultValues, buildZodSchema } from "@/lib/schemaDrivenForm";
import { NotificationModal } from "@/components/NotificationModal";
import { GridField } from "@/components/forms/GridField";
import { enqueueAuditSync } from "@/lib/client/auditSyncQueue";

type Props = {
  tenantSlug: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  templateId: string;
  schema: FormSchemaV1;
};

type FormValues = Record<string, unknown>;

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
  auditId?: string | null
) {
  try {
    localStorage.setItem(
      draftCacheKey(userId, tenantSlug, templateId),
      JSON.stringify({ ts: Date.now(), values, auditId: auditId || null })
    );
  } catch {
    // ignore
  }
}

function readLocalDraft(
  userId: string | null,
  tenantSlug: string,
  templateId: string
): { values: FormValues; auditId: string | null } | null {
  try {
    const raw = localStorage.getItem(draftCacheKey(userId, tenantSlug, templateId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { values?: FormValues; auditId?: string | null };
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.values || typeof parsed.values !== "object") return null;
    return { values: parsed.values, auditId: parsed.auditId || null };
  } catch {
    return null;
  }
}

export function FormRenderer({ tenantSlug, tenantName, tenantLogoUrl, templateId, schema }: Props) {
  const router = useRouter();
  const { session, user } = useAuth();
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [draftAuditId, setDraftAuditId] = useState<string | null>(null);
  const [activeStaffName, setActiveStaffName] = useState<string>("");
  const [notification, setNotification] = useState<{ title: string; message: string; tone?: "default" | "success" | "warning" | "error" } | null>(null);

  const zodSchema = useMemo(() => buildZodSchema(schema), [schema]);
  const defaultValues = useMemo(() => buildDefaultValues(schema), [schema]);

  const form = useForm<FormValues>({
    resolver: zodResolver(zodSchema),
    defaultValues,
    mode: "onBlur",
  });

  const sections: FormSection[] = Array.isArray(schema.sections) && schema.sections.length
    ? schema.sections
    : [{ type: "fields", fields: schema.fields ?? [] }];

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
    const local = readLocalDraft(user?.id || null, tenantSlug, templateId);
    if (!local) return;
    setDraftAuditId(local.auditId || null);
    form.reset({ ...defaultValues, ...local.values });
  }, [defaultValues, form, templateId, tenantSlug, user?.id]);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (!accessToken || !tenantSlug || !templateId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const local = readLocalDraft(user?.id || null, tenantSlug, templateId);
    if (local && shouldSkipDraftFetch(user?.id || null, tenantSlug, templateId, 5 * 60_000)) {
      return;
    }

    let controller: AbortController | null = null;
    let timeout: number | null = null;

    const runFetch = () => {
      const url = new URL("/api/audit/draft", window.location.origin);
      url.searchParams.set("tenantSlug", tenantSlug);
      url.searchParams.set("templateId", templateId);

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
            };
          };
        })
        .then((data) => {
          if (!data.draft) return;
          setDraftAuditId(data.draft.id);
          form.reset({ ...defaultValues, ...data.draft.payload });
          writeLocalDraft(user?.id || null, tenantSlug, templateId, data.draft.payload, data.draft.id);
          markDraftFetch(user?.id || null, tenantSlug, templateId);
        })
        .catch(() => {
          // Silent fallback: form starts from defaults when no draft is available.
        })
        .finally(() => {
          if (timeout !== null) window.clearTimeout(timeout);
          setIsLoadingDraft(false);
        });
    };

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
      controller?.abort();
    };
  }, [defaultValues, form, session?.access_token, templateId, tenantSlug, user?.id]);

  async function persistAudit(values: FormValues, mode: "submit" | "draft") {
    const accessToken = session?.access_token;
    if (!accessToken) {
      setNotification({
        title: "Sign in required",
        message: "Your session is missing or expired. Please sign in again to continue.",
        tone: "warning",
      });
      router.push("/login");
      return false;
    }

    if (mode === "draft") {
      writeLocalDraft(user?.id || null, tenantSlug, templateId, values, draftAuditId);
    }

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);

      const res = await fetch("/api/audit/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, templateId, payload: values, mode, auditId: draftAuditId ?? undefined }),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(mode === "draft" ? "Saving draft failed" : "Submit failed");
      }

      const json = (await res.json()) as { auditId: string };
      setDraftAuditId(json.auditId);

      if (mode === "draft") {
        writeLocalDraft(user?.id || null, tenantSlug, templateId, values, json.auditId);
        setNotification({
          title: "Draft saved",
          message: "Your draft was saved successfully.",
          tone: "success",
        });
        return true;
      }

      router.push(`/${tenantSlug}/audits/${json.auditId}`);
      return true;
    } catch {
      enqueueAuditSync({
        tenantSlug,
        templateId,
        payload: values,
        mode,
        auditId: draftAuditId ?? undefined,
      });
      setNotification({
        title: mode === "draft" ? "Draft queued" : "Submission queued",
        message:
          mode === "draft"
            ? "Your draft will sync automatically when the connection returns."
            : "Your submission will sync automatically when the connection returns.",
        tone: "warning",
      });
      return true;
    }
  }

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
      className="flex flex-col gap-6 rounded-xl border border-foreground/20 bg-background p-4 shadow-sm sm:p-6"
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
            <div key={`fields-${idx}`} className="flex flex-col gap-4 rounded-lg border border-foreground/15 bg-background p-4 sm:p-5">
              {section.title ? (
                <div className="text-sm font-semibold text-foreground/80">{section.title}</div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 md:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {section.fields.map((field) => (
                  <div
                    key={field.id}
                    className={
                      field.type === "dynamic-table"
                        ? "md:[grid-column:1/-1]"
                        : ""
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

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="h-12 rounded-md border border-foreground/20 px-4 text-foreground disabled:opacity-50"
          onClick={onSaveDraft}
          disabled={isSavingDraft || form.formState.isSubmitting}
        >
          {isSavingDraft ? "Saving draft..." : "Save draft"}
        </button>
        <button
          type="submit"
          className="h-12 rounded-md bg-foreground px-4 text-background disabled:opacity-50"
          disabled={isSavingDraft || form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Submitting..." : "Submit"}
        </button>
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
            className="min-h-24 rounded-md border border-foreground/20 bg-background p-3"
            placeholder={(field as any).placeholder || undefined}
            {...register(field.id)}
          />
        ) : (
          <input
            id={field.id}
            className="h-12 rounded-md border border-foreground/20 bg-background px-3"
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
          className="h-12 rounded-md border border-foreground/20 bg-background px-3"
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
          className="h-12 rounded-md border border-foreground/20 bg-background px-3"
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
          className="h-12 rounded-md border border-foreground/20 bg-background px-3"
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
                "h-12 rounded-md border px-3 bg-background " +
                (alert ? "border-red-700" : "border-foreground/20")
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
  const currentValue = useWatch({ control, name: field.id as never }) as unknown;

  useEffect(() => {
    const canvas = sigRef.current;
    if (!canvas) return;
    if (typeof currentValue !== "string" || !currentValue.startsWith("data:image")) return;

    // Rehydrate saved draft signature into the canvas when reopening the form.
    const id = window.requestAnimationFrame(() => {
      try {
        canvas.fromDataURL(currentValue);
      } catch {
        // Ignore malformed data URLs and keep canvas editable.
      }
    });

    return () => window.cancelAnimationFrame(id);
  }, [currentValue]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{field.label}</label>
      <Controller
        control={control}
        name={field.id as never}
        render={({ field: rhfField }) => (
          <div className="rounded-md border border-foreground/20 bg-background p-2">
            <SignatureCanvas
              ref={(ref) => {
                sigRef.current = ref;
              }}
              penColor="black"
              canvasProps={{ className: "h-20 w-full" }}
              onEnd={() => {
                const dataUrl = sigRef.current?.toDataURL("image/png") ?? "";
                rhfField.onChange(dataUrl);
              }}
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="h-8 rounded-md border border-foreground/20 px-2.5 text-xs"
                onClick={() => {
                  sigRef.current?.clear();
                  rhfField.onChange("");
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
