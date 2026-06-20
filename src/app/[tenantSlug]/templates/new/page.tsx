"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Eye, Laptop, Loader2, Sparkles } from "lucide-react";
import { CenteredOverlay } from "@/components/ui/CenteredOverlay";
import { useAuth } from "@/components/AuthProvider";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import { readWorkspaceCacheResolved, writeWorkspaceCache } from "@/lib/client/workspaceCache";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { FormTypePicker } from "@/components/forms/FormTypePicker";
import { AiFormChatModal, type AiChatMessage } from "@/components/forms/AiFormChatModal";
import { PlanLimitModal } from "@/components/plan/PlanLimitModal";
import { PlanLimitReachedError, isPlanLimitError } from "@/lib/planLimitErrors";
import {
  blankCanvasForType,
  getFormBuilderConfig,
  isSchemaEmpty,
  parseFormType,
} from "@/lib/formBuilderConfig";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { apiUrl } from "@/lib/client/apiBase";
import type { FieldDef, FormSchemaV1, FormSection, FormStyle, FormType } from "@/types/forms";
import { columnHeaderDisplayLabel, isColumnHeaderPlaceholder } from "@/lib/formFieldConstants";
import { displayFieldText, displayVariantClass } from "@/lib/displayFieldStyles";
import { writeAuditTemplateCache } from "@/lib/client/auditTemplateCache";
import {
  enqueueTemplateSync,
  flushTemplateSyncQueue,
  getPendingTemplateSyncCount,
} from "@/lib/client/templateSyncQueue";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import type { AiClarificationQuestion } from "@/lib/ai/types";
import { AI_WELCOME_MESSAGE } from "@/lib/ai/examplePrompts";
import type { ExamplePrompt } from "@/lib/ai/examplePrompts";

type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

type WorkspaceData = {
  categories: CategorySummary[];
  selectedCategoryId: string | null;
  templates?: Array<{
    id: string;
    title: string;
    updatedAt: string;
    categoryId: string | null;
  }>;
  tenant?: {
    slug: string;
    name?: string;
    logoUrl?: string | null;
  };
};

type WorkspaceCacheEnvelope = {
  ts: number;
  data: WorkspaceData;
};

type EditInfoResponse = {
  template: {
    id: string;
    title: string;
    categoryId: string | null;
    schema: { sections?: FormSection[]; fields?: any[]; title?: string; meta?: { templateVersion?: number; formType?: FormType; formStyle?: FormStyle; cardIcon?: string; cardColor?: string } };
    version: number;
  };
  lock: {
    hasAudits: boolean;
    auditCount: number;
  };
};

type FlatItem = {
  id: string;
  label: string;
  type: string;
  isActive: boolean;
  location: "field" | "column";
};

function schemaToSections(schema: { sections?: FormSection[]; fields?: any[] }): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", title: "Fields", fields: schema.fields ?? [] }];
}

function flattenSections(sections: FormSection[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const section of sections) {
    if (section.type === "fields") {
      for (const f of section.fields) {
        items.push({
          id: `field:${f.id}`,
          label: f.label || "Untitled field",
          type: f.type,
          isActive: f.isActive !== false,
          location: "field",
        });
      }
      continue;
    }
    for (const c of section.columns) {
      items.push({
        id: `column:${c.id}`,
        label: c.label || "Untitled column",
        type: c.type,
        isActive: c.isActive !== false,
        location: "column",
      });
    }
  }
  return items;
}

function patchWorkspaceTemplateCaches(
  userId: string | null,
  tenantSlug: string,
  nextTemplate: { id: string; title: string; categoryId: string | null; updatedAt: string }
) {
  if (!tenantSlug) return;

  const prefixV1 = `workspace-cache:v1:${tenantSlug}:`;
  const prefixV2 = `workspace-cache:v2:`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(prefixV1) || (key.startsWith(prefixV2) && key.includes(`:${tenantSlug}:`))) keys.push(key);
  }

  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const envelope = JSON.parse(raw) as WorkspaceCacheEnvelope;
      if (!envelope?.data) continue;

      const currentTemplates = Array.isArray(envelope.data.templates)
        ? envelope.data.templates
        : [];

      const withoutOld = currentTemplates.filter((t) => t.id !== nextTemplate.id);

      const selected = envelope.data.selectedCategoryId;
      const shouldInclude = selected ? selected === nextTemplate.categoryId : true;
      const nextTemplates = shouldInclude
        ? [nextTemplate, ...withoutOld].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
        : withoutOld;

      // write updated templates into v1 and any matching v2 caches
      writeWorkspaceCache(userId, tenantSlug, selected, {
        ...envelope.data,
        templates: nextTemplates,
      } as import("@/lib/client/workspaceCache").WorkspaceData);
    } catch {
      // ignore malformed cache items
    }
  }
}

function buildLocalTemplateId() {
  return `local_tmpl_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function buildId(prefix: string) {
  try {
    const cryptoAny = crypto as unknown as { randomUUID?: () => string };
    if (cryptoAny?.randomUUID) return `${prefix}_${cryptoAny.randomUUID()}`;
  } catch {
    // ignore
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function writeWorkspaceNotice(message: string, tone: "default" | "success" | "warning" | "error" = "default") {
  try {
    localStorage.setItem(
      "workspace-notice:v1",
      JSON.stringify({ message, tone, ts: Date.now() })
    );
  } catch {
    // ignore storage failures
  }
}

function cacheTemplateSchemaForOffline(
  userId: string | null,
  tenantSlug: string,
  templateId: string,
  title: string,
  sections: FormSection[],
  categoryId: string | null,
  fallbackTenantName: string
) {
  const selectedCache = readWorkspaceCacheResolved(userId, tenantSlug, categoryId);
  const allCache = readWorkspaceCacheResolved(userId, tenantSlug, null);
  const tenant = selectedCache?.tenant || allCache?.tenant || { slug: tenantSlug, name: fallbackTenantName, logoUrl: null };

  writeAuditTemplateCache(tenantSlug, templateId, {
    tenant: {
      slug: tenant.slug,
      name: tenant.name || fallbackTenantName,
      logoUrl: tenant.logoUrl ?? null,
    },
    template: {
      id: templateId,
      title,
      schema: {
        version: 1,
        title,
        sections,
      },
      updatedAt: new Date().toISOString(),
    },
  });
}

function previewFieldInput(type: FieldDef["type"]) {
  if (type === "display") {
    return (
      <div className="rounded-md border border-dashed border-foreground/25 bg-foreground/[0.03] px-2 py-1.5 text-xs italic text-foreground/60">
        Read-only label (instructions / form code)
      </div>
    );
  }
  if (type === "yesno") {
    return (
      <select className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm">
        <option>Yes / No</option>
      </select>
    );
  }
  if (type === "checkbox") {
    return <input type="checkbox" className="h-5 w-5 accent-foreground" />;
  }
  if (type === "signature") {
    return (
      <div className="flex h-10 items-center rounded-md border border-foreground/20 bg-foreground/[0.03] px-3 text-xs text-foreground/60">
        Signature area
      </div>
    );
  }
  if (type === "photo") {
    return (
      <div className="flex h-10 items-center rounded-md border border-foreground/20 bg-foreground/[0.03] px-3 text-xs text-foreground/60">
        Photo capture
      </div>
    );
  }
  if (type === "date") {
    return <input type="date" className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm" />;
  }
  if (type === "time") {
    return <input type="time" className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm" />;
  }
  if (type === "number" || type === "temp") {
    return <input type="number" className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm" />;
  }
  return <input type="text" className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm" />;
}

function FormPreviewBody({
  title,
  sections,
  maxHeightClass = "max-h-[78vh]",
}: {
  title: string;
  sections: FormSection[];
  maxHeightClass?: string;
}) {
  return (
    <div className={`overflow-auto ${maxHeightClass} p-4`}>
      <div className="mx-auto w-full max-w-4xl rounded-lg border border-foreground/20 bg-background p-5 shadow-sm">
        <div className="text-center text-xl font-semibold">{title || "Untitled form"}</div>
        <div className="mt-4 space-y-4">
          {sections.map((section, idx) =>
            section.type === "fields" ? (
              <section key={`pv-f-${idx}`} className="rounded-md border border-foreground/15 p-3">
                {section.title ? (
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                    {section.title}
                  </div>
                ) : null}
                <div
                  className={
                    "grid gap-3 " +
                    (section.columns === 4
                      ? "md:grid-cols-4"
                      : section.columns === 3
                        ? "md:grid-cols-3"
                        : section.columns === 2
                          ? "md:grid-cols-2"
                          : "md:grid-cols-1")
                  }
                >
                  {section.fields.map((field) => (
                    <div
                      key={field.id}
                      className={field.type === "display" ? "space-y-1 md:col-span-full" : "space-y-1"}
                    >
                      {field.type === "display" ? (
                        <div
                          className={
                            "rounded-md border border-foreground/10 px-2 py-1.5 text-sm " +
                            displayVariantClass((field as import("@/types/forms").DisplayField).variant || "body")
                          }
                        >
                          {displayFieldText(field as import("@/types/forms").DisplayField)}
                        </div>
                      ) : (
                        <>
                          <div className="text-xs font-medium text-foreground/70">{field.label}</div>
                          {previewFieldInput(field.type)}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section key={`pv-g-${idx}`} className="rounded-md border border-foreground/15 p-3">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  {section.title || "Log Sheet"}
                </div>
                <div className="overflow-x-auto rounded-md border border-foreground/15">
                  <table className="w-full min-w-max border-collapse text-xs">
                    <thead>
                      <tr>
                        {section.columns.map((col) => (
                          <th
                            key={col.id}
                            className={
                              "border-b border-r border-foreground/15 px-2 py-2 text-left " +
                              (isColumnHeaderPlaceholder(col.label) ? "italic text-foreground/45" : "")
                            }
                          >
                            {columnHeaderDisplayLabel(col.label)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({
                        length: Math.min(typeof section.rows === "number" ? section.rows : 3, 5),
                      }).map((_, rowIdx) => (
                        <tr key={`pv-row-${rowIdx}`}>
                          {section.columns.map((col) => (
                            <td key={`${rowIdx}-${col.id}`} className="border-b border-r border-foreground/10 px-2 py-2">
                              {col.type === "checkbox" ? "[ ]" : col.type === "signature" ? "Sign" : "..."}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function FormStructurePreview({
  open,
  onClose,
  title,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sections: FormSection[];
}) {
  return (
    <CenteredOverlay open={open} onClose={onClose} maxWidthClass="max-w-5xl">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Form preview</div>
            <div className="text-xs text-foreground/70">How your final form structure will look</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <FormPreviewBody title={title} sections={sections} />
      </div>
    </CenteredOverlay>
  );
}

export default function NewTemplatePage() {
  return (
    <SearchParamsBoundary>
      <NewTemplatePageInner />
    </SearchParamsBoundary>
  );
}

function NewTemplatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ tenantSlug: string }>();
  const routeSlug = params?.tenantSlug || "";
  const requestedCategoryId = searchParams.get("categoryId");
  const editTemplateId = searchParams.get("editTemplateId");
  const isEditMode = Boolean(editTemplateId);

  const { user, session, loading: authLoading } = useAuth();
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const userId = user?.id || session?.user?.id || null;
  const accessToken = session?.access_token || "";
  const offline = useAppOffline();

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiImageFile, setAiImageFile] = useState<File | null>(null);
  const [aiStep, setAiStep] = useState<"input" | "clarify">("input");
  const [aiQuestions, setAiQuestions] = useState<AiClarificationQuestion[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [aiAssessSummary, setAiAssessSummary] = useState("");
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiQuota, setAiQuota] = useState<{
    used: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
  } | null>(null);
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [planLimitDetails, setPlanLimitDetails] = useState<{
    used?: number;
    limit?: number;
  }>({});
  const [loadingEditInfo, setLoadingEditInfo] = useState(false);
  const [error, setError] = useState<string>("");

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [title, setTitle] = useState("Add form title");
  const [sections, setSections] = useState<FormSection[]>([]);
  const [formType, setFormType] = useState<FormType>("custom");
  const [formStyle, setFormStyle] = useState<FormStyle>("default");
  const [cardIcon, setCardIcon] = useState("clipboard");
  const [cardColor, setCardColor] = useState("default");
  const [schemaMeta, setSchemaMeta] = useState<Record<string, unknown>>({});
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showFormTypeModal, setShowFormTypeModal] = useState(false);
  const [showAiCompleteModal, setShowAiCompleteModal] = useState(false);
  const [aiCompleteStep, setAiCompleteStep] = useState<"success" | "preview">("success");
  const [online, setOnline] = useState(true);
  const [builderBlockedSmallScreen, setBuilderBlockedSmallScreen] = useState(false);

  const [baseSections, setBaseSections] = useState<FormSection[]>([]);
  const [baseVersion, setBaseVersion] = useState(1);
  const [hasAudits, setHasAudits] = useState(false);
  const [auditCount, setAuditCount] = useState(0);
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [builderResetKey, setBuilderResetKey] = useState("create-initial");
  const [queuedTemplateSaves, setQueuedTemplateSaves] = useState(0);
  const [offlineDraftTemplateId, setOfflineDraftTemplateId] = useState<string | null>(null);

  function welcomeAiMessages(): AiChatMessage[] {
    return [{ id: "welcome", role: "assistant", content: AI_WELCOME_MESSAGE }];
  }

  if (offline) {
    return (
      <OfflineRouteBlock
        title="Create form needs internet"
        message="The form builder must load and sync schema data from the database before it can be used. Connect once to create forms, then the cached workspace can open them offline."
        backHref={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
        backLabel="Back to workspace"
      />
    );
  }

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const lockedFieldIds = useMemo(() => {
    if (!hasAudits) return [] as string[];
    return flattenSections(baseSections)
      .filter((i) => i.location === "field")
      .map((i) => i.id.replace("field:", ""));
  }, [baseSections, hasAudits]);

  const lockedGridColumnIds = useMemo(() => {
    if (!hasAudits) return [] as string[];
    return flattenSections(baseSections)
      .filter((i) => i.location === "column")
      .map((i) => i.id.replace("column:", ""));
  }, [baseSections, hasAudits]);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    setQueuedTemplateSaves(getPendingTemplateSyncCount());
  }, []);

  useEffect(() => {
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const update = () => setBuilderBlockedSmallScreen(mediaQuery.matches);
    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const flush = async () => {
      const result = await flushTemplateSyncQueue(accessToken).catch(() => ({ processed: 0, remaining: getPendingTemplateSyncCount() }));
      setQueuedTemplateSaves(result.remaining);
    };

    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!tenantSlug) {
      setCategories([]);
      setSelectedCategoryId(null);
      setWorkspaceLoading(false);
      setError("Brand not found. Open the form builder from your workspace so the correct brand is selected.");
      return;
    }

    const cached = readWorkspaceCacheResolved(userId, tenantSlug, requestedCategoryId);
    if (cached) {
      setCategories(cached.categories || []);
      setSelectedCategoryId(cached.selectedCategoryId);
      setWorkspaceLoading(false);
      setError("");
      if (!online) return;
    }

    if (!online) {
      if (!cached) {
        setCategories([]);
        setSelectedCategoryId(null);
        setWorkspaceLoading(false);
        setError("Offline mode: categories are unavailable until this brand is opened once online.");
      }
      return;
    }

    if (!accessToken) return;

    setWorkspaceLoading(true);
    setError("");

    const url = new URL(apiUrl("/api/workspace"));
    url.searchParams.set("tenantSlug", tenantSlug);
    if (requestedCategoryId) url.searchParams.set("categoryId", requestedCategoryId);

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load categories (${res.status})`);
        return data as WorkspaceData;
      })
      .then((data) => {
        setCategories(data.categories || []);
        setSelectedCategoryId(data.selectedCategoryId);
      })
      .catch((err) => {
        if (!cached) {
          setError(err?.message || "Failed to load categories");
          setCategories([]);
          setSelectedCategoryId(null);
        }
      })
      .finally(() => setWorkspaceLoading(false));
  }, [authLoading, user, userId, accessToken, tenantSlug, requestedCategoryId, online]);

  useEffect(() => {
    if (!isEditMode) return;
    if (authLoading || !user) return;
    if (!tenantSlug || !editTemplateId) return;

    if (!online) {
      setLoadingEditInfo(false);
      setError("Offline mode: opening existing form versions for editing requires a prior online load.");
      return;
    }

    if (!accessToken) return;

    setLoadingEditInfo(true);
    setError("");

    const url = new URL(apiUrl("/api/templates/edit-info"));
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("templateId", editTemplateId);

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load template (${res.status})`);
        return data as EditInfoResponse;
      })
      .then((data) => {
        const loadedSections = schemaToSections(data.template.schema);
        const nextMeta = data.template.schema?.meta && typeof data.template.schema.meta === "object"
          ? (data.template.schema.meta as Record<string, unknown>)
          : {};
        setTitle(data.template.title || data.template.schema.title || "Add form title");
        setSelectedCategoryId(data.template.categoryId ?? null);
        setSections(loadedSections);
        setSchemaMeta(nextMeta);
        setFormType(parseFormType(nextMeta.formType));
        setFormStyle((nextMeta.formStyle as FormStyle) || "default");
        setCardIcon(typeof nextMeta.cardIcon === "string" ? nextMeta.cardIcon : "clipboard");
        setCardColor(typeof nextMeta.cardColor === "string" ? nextMeta.cardColor : "default");
        setBaseSections(loadedSections);
        setBaseVersion(data.template.version || 1);
        setHasAudits(data.lock.hasAudits);
        setAuditCount(data.lock.auditCount);
        setBuilderResetKey(`edit-${data.template.id}-${Date.now()}`);
      })
      .catch((err) => setError(err?.message || "Failed to load template"))
      .finally(() => setLoadingEditInfo(false));
  }, [isEditMode, authLoading, user, accessToken, tenantSlug, editTemplateId, online]);

  async function handleSave(): Promise<boolean> {
    if (!tenantSlug) return false;

    setSaving(true);
    setError("");

    try {
      const schema = {
        version: 1 as const,
        title,
        sections,
        meta: {
          ...schemaMeta,
          formType,
          formStyle,
          cardIcon,
          cardColor,
        },
      };

      const endpoint = apiUrl(isEditMode ? "/api/templates/save-changes" : "/api/templates/create");

      const payload = {
        tenantSlug,
        templateId: editTemplateId,
        title,
        categoryId: selectedCategoryId,
        schema,
      };

      if (!accessToken || !navigator.onLine) {
        const localTemplateId = isEditMode
          ? editTemplateId || ""
          : offlineDraftTemplateId || buildLocalTemplateId();
        if (!isEditMode && !offlineDraftTemplateId && localTemplateId) {
          setOfflineDraftTemplateId(localTemplateId);
        }
        enqueueTemplateSync({
          mode: isEditMode ? "save-changes" : "create",
          payload: {
            ...payload,
            templateId: localTemplateId || payload.templateId,
          },
        });
        setQueuedTemplateSaves(getPendingTemplateSyncCount());
        if (localTemplateId) {
          patchWorkspaceTemplateCaches(userId, tenantSlug, {
            id: localTemplateId,
            title,
            categoryId: selectedCategoryId ?? null,
            updatedAt: new Date().toISOString(),
          });
          cacheTemplateSchemaForOffline(
            userId,
            tenantSlug,
            localTemplateId,
            title,
            sections,
            selectedCategoryId ?? null,
            "Workspace"
          );
        }
        setError("Saved offline. Your form changes are queued and will sync automatically when online.");
        writeWorkspaceNotice("Form saved offline. It will sync automatically when internet returns.", "warning");
        const next = new URLSearchParams();
        next.set("tenantSlug", tenantSlug);
        if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
        router.push(`/workspace?${next.toString()}`);
        return true;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);

      const savedTemplateId = (data?.templateId as string | undefined) || editTemplateId || "";
      if (savedTemplateId) {
        patchWorkspaceTemplateCaches(userId, tenantSlug, {
          id: savedTemplateId,
          title,
          categoryId: selectedCategoryId ?? null,
          updatedAt: new Date().toISOString(),
        });
      }

      // Clear all workspace caches for this tenant to force fresh data
      try {
        const userId = user?.id ?? null;
        const prefix = `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // ignore cache clear failures
      }

      writeWorkspaceNotice(isEditMode ? "Form changes saved." : "Form created successfully.", "success");
      const next = new URLSearchParams();
      next.set("tenantSlug", tenantSlug);
      if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
      next.set("refresh", "1");
      router.push(`/workspace?${next.toString()}`);
      return true;
    } catch (err: any) {
      const msg = String(err?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        const localTemplateId = isEditMode
          ? editTemplateId || ""
          : offlineDraftTemplateId || buildLocalTemplateId();
        if (!isEditMode && !offlineDraftTemplateId && localTemplateId) {
          setOfflineDraftTemplateId(localTemplateId);
        }
        const schema = {
          version: 1 as const,
          title,
          sections,
          meta: {
            ...schemaMeta,
            formType,
            formStyle,
            cardIcon,
            cardColor,
          },
        };
        enqueueTemplateSync({
          mode: isEditMode ? "save-changes" : "create",
          payload: {
            tenantSlug,
            templateId: localTemplateId || editTemplateId,
            title,
            categoryId: selectedCategoryId,
            schema,
          },
        });
        setQueuedTemplateSaves(getPendingTemplateSyncCount());
        if (localTemplateId) {
          patchWorkspaceTemplateCaches(userId, tenantSlug, {
            id: localTemplateId,
            title,
            categoryId: selectedCategoryId ?? null,
            updatedAt: new Date().toISOString(),
          });
          cacheTemplateSchemaForOffline(
            userId,
            tenantSlug,
            localTemplateId,
            title,
            sections,
            selectedCategoryId ?? null,
            "Workspace"
          );
        }
        setError("Offline detected. Your form changes were queued and will sync automatically.");
        writeWorkspaceNotice("Offline detected. Form changes were queued and will sync automatically.", "warning");
        const next = new URLSearchParams();
        next.set("tenantSlug", tenantSlug);
        if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
        router.push(`/workspace?${next.toString()}`);
        return true;
      }
      setError(err?.message || "Failed to save template");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function applyImportedSchema(
    data: { title?: string; sections?: FormSection[]; schema?: FormSchemaV1 },
    resetKeyPrefix: string,
  ) {
    const schema = data.schema;
    const importedSections: FormSection[] = Array.isArray(data?.sections)
      ? (data.sections as FormSection[])
      : Array.isArray(schema?.sections)
        ? schema.sections
        : [{ type: "fields", title: "Fields", fields: [] }];

    const meta =
      schema?.meta && typeof schema.meta === "object" && !Array.isArray(schema.meta)
        ? schema.meta
        : {};
    const nextFormType = parseFormType(meta.formType);

    setTitle((data?.title as string) || schema?.title || "Imported Form");
    setSections(importedSections);
    setFormType(nextFormType);
    setFormStyle((meta.formStyle as FormStyle) || "default");
    setCardIcon(typeof meta.cardIcon === "string" ? meta.cardIcon : getFormBuilderConfig(nextFormType).cardIcon);
    setCardColor(typeof meta.cardColor === "string" ? meta.cardColor : "default");
    setSchemaMeta({});
    setBaseSections(importedSections);
    setBuilderResetKey(`${resetKeyPrefix}-${Date.now()}`);
    setShowFormPreview(false);
  }

  function resetAiModalState() {
    setAiStep("input");
    setAiQuestions([]);
    setAiAnswers({});
    setAiAssessSummary("");
    setAiPrompt("");
    setAiImageFile(null);
    setAiMessages(welcomeAiMessages());
  }

  async function postAiGenerate(formData: FormData) {
    const res = await fetch(apiUrl("/api/templates/ai-generate"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 402) {
        const quota = data?.quota as { used?: number; limit?: number } | undefined;
        throw new PlanLimitReachedError(
          "ai_quota",
          data?.error || "AI form limit reached for this month.",
          {
            used: quota?.used,
            limit: quota?.limit,
            tenantSlug,
          },
        );
      }
      if (res.status === 404) {
        throw new Error(
          "AI endpoint not found on this server. Use localhost:3000 for local dev, or deploy the latest code to Azure and add GEMINI_API_KEY there.",
        );
      }
      throw new Error(data?.error || `AI request failed (${res.status})`);
    }
    if (data?.quota) {
      setAiQuota(data.quota);
    }
    return data;
  }

  async function refreshAiQuota(): Promise<boolean> {
    if (!accessToken || !tenantSlug) return true;
    try {
      const res = await fetch(
        apiUrl(`/api/workspace/storage?tenantSlug=${encodeURIComponent(tenantSlug)}`),
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return true;
      const q = data.aiQuota as {
        used: number;
        limit: number;
        remaining: number;
        unlimited: boolean;
      };
      if (q) setAiQuota(q);
      if (q && !q.unlimited && q.remaining <= 0) {
        setPlanLimitDetails({ used: q.used, limit: q.limit });
        setPlanLimitOpen(true);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  function handlePlanLimit(err: unknown) {
    if (!isPlanLimitError(err)) return false;
    setPlanLimitDetails({ used: err.details.used, limit: err.details.limit });
    setPlanLimitOpen(true);
    return true;
  }

  function buildAiFormData(options: { phase: "assess" | "generate"; answers?: Record<string, string> }) {
    const formData = new FormData();
    formData.set("tenantSlug", tenantSlug);
    formData.set("phase", options.phase);
    const prompt = aiPrompt.trim();
    if (prompt) formData.set("prompt", prompt);
    if (aiImageFile) formData.set("file", aiImageFile);
    if (options.answers && Object.keys(options.answers).length) {
      formData.set("answers", JSON.stringify(options.answers));
    }
    return formData;
  }

  function finishAiGeneration() {
    setShowAiGenerate(false);
    resetAiModalState();
    setAiCompleteStep("success");
    setShowAiCompleteModal(true);
  }

  async function continueAiFlow() {
    if (!accessToken || !tenantSlug) return;

    const prompt = aiPrompt.trim();
    if (!prompt && !aiImageFile) {
      setError("Describe your form, attach a photo/PDF, or both.");
      return;
    }

    const displayContent =
      prompt || (aiImageFile ? `Attached ${aiImageFile.name}` : "");

    setAiMessages((prev) => [
      ...prev.filter((m) => !m.isTyping),
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: displayContent,
        attachmentName: aiImageFile?.name,
      },
      { id: "typing", role: "assistant", content: "", isTyping: true },
    ]);

    setGeneratingAi(true);
    setError("");
    try {
      const assessment = await postAiGenerate(buildAiFormData({ phase: "assess" }));

      setAiMessages((prev) => prev.filter((m) => !m.isTyping));

      if (assessment.status === "needs_clarification" && Array.isArray(assessment.questions) && assessment.questions.length) {
        const questions = assessment.questions as AiClarificationQuestion[];
        const initialAnswers: Record<string, string> = {};
        questions.forEach((q) => {
          if (q.defaultValue) initialAnswers[q.id] = q.defaultValue;
        });
        setAiQuestions(questions);
        setAiAnswers(initialAnswers);
        const summary = typeof assessment.summary === "string" ? assessment.summary : "";
        setAiAssessSummary(summary);
        setAiMessages((prev) => [
          ...prev,
          {
            id: `clarify-${Date.now()}`,
            role: "assistant",
            content: summary || "I need a few more details before I build your draft:",
          },
        ]);
        setAiStep("clarify");
        return;
      }

      setAiMessages((prev) => [
        ...prev,
        { id: `ready-${Date.now()}`, role: "assistant", content: "Building your form draft…" },
      ]);

      const generated = await postAiGenerate(buildAiFormData({ phase: "generate" }));
      applyImportedSchema(generated, "ai-generate");
      finishAiGeneration();
    } catch (err: unknown) {
      if (handlePlanLimit(err)) {
        setAiMessages((prev) => prev.filter((m) => !m.isTyping));
        return;
      }
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setAiMessages((prev) => [
        ...prev.filter((m) => !m.isTyping),
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: message,
        },
      ]);
      setError(message);
    } finally {
      setGeneratingAi(false);
    }
  }

  async function generateWithAiAnswers() {
    if (!accessToken || !tenantSlug) return;

    const unanswered = aiQuestions.filter((q) => !(aiAnswers[q.id] || "").trim());
    if (unanswered.length) {
      setError(`Please answer: ${unanswered[0]?.question || "all questions"}`);
      return;
    }

    const answerSummary = aiQuestions
      .map((q) => `${q.question} → ${aiAnswers[q.id]}`)
      .join("\n");

    setAiMessages((prev) => [
      ...prev,
      { id: `answers-${Date.now()}`, role: "user", content: answerSummary },
      { id: "typing", role: "assistant", content: "", isTyping: true },
    ]);

    setGeneratingAi(true);
    setError("");
    try {
      const generated = await postAiGenerate(
        buildAiFormData({ phase: "generate", answers: aiAnswers }),
      );
      applyImportedSchema(generated, "ai-generate");
      finishAiGeneration();
    } catch (err: unknown) {
      if (handlePlanLimit(err)) {
        setAiMessages((prev) => prev.filter((m) => !m.isTyping));
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to generate form. Please try again.";
      setAiMessages((prev) => [
        ...prev.filter((m) => !m.isTyping),
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: message,
        },
      ]);
      setError(message);
    } finally {
      setGeneratingAi(false);
    }
  }

  function handleAiExampleSelect(example: ExamplePrompt) {
    setAiPrompt(example.prompt);
  }

  function handleAiBack() {
    setAiStep("input");
    setAiQuestions([]);
    setAiAnswers({});
    setAiAssessSummary("");
  }
  async function openAiGenerateModal() {
    setError("");
    resetAiModalState();
    const allowed = await refreshAiQuota();
    if (!allowed) return;
    setShowAiGenerate(true);
  }

  function closeAiGenerateModal() {
    if (generatingAi) return;
    setShowAiGenerate(false);
    resetAiModalState();
  }

  const disableSave = saving || workspaceLoading || loadingEditInfo || !title.trim() || builderBlockedSmallScreen;

  function handleFormTypeChange(next: FormType) {
    if (next === formType) return;
    if (!isSchemaEmpty(sections)) {
      const ok = window.confirm(
        "Switching form type clears the canvas and starts a fresh blank layout for that type. Continue?"
      );
      if (!ok) return;
    }
    setFormType(next);
    setCardIcon(getFormBuilderConfig(next).cardIcon);
    setSections(blankCanvasForType(next));
    setBuilderResetKey(`type-${next}-${Date.now()}`);
  }

  return (
    <div className="relative min-h-dvh">
      {error ? (
        <div className="fixed right-6 top-20 z-40 max-w-[calc(100vw-2rem)] rounded-md border border-foreground/20 bg-background/95 px-2 py-1 text-xs shadow-sm">
          {error}
        </div>
      ) : null}

      {queuedTemplateSaves > 0 ? (
        <div className="fixed left-6 right-6 top-20 z-20 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 shadow-sm">
          {queuedTemplateSaves} form change{queuedTemplateSaves === 1 ? "" : "s"} queued for sync. They will upload automatically when connection returns.
        </div>
      ) : null}

      {isEditMode && hasAudits ? (
        <div className="fixed left-6 right-6 top-20 z-30 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-semibold">Compliance Warning</div>
              <div>
                This form has existing submissions ({auditCount}). Changes will be saved as a new version. Existing fields/columns cannot be deleted, but can be hidden.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-visible">
        <div className="grid grid-cols-1">
          <div className="min-w-0">
            <div className="sticky top-0 z-20 border-b border-foreground/10 bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/[0.03] px-3 text-xs font-medium text-foreground hover:bg-foreground/[0.06] disabled:opacity-50"
                  disabled={saving || loadingEditInfo}
                  onClick={() => setShowFormTypeModal(true)}
                >
                  {getFormBuilderConfig(formType).label}
                  <ChevronDown className="h-3.5 w-3.5 text-foreground/50" />
                </button>

                <label className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/[0.03] px-2 text-xs">
                  <span className="pl-1 text-foreground/55">Style</span>
                  <select
                    className="h-6 rounded-md border-0 bg-transparent pr-1 text-xs font-medium text-foreground focus:outline-none"
                    value={formStyle}
                    onChange={(e) => setFormStyle(e.target.value as FormStyle)}
                    disabled={saving || loadingEditInfo}
                  >
                    <option value="default">Default</option>
                    <option value="compact">Compact</option>
                    <option value="report">Report</option>
                  </select>
                </label>

                <div className="flex-1" />

                {!isEditMode ? (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] px-3 text-xs font-medium text-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_14%,white)] disabled:opacity-50"
                    disabled={generatingAi || saving || workspaceLoading}
                    onClick={() => void openAiGenerateModal()}
                  >
                    {generatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generatingAi ? "Working…" : "Create with AI"}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-xs font-medium text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"
                  onClick={() => setShowFormPreview(true)}
                  disabled={workspaceLoading || builderBlockedSmallScreen}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>

                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                  onClick={() => setShowSaveConfirm(true)}
                  disabled={disableSave}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {saving ? "Saving…" : isEditMode ? "Save changes" : "Save form"}
                </button>
              </div>
            </div>

            <FormBuilder
              onChangeSections={setSections}
              initialSections={sections}
              title={title}
              onTitleChange={setTitle}
              formType={formType}
              lockExistingDeletes={hasAudits}
              lockedFieldIds={lockedFieldIds}
              lockedGridColumnIds={lockedGridColumnIds}
              resetKey={builderResetKey}
            />
            {builderBlockedSmallScreen ? (
              <CenteredOverlay open maxWidthClass="max-w-md" zIndexClass="z-[85]" onClose={() => {}}>
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/20 bg-foreground/[0.03]">
                      <Laptop className="h-5 w-5 text-foreground/70" />
                    </div>
                    <div>
                      <div className="text-base font-semibold">Builder needs a bigger screen</div>
                      <div className="mt-1 text-sm text-foreground/70">
                        For accurate table/header editing, use a tablet or laptop. This keeps the builder simple and reliable for non-technical users.
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <Link
                      href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                    >
                      Back to forms
                    </Link>
                  </div>
                </div>
              </CenteredOverlay>
            ) : null}
          </div>
        </div>
      </div>

      <FormStructurePreview
        open={showFormPreview}
        onClose={() => setShowFormPreview(false)}
        title={title}
        sections={sections}
      />

      {showSaveConfirm ? (
        <CenteredOverlay
          open
          maxWidthClass="max-w-md"
          onClose={() => {
            if (!saving) setShowSaveConfirm(false);
          }}
        >
          <div className="p-4">
            <div className="text-sm font-semibold">
              {isEditMode ? "Confirm template update" : "Confirm form details"}
            </div>
            <div className="mt-1 text-xs text-foreground/70">
              {isEditMode
                ? hasAudits
                  ? `This will create version v${baseVersion + 1} and keep v${baseVersion} for historical reports.`
                  : "No submissions found. This will overwrite the current version directly."
                : "Confirm the category and form title before saving."}
            </div>
            <div className="mt-2">
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-3 text-xs"
                onClick={() => setShowFormPreview(true)}
                disabled={saving}
              >
                <Eye className="mr-1 h-3.5 w-3.5" />
                Preview current form
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Form title</label>
                <input
                  className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Form title"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Category</label>
                <select
                  className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                  value={selectedCategoryId ?? ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                  disabled={workspaceLoading || saving}
                >
                  <option value="">Uncategorized</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <details className="rounded-md border border-foreground/15 bg-foreground/[0.02] p-3">
                <summary className="cursor-pointer text-xs font-semibold text-foreground/70">
                  Optional card appearance
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground/70">Card icon</label>
                    <select
                      className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                      value={cardIcon}
                      onChange={(e) => setCardIcon(e.target.value)}
                      disabled={saving}
                    >
                      <option value="clipboard">Clipboard</option>
                      <option value="checklist">Checklist</option>
                      <option value="safety">Safety</option>
                      <option value="cleaning">Cleaning</option>
                      <option value="inventory">Inventory</option>
                      <option value="staff">Staff</option>
                      <option value="food">Food</option>
                      <option value="temperature">Temperature</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground/70">Card color</label>
                    <select
                      className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                      value={cardColor}
                      onChange={(e) => setCardColor(e.target.value)}
                      disabled={saving}
                    >
                      <option value="default">Default</option>
                      <option value="emerald">Emerald</option>
                      <option value="amber">Amber</option>
                      <option value="sky">Sky</option>
                      <option value="violet">Violet</option>
                      <option value="rose">Rose</option>
                    </select>
                  </div>
                </div>
              </details>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                onClick={() => setShowSaveConfirm(false)}
                disabled={saving}
              >
                Close
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
                onClick={async () => {
                  const ok = await handleSave();
                  if (ok) setShowSaveConfirm(false);
                }}
                disabled={saving || !title.trim()}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : isEditMode ? (
                  "Confirm & save changes"
                ) : (
                  "Confirm & save"
                )}
              </button>
            </div>
          </div>
        </CenteredOverlay>
      ) : null}

      {showAiGenerate ? (
        <AiFormChatModal
          open
          onClose={closeAiGenerateModal}
          generating={generatingAi}
          step={aiStep}
          messages={aiMessages}
          prompt={aiPrompt}
          onPromptChange={setAiPrompt}
          imageFile={aiImageFile}
          onImageChange={setAiImageFile}
          questions={aiQuestions}
          answers={aiAnswers}
          onAnswersChange={setAiAnswers}
          assessSummary={aiAssessSummary}
          onSend={() => void continueAiFlow()}
          onGenerate={() => void generateWithAiAnswers()}
          onBack={handleAiBack}
          onExampleSelect={handleAiExampleSelect}
          aiQuota={aiQuota}
        />
      ) : null}

      <PlanLimitModal
        open={planLimitOpen}
        kind="ai_quota"
        details={{ ...planLimitDetails, tenantSlug }}
        settingsHref={tenantSlug ? `/${tenantSlug}/settings?focus=usage` : undefined}
        onClose={() => {
          setPlanLimitOpen(false);
          setShowAiGenerate(false);
        }}
      />

      {showFormTypeModal ? (
        <CenteredOverlay open maxWidthClass="max-w-2xl" onClose={() => setShowFormTypeModal(false)}>
          <div className="p-4">
            <div className="text-sm font-semibold">Form type</div>
            <p className="mt-1 text-sm text-foreground/70">
              Choose the layout that best matches how this form will be filled in. You can change fields freely after.
            </p>
            <div className="mt-4">
              <FormTypePicker
                layout="modal"
                value={formType}
                onChange={(next) => {
                  handleFormTypeChange(next);
                  setShowFormTypeModal(false);
                }}
                disabled={saving || loadingEditInfo}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                onClick={() => setShowFormTypeModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </CenteredOverlay>
      ) : null}

      {showAiCompleteModal ? (
        <CenteredOverlay
          open
          maxWidthClass={aiCompleteStep === "preview" ? "max-w-5xl" : "max-w-md"}
          onClose={() => {
            setShowAiCompleteModal(false);
            setAiCompleteStep("success");
          }}
        >
          {aiCompleteStep === "success" ? (
            <div className="p-5">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="mt-3 text-lg font-semibold">Form generated</div>
                <p className="mt-2 text-sm leading-6 text-foreground/75">
                  Your draft is ready. Take a moment to preview it and check that the fields, table columns, and title
                  match what you had in mind — you can still adjust anything before saving.
                </p>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                  onClick={() => setShowAiCompleteModal(false)}
                >
                  Edit in builder
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-foreground px-3 text-sm font-medium text-background"
                  onClick={() => setAiCompleteStep("preview")}
                >
                  <Eye className="h-4 w-4" />
                  Preview form
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Your generated form</div>
                  <div className="text-xs text-foreground/70">
                    Does this look right? Edit anything that needs changing, or save when you&apos;re happy.
                  </div>
                </div>
              </div>
              <FormPreviewBody title={title} sections={sections} maxHeightClass="max-h-[65vh]" />
              <div className="flex flex-col gap-2 border-t border-foreground/10 px-4 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                  onClick={() => setShowAiCompleteModal(false)}
                >
                  Edit in builder
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background"
                  onClick={() => {
                    setShowAiCompleteModal(false);
                    setShowSaveConfirm(true);
                  }}
                >
                  Save form
                </button>
              </div>
            </div>
          )}
        </CenteredOverlay>
      ) : null}
    </div>
  );
}
