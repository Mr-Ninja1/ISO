"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Eye, Hand, Laptop, Loader2, Sparkles } from "lucide-react";
import { CenteredOverlay } from "@/components/ui/CenteredOverlay";
import { useAuth } from "@/components/AuthProvider";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import { readWorkspaceCacheResolved, patchWorkspaceTemplateCaches } from "@/lib/client/workspaceCache";
import { requestWorkspaceRevalidate } from "@/lib/client/requestWorkspaceRevalidate";
import { FormTypePicker } from "@/components/forms/FormTypePicker";
import { AiFormChatModal, type AiChatMessage } from "@/components/forms/AiFormChatModal";
import { AiBuilderAssist } from "@/components/forms/AiBuilderAssist";
import { AiFormBriefing } from "@/components/forms/AiFormBriefing";
import { FormInteractivePreview } from "@/components/forms/FormInteractivePreview";
import { FormBuilderModeChooser } from "@/components/forms/FormBuilderModeChooser";
import { PlanLimitModal } from "@/components/plan/PlanLimitModal";
import { PlanLimitReachedError, isPlanLimitError } from "@/lib/planLimitErrors";
import {
  blankCanvasForType,
  getFormBuilderConfig,
  isSchemaEmpty,
  parseFormType,
} from "@/lib/formBuilderConfig";
import {
  applySmartLayoutAction,
  type SmartLayoutActionId,
} from "@/lib/ai/smartLayout";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { dbGetTemplate } from "@/lib/client/formsDb";
import { readAuditTemplateCache } from "@/lib/client/auditTemplateCache";
import type { FormSchemaV1, FormSection, FormStyle, FormType } from "@/types/forms";
import { writeAuditTemplateCache } from "@/lib/client/auditTemplateCache";
import {
  enqueueTemplateSync,
  flushTemplateSyncQueue,
  getPendingTemplateSyncCount,
} from "@/lib/client/templateSyncQueue";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { buildWorkspaceReturnHref } from "@/lib/client/workspaceNavigation";
import type { AiClarificationQuestion, AiExtractionSummary, AiSuggestedAction } from "@/lib/ai/types";
import { AI_WELCOME_MESSAGE } from "@/lib/ai/examplePrompts";
import type { ExamplePrompt } from "@/lib/ai/examplePrompts";
import { normalizeFormSchema } from "@/lib/normalizeFormSchema";
import { looksLikeMeaningfulFormRequest } from "@/lib/ai/generateFormSchema";

const FormBuilder = dynamic(
  () => import("@/components/forms/FormBuilder").then((m) => m.FormBuilder),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[320px] items-center justify-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] text-sm text-foreground/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading form builder…
      </div>
    ),
  }
);
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
  const normalized = normalizeFormSchema(schema as unknown);
  if (Array.isArray(normalized.sections) && normalized.sections.length) return normalized.sections;
  return [{ type: "fields", title: "Fields", fields: normalized.fields ?? [] }];
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

function FormStructurePreview({
  open,
  onClose,
  title,
  sections,
  formStyle = "default",
  auditorMode = false,
  onAuditorModeChange,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sections: FormSection[];
  formStyle?: FormStyle;
  auditorMode?: boolean;
  onAuditorModeChange?: (enabled: boolean) => void;
}) {
  return (
    <CenteredOverlay
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      panelClassName="!max-h-[min(92dvh,900px)] !overflow-hidden !p-0 flex flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-foreground/10 bg-background/95 px-4 py-3 backdrop-blur">
          <div>
            <div className="text-sm font-semibold">Interactive preview</div>
            <div className="text-xs text-foreground/60">Fill fields like a real audit — nothing is saved</div>
          </div>
          <div className="flex items-center gap-2">
            {onAuditorModeChange ? (
              <button
                type="button"
                className={
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors " +
                  (auditorMode
                    ? "border-[var(--hse-teal)] bg-[var(--hse-teal)] text-white"
                    : "border-foreground/15 text-foreground hover:bg-foreground/[0.04]")
                }
                onClick={() => onAuditorModeChange(!auditorMode)}
              >
                <Hand className="h-3.5 w-3.5" />
                {auditorMode ? "Auditor on" : "Test as auditor"}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-foreground/15 px-3 text-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        <FormInteractivePreview
          title={title}
          sections={sections}
          formStyle={formStyle}
          auditorMode={auditorMode}
          maxHeightClass="min-h-0 flex-1"
        />
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
  const [aiSourceFile, setAiSourceFile] = useState<File | null>(null);
  const [aiSourceFileError, setAiSourceFileError] = useState<string | null>(null);
  const [aiStep, setAiStep] = useState<"input" | "clarify">("input");
  const [aiQuestions, setAiQuestions] = useState<AiClarificationQuestion[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [aiAssessSummary, setAiAssessSummary] = useState("");
  const [aiExtraction, setAiExtraction] = useState<AiExtractionSummary | null>(null);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiBuilderDraft, setAiBuilderDraft] = useState<{
    title: string;
    sections: FormSection[];
    formType: FormType;
    formStyle: FormStyle;
    cardIcon: string;
    cardColor: string;
    schemaMeta: Record<string, unknown>;
  } | null>(null);
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
  const [builderMode, setBuilderMode] = useState<"choose" | "ai" | "manual">("choose");
  const [builderDraftHydrated, setBuilderDraftHydrated] = useState(isEditMode);
  const builderDraftTimerRef = useRef<number | null>(null);
  const [cardIcon, setCardIcon] = useState("clipboard");
  const [cardColor, setCardColor] = useState("default");
  const [schemaMeta, setSchemaMeta] = useState<Record<string, unknown>>({});
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showFormTypeModal, setShowFormTypeModal] = useState(false);
  const [showAiCompleteModal, setShowAiCompleteModal] = useState(false);
  const [aiCompleteStep, setAiCompleteStep] = useState<"success" | "preview">("success");
  const [aiDraftBannerOpen, setAiDraftBannerOpen] = useState(false);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [refiningAi, setRefiningAi] = useState(false);
  const [schemaHistory, setSchemaHistory] = useState<FormSection[][]>([]);
  const [schemaFuture, setSchemaFuture] = useState<FormSection[][]>([]);
  const [online, setOnline] = useState(true);
  const [builderBlockedSmallScreen, setBuilderBlockedSmallScreen] = useState(false);

  const [baseSections, setBaseSections] = useState<FormSection[]>([]);
  const [baseVersion, setBaseVersion] = useState(1);
  const [hasAudits, setHasAudits] = useState(false);
  const [auditCount, setAuditCount] = useState(0);
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [auditorMode, setAuditorMode] = useState(false);
  const [aiBriefingOpen, setAiBriefingOpen] = useState(false);
  const [builderResetKey, setBuilderResetKey] = useState("create-initial");
  const [queuedTemplateSaves, setQueuedTemplateSaves] = useState(0);
  const [offlineDraftTemplateId, setOfflineDraftTemplateId] = useState<string | null>(null);

  function welcomeAiMessages(): AiChatMessage[] {
    return [{ id: "welcome", role: "assistant", content: AI_WELCOME_MESSAGE }];
  }

  const cachedWorkspaceForGate = tenantSlug
    ? readWorkspaceCacheResolved(userId, tenantSlug, null)
    : null;
  const canBuildFromCache = Boolean(cachedWorkspaceForGate?.categories?.length);
  // AI still needs internet; builder itself can run from cached workspace / template schema.
  if (offline && !canBuildFromCache && !isEditMode) {
    return (
      <OfflineRouteBlock
        title="Create form needs a cached brand"
        message="Connect once so this brand downloads to the device. After that you can build forms offline (AI still needs internet)."
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
    // Native phones must be able to build forms — do not lock the builder.
    if (isCapacitorNativeApp()) {
      setBuilderBlockedSmallScreen(false);
      return;
    }
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

  const builderDraftKey = useMemo(() => {
    if (!tenantSlug) return null;
    return `template-builder:v1:${userId || "anon"}:${tenantSlug}:${isEditMode ? `edit:${editTemplateId || "draft"}` : "new"}`;
  }, [tenantSlug, userId, isEditMode, editTemplateId]);

  useEffect(() => {
    if (authLoading || !user || !tenantSlug || isEditMode || !builderDraftKey || builderDraftHydrated) return;

    // A fresh form-creation visit should always show the mode chooser in the native app.
    // Restoring previous local draft state makes the builder skip the chooser after the first visit.
    setBuilderMode("choose");
    setSections([]);
    setTitle("Add form title");
    setFormType("custom");
    setFormStyle("default");
    setBuilderDraftHydrated(true);

    try {
      localStorage.removeItem(builderDraftKey);
    } catch {
      // Ignore storage failures while preserving the chooser flow.
    }
  }, [authLoading, user, tenantSlug, isEditMode, builderDraftKey, builderDraftHydrated]);

  useEffect(() => {
    if (authLoading || !user || !tenantSlug || isEditMode || !builderDraftKey || !builderDraftHydrated) return;
    const payload = {
      title,
      sections,
      formType,
      formStyle,
      builderMode,
      savedAt: Date.now(),
    };
    const persistDraft = () => {
      try {
        localStorage.setItem(builderDraftKey, JSON.stringify(payload));
      } catch {
        // Keep the builder usable when browser storage is unavailable or full.
      }
    };

    if (builderDraftTimerRef.current !== null) {
      window.clearTimeout(builderDraftTimerRef.current);
    }
    builderDraftTimerRef.current = window.setTimeout(persistDraft, 250);
    window.addEventListener("pagehide", persistDraft);
    return () => {
      if (builderDraftTimerRef.current !== null) {
        window.clearTimeout(builderDraftTimerRef.current);
        builderDraftTimerRef.current = null;
      }
      window.removeEventListener("pagehide", persistDraft);
    };
  }, [authLoading, user, tenantSlug, isEditMode, builderDraftKey, builderDraftHydrated, title, sections, formType, formStyle, builderMode]);

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

    let cancelled = false;

    const applyLoaded = (data: {
      title: string;
      categoryId: string | null;
      schema: FormSchemaV1;
      version?: number;
      hasAudits?: boolean;
      auditCount?: number;
      templateId: string;
    }) => {
      if (cancelled) return;
      const loadedSections = schemaToSections(data.schema);
      const nextMeta =
        data.schema?.meta && typeof data.schema.meta === "object"
          ? (data.schema.meta as Record<string, unknown>)
          : {};
      setTitle(data.title || data.schema.title || "Add form title");
      setSelectedCategoryId(data.categoryId ?? null);
      setSections(loadedSections);
      setSchemaMeta(nextMeta);
      setFormType(parseFormType(nextMeta.formType));
      setFormStyle((nextMeta.formStyle as FormStyle) || "default");
      setCardIcon(typeof nextMeta.cardIcon === "string" ? nextMeta.cardIcon : "clipboard");
      setCardColor(typeof nextMeta.cardColor === "string" ? nextMeta.cardColor : "default");
      setBaseSections(loadedSections);
      setBaseVersion(data.version || 1);
      setHasAudits(Boolean(data.hasAudits));
      setAuditCount(data.auditCount || 0);
      setBuilderResetKey(`edit-${data.templateId}-${Date.now()}`);
      setError("");
    };

    const loadFromDeviceCache = async () => {
      const cached = readAuditTemplateCache(tenantSlug, editTemplateId);
      if (cached?.template?.schema) {
        applyLoaded({
          title: cached.template.title,
          categoryId: null,
          schema: cached.template.schema,
          templateId: cached.template.id,
        });
        return true;
      }
      try {
        const tpl = await dbGetTemplate(tenantSlug, editTemplateId);
        if (tpl?.schema) {
          applyLoaded({
            title: tpl.title,
            categoryId: null,
            schema: tpl.schema,
            templateId: tpl.templateId,
          });
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    if (!online || !accessToken) {
      setLoadingEditInfo(true);
      void loadFromDeviceCache()
        .then((ok) => {
          if (!ok && !cancelled) {
            setError(
              "This form is not cached on the device yet. Open it once while online, then you can edit offline."
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingEditInfo(false);
        });
      return () => {
        cancelled = true;
      };
    }

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
        applyLoaded({
          title: data.template.title || data.template.schema.title || "Add form title",
          categoryId: data.template.categoryId ?? null,
          schema: data.template.schema as FormSchemaV1,
          version: data.template.version || 1,
          hasAudits: data.lock.hasAudits,
          auditCount: data.lock.auditCount,
          templateId: data.template.id,
        });
      })
      .catch(async (err) => {
        const ok = await loadFromDeviceCache();
        if (!ok && !cancelled) setError(err?.message || "Failed to load template");
      })
      .finally(() => {
        if (!cancelled) setLoadingEditInfo(false);
      });

    return () => {
      cancelled = true;
    };
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
        router.push(
          buildWorkspaceReturnHref(tenantSlug, { categoryId: selectedCategoryId ?? null })
        );
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
        patchWorkspaceTemplateCaches(
          userId,
          tenantSlug,
          {
            id: savedTemplateId,
            title,
            categoryId: selectedCategoryId ?? null,
            updatedAt: new Date().toISOString(),
          },
          { replaceLocalId: offlineDraftTemplateId }
        );
      }

      if (!isEditMode && builderDraftKey) {
        try {
          localStorage.removeItem(builderDraftKey);
        } catch {
          // Ignore storage cleanup failures after a successful server save.
        }
      }

      requestWorkspaceRevalidate(tenantSlug);
      writeWorkspaceNotice(isEditMode ? "Form changes saved." : "Form created successfully.", "success");
      router.push(
        buildWorkspaceReturnHref(tenantSlug, {
          categoryId: selectedCategoryId ?? null,
          refresh: true,
        })
      );
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
        router.push(
          buildWorkspaceReturnHref(tenantSlug, { categoryId: selectedCategoryId ?? null })
        );
        return true;
      }
      setError(err?.message || "Failed to save template");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  function cloneSections(next: FormSection[]): FormSection[] {
    return JSON.parse(JSON.stringify(next)) as FormSection[];
  }

  function buildCurrentSchema(): FormSchemaV1 {
    return {
      version: 1,
      title,
      sections: sectionsRef.current,
      meta: {
        ...schemaMeta,
        formType,
        formStyle,
        cardIcon,
        cardColor,
      },
    };
  }

  function pushSchemaHistory(previous: FormSection[]) {
    setSchemaHistory((hist) => [...hist.slice(-39), cloneSections(previous)]);
    setSchemaFuture([]);
  }

  function commitSections(next: FormSection[], options?: { recordHistory?: boolean; resetKeyPrefix?: string }) {
    const prev = sectionsRef.current;
    const prevJson = JSON.stringify(prev);
    const nextJson = JSON.stringify(next);
    if (prevJson === nextJson) {
      if (options?.resetKeyPrefix) setBuilderResetKey(`${options.resetKeyPrefix}-${Date.now()}`);
      return;
    }
    if (options?.recordHistory !== false) {
      pushSchemaHistory(prev);
    }
    sectionsRef.current = next;
    setSections(next);
    if (options?.resetKeyPrefix) {
      setBuilderResetKey(`${options.resetKeyPrefix}-${Date.now()}`);
    }
  }

  const handleBuilderSectionsChange = useCallback((next: FormSection[]) => {
    const prev = sectionsRef.current;
    if (JSON.stringify(prev) === JSON.stringify(next)) return;
    setSchemaHistory((hist) => [...hist.slice(-39), cloneSections(prev)]);
    setSchemaFuture([]);
    sectionsRef.current = next;
    setSections(next);
  }, []);

  function undoSchemaChange() {
    setSchemaHistory((hist) => {
      if (!hist.length) return hist;
      const previous = hist[hist.length - 1];
      const current = sectionsRef.current;
      setSchemaFuture((future) => [cloneSections(current), ...future].slice(0, 40));
      sectionsRef.current = previous;
      setSections(previous);
      setBuilderResetKey(`undo-${Date.now()}`);
      return hist.slice(0, -1);
    });
  }

  function redoSchemaChange() {
    setSchemaFuture((future) => {
      if (!future.length) return future;
      const [next, ...rest] = future;
      const current = sectionsRef.current;
      setSchemaHistory((hist) => [...hist.slice(-39), cloneSections(current)]);
      sectionsRef.current = next;
      setSections(next);
      setBuilderResetKey(`redo-${Date.now()}`);
      return rest;
    });
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
    const nextTitle = (data?.title as string) || schema?.title || "Imported Form";
    const nextFormStyle = (meta.formStyle as FormStyle) || "default";
    const nextCardIcon = typeof meta.cardIcon === "string" ? meta.cardIcon : getFormBuilderConfig(nextFormType).cardIcon;
    const nextCardColor = typeof meta.cardColor === "string" ? meta.cardColor : "default";

    setAiBuilderDraft({
      title: nextTitle,
      sections: importedSections,
      formType: nextFormType,
      formStyle: nextFormStyle,
      cardIcon: nextCardIcon,
      cardColor: nextCardColor,
      schemaMeta: { ...meta },
    });
    setTitle(nextTitle);
    setSections(importedSections);
    setFormType(nextFormType);
    setFormStyle(nextFormStyle);
    setCardIcon(nextCardIcon);
    setCardColor(nextCardColor);
    setSchemaMeta({ ...meta });
    setBaseSections(importedSections);
    setBuilderResetKey(`${resetKeyPrefix}-${Date.now()}`);
    setShowFormPreview(false);
    setSchemaHistory([]);
    setSchemaFuture([]);
    setAiAssistOpen(true);

    const gridCount = importedSections.filter((section) => section.type === "grid").length;
    if (gridCount > 1) {
      setError(`Loaded ${gridCount} tables from the draft — all are editable in the builder.`);
    }
  }

  function handleLocalAiAction(action: AiSuggestedAction) {
    if (action.id === "paste_static_items") {
      setAiAssistOpen(true);
      setAiDraftBannerOpen(true);
      setError("Use Edit static items on the printed-item column to paste the list.");
      return;
    }
    if (!action.localAction) return;
    const polished = applySmartLayoutAction(buildCurrentSchema(), action.localAction as SmartLayoutActionId);
    if (polished.meta?.formStyle && polished.meta.formStyle !== formStyle) {
      setFormStyle(polished.meta.formStyle as FormStyle);
    }
    commitSections(polished.sections || [], { resetKeyPrefix: `smart-${action.id}` });
    setError("");
  }

  async function refineCurrentForm(instruction: string) {
    if (!accessToken || !tenantSlug || !instruction.trim()) return;
    const ok = await refreshAiQuota();
    if (!ok) return;

    setRefiningAi(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/templates/ai-generate"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          phase: "refine",
          prompt: instruction.trim(),
          schema: buildCurrentSchema(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.quota) setAiQuota(data.quota);
      if (!res.ok) {
        if (data?.code === "AI_QUOTA_EXCEEDED") {
          setPlanLimitDetails({ used: data.quota?.used, limit: data.quota?.limit });
          setPlanLimitOpen(true);
          return;
        }
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to refine form.");
      }
      const nextSections = Array.isArray(data.sections)
        ? (data.sections as FormSection[])
        : Array.isArray(data.schema?.sections)
          ? (data.schema.sections as FormSection[])
          : sections;
      if (typeof data.title === "string" && data.title.trim()) setTitle(data.title.trim());
      const meta = data.schema?.meta;
      if (meta?.formType) setFormType(parseFormType(meta.formType));
      if (meta?.formStyle) setFormStyle(meta.formStyle as FormStyle);
      commitSections(nextSections, { resetKeyPrefix: "ai-refine" });
      if (typeof data.summary === "string" && data.summary.trim()) {
        setAiExtraction((prev) => ({
          summary: data.summary,
          adaptations: prev?.adaptations,
          uncertainItems: prev?.uncertainItems,
          staticColumns: prev?.staticColumns,
          suggestedActions: prev?.suggestedActions,
        }));
      }
    } catch (err: unknown) {
      if (handlePlanLimit(err)) return;
      setError(err instanceof Error ? err.message : "Failed to refine form.");
    } finally {
      setRefiningAi(false);
    }
  }

  function resetAiModalState() {
    setAiStep("input");
    setAiQuestions([]);
    setAiAnswers({});
    setAiAssessSummary("");
    setAiPrompt("");
    setAiSourceFile(null);
    setAiSourceFileError(null);
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
    if (aiSourceFile) formData.set("file", aiSourceFile);
    if (options.answers && Object.keys(options.answers).length) {
      formData.set("answers", JSON.stringify(options.answers));
    }
    return formData;
  }

  function finishAiGeneration() {
    setBuilderMode("ai");
    setShowAiGenerate(false);
    resetAiModalState();
    // Prefer extraction report when available; skip stacked preview overlay on the happy path.
    setAiCompleteStep("success");
    setShowAiCompleteModal(true);
  }

  function openAiDraftInBuilder() {
    const showAssist = Boolean(
      aiExtraction &&
        (aiExtraction.summary ||
          aiExtraction.uncertainItems?.length ||
          aiExtraction.staticColumns?.length ||
          aiExtraction.adaptations?.length ||
          aiExtraction.suggestedActions?.length),
    );
    openManualBuilderMode(true);
    setAiAssistOpen(showAssist || builderMode === "ai");
    setAiBriefingOpen(true);
    setAiDraftBannerOpen(Boolean(aiExtraction?.staticColumns?.length));
    setShowAiCompleteModal(false);
  }

  function isTransientAiError(message: string) {
    return /(429|resource exhausted|too many requests|temporar|high demand|try again later|overloaded|503|service unavailable|rate limit)/i.test(message);
  }

  async function withAiRetry<T>(operation: () => Promise<T>, context: "assess" | "generate"): Promise<T> {
    let lastError: unknown;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        if (!isTransientAiError(message) || attempt >= maxAttempts - 1) {
          throw err;
        }

        const waitMs = 1800 * (attempt + 1);
        setAiMessages((prev) => [
          ...prev.filter((m) => !m.isTyping),
          {
            id: `retry-${Date.now()}-${attempt}`,
            role: "assistant",
            content: `The model is busy right now. Retrying automatically in ${Math.ceil(waitMs / 1000)}s (${context === "assess" ? "checking the form" : "building the form"})…`,
          },
        ]);
        await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      }
    }

    throw lastError;
  }

  async function continueAiFlow() {
    if (!accessToken || !tenantSlug) return;

    const prompt = aiPrompt.trim();
    if (!prompt && !aiSourceFile) {
      setError("Describe your form, attach a PDF/JPG/PNG, or both.");
      return;
    }
    // Align with server validation (looksLikeMeaningfulFormRequest) — avoid stricter client keyword gates.
    if (prompt && !looksLikeMeaningfulFormRequest(prompt)) {
      setError("This does not look like a usable form request. Please describe the form more clearly or attach a document.");
      return;
    }

    const displayContent =
      prompt || (aiSourceFile ? `Attached ${aiSourceFile.name}` : "");

    setAiMessages((prev) => [
      ...prev.filter((m) => !m.isTyping),
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: displayContent,
        attachmentName: aiSourceFile?.name,
      },
      { id: "typing", role: "assistant", content: "", isTyping: true, typingLabel: "Checking…" },
    ]);

    setGeneratingAi(true);
    setError("");
    try {
      const assessment = await withAiRetry(() => postAiGenerate(buildAiFormData({ phase: "assess" })), "assess");

      setAiMessages((prev) => prev.filter((m) => !m.isTyping));

      if (assessment.status === "rejected") {
        const rejection = [assessment.summary, assessment.suggestion].filter(Boolean).join(" ");
        setAiMessages((prev) => [
          ...prev,
          { id: `rejected-${Date.now()}`, role: "assistant", content: rejection },
        ]);
        setError(rejection);
        return;
      }

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
        setAiMessages((prev) => prev.filter((m) => !m.isTyping));
        setAiStep("clarify");
        return;
      }

      setAiMessages((prev) => [
        ...prev,
        { id: `ready-${Date.now()}`, role: "assistant", content: "Ready — blueprinting your form draft…" },
        {
          id: "typing",
          role: "assistant",
          content: "",
          isTyping: true,
          blueprint: true,
          typingLabel: "AI blueprinting",
        },
      ]);

      const generated = await withAiRetry(() => postAiGenerate(buildAiFormData({ phase: "generate" })), "generate");
      applyImportedSchema(generated, "ai-generate");
      setAiExtraction(generated.extraction ?? null);
      setAiMessages((prev) => [
        ...prev.filter((m) => !m.isTyping),
        { id: `done-${Date.now()}`, role: "assistant", content: "Ready — opening your extraction report." },
      ]);
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
          content: isTransientAiError(message)
            ? `${message} You can keep this prompt and click Try again, or wait a moment and the model will retry automatically the next time you submit.`
            : message,
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
    const promptText = aiPrompt.trim();

    if (!answerSummary.trim() && !promptText && !aiSourceFile) {
      setError("Please provide a real form description or attachment before generating.");
      return;
    }
    if (promptText && !looksLikeMeaningfulFormRequest(promptText)) {
      setError("This does not look like a usable form request. Please describe the form more clearly or attach a document.");
      return;
    }

    setAiMessages((prev) => [
      ...prev,
      { id: `answers-${Date.now()}`, role: "user", content: answerSummary },
      {
        id: "typing",
        role: "assistant",
        content: "",
        isTyping: true,
        blueprint: true,
        typingLabel: "AI blueprinting",
      },
    ]);

    setGeneratingAi(true);
    setError("");
    try {
      const generated = await withAiRetry(
        () => postAiGenerate(buildAiFormData({ phase: "generate", answers: aiAnswers })),
        "generate",
      );
      applyImportedSchema(generated, "ai-generate");
      setAiExtraction(generated.extraction ?? null);
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
          content: isTransientAiError(message)
            ? `${message} You can keep the answers and click Try again, or wait a moment before retrying.`
            : message,
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
    setAiExtraction(null);
    setAiDraftBannerOpen(false);
    if (offline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setError("AI form creation needs an internet connection. You can still build forms manually offline.");
      return;
    }
    resetAiModalState();
    setBuilderMode("ai");
    // Open instantly — quota refresh runs in the background so the engine feels immediate.
    setShowAiGenerate(true);
    void refreshAiQuota().then((allowed) => {
      if (!allowed) {
        setShowAiGenerate(false);
        setBuilderMode("choose");
      }
    });
  }

  function closeAiGenerateModal() {
    if (generatingAi) return;
    setShowAiGenerate(false);
    setBuilderMode((current) => (current === "ai" && !sections.length ? "choose" : current));
    resetAiModalState();
  }

  function openManualBuilderMode(useAiDraft = false) {
    setBuilderMode("manual");
    setShowAiCompleteModal(false);
    setShowAiGenerate(false);

    if (useAiDraft && aiBuilderDraft) {
      setTitle(aiBuilderDraft.title);
      setSections(aiBuilderDraft.sections);
      setFormType(aiBuilderDraft.formType);
      setFormStyle(aiBuilderDraft.formStyle);
      setCardIcon(aiBuilderDraft.cardIcon);
      setCardColor(aiBuilderDraft.cardColor);
      setSchemaMeta(aiBuilderDraft.schemaMeta);
      setBuilderResetKey(`manual-ai-${Date.now()}`);
      return;
    }

    setAiBuilderDraft(null);
    setAiDraftBannerOpen(false);
    setSections(blankCanvasForType(formType));
    setBuilderResetKey(`manual-${Date.now()}`);
  }

  const disableSave = saving || workspaceLoading || loadingEditInfo || !title.trim();
  // Keep the AI/Manual cards visible while the Form Engine sheet is open (no empty builder flash).
  const showBuilderModeChooser =
    !isEditMode && !sections.length && (builderMode === "choose" || (builderMode === "ai" && showAiGenerate));

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

      {!showBuilderModeChooser ? (
        <>
          <AiFormBriefing
            open={aiBriefingOpen}
            onClose={() => setAiBriefingOpen(false)}
            title={title}
            sections={sections}
            extraction={aiExtraction}
            auditorMode={auditorMode}
            onAuditorModeChange={setAuditorMode}
            onOpenPreview={() => setShowFormPreview(true)}
          />
          <AiBuilderAssist
            open={aiAssistOpen}
            onClose={() => setAiAssistOpen(false)}
            extraction={aiExtraction}
            refining={refiningAi}
            canUndo={schemaHistory.length > 0}
            canRedo={schemaFuture.length > 0}
            onUndo={undoSchemaChange}
            onRedo={redoSchemaChange}
            onLocalAction={handleLocalAiAction}
            onRefine={(instruction) => void refineCurrentForm(instruction)}
            quotaRemaining={aiQuota?.remaining ?? null}
            unlimited={aiQuota?.unlimited}
          />
        </>
      ) : null}

      {aiDraftBannerOpen && aiExtraction?.staticColumns?.length && !showBuilderModeChooser ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 sm:px-4">
          <div className="flex items-start gap-2 text-xs leading-5 text-amber-950">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="min-w-0 flex-1">
              Printed list ready to paste — open a static column and choose{" "}
              <span className="font-semibold">Edit static items</span>
              {aiExtraction.staticColumns.length === 1
                ? ` (“${aiExtraction.staticColumns[0]}”).`
                : "."}
            </p>
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-amber-900/70 hover:bg-amber-100"
              onClick={() => setAiDraftBannerOpen(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-visible">
        <div className="grid grid-cols-1">
          <div className="min-w-0">
            {!showBuilderModeChooser ? (
              <div className="sticky top-0 z-20 border-b border-foreground/8 bg-background/90 px-3 py-2.5 shadow-[0_10px_30px_-24px_rgba(0,61,51,0.4)] backdrop-blur-md sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/12 bg-foreground/[0.03] px-3.5 text-xs font-medium text-foreground transition hover:bg-foreground/[0.06] disabled:opacity-50"
                    disabled={saving || loadingEditInfo}
                    onClick={() => setShowFormTypeModal(true)}
                  >
                    {getFormBuilderConfig(formType).label}
                    <ChevronDown className="h-3.5 w-3.5 text-foreground/50" />
                  </button>

                  <label className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/12 bg-foreground/[0.03] px-2.5 text-xs">
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

                  {aiExtraction || builderMode === "ai" ? (
                    <button
                      type="button"
                      className={
                        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium disabled:opacity-50 " +
                        (aiBriefingOpen
                          ? "border-[color-mix(in_srgb,var(--hse-teal)_40%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_12%,white)] text-[var(--hse-teal)]"
                          : "border-foreground/12 text-foreground hover:bg-foreground/[0.04]")
                      }
                      onClick={() => setAiBriefingOpen((open) => !open)}
                    >
                      Briefing
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium disabled:opacity-50 " +
                      (aiAssistOpen
                        ? "border-[color-mix(in_srgb,var(--hse-teal)_40%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_12%,white)] text-[var(--hse-teal)]"
                        : "border-foreground/12 text-foreground hover:bg-foreground/[0.04]")
                    }
                    disabled={saving || loadingEditInfo || refiningAi}
                    onClick={() => setAiAssistOpen((open) => !open)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI assist
                  </button>

                  {!isEditMode ? (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] px-3.5 text-xs font-medium text-[var(--hse-teal)] transition hover:bg-[color-mix(in_srgb,var(--hse-teal)_14%,white)] disabled:opacity-50"
                      disabled={generatingAi || saving || workspaceLoading}
                      onClick={() => void openAiGenerateModal()}
                    >
                      {generatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {generatingAi ? "Blueprinting…" : "Create with AI"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium disabled:opacity-50 " +
                      (auditorMode
                        ? "border-[var(--hse-teal)] bg-[var(--hse-teal)] text-white"
                        : "border-foreground/12 text-foreground hover:bg-foreground/[0.04]")
                    }
                    onClick={() => {
                      setAuditorMode(true);
                      setShowFormPreview(true);
                    }}
                    disabled={workspaceLoading || builderBlockedSmallScreen}
                  >
                    <Hand className="h-3.5 w-3.5" />
                    Test
                  </button>

                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/12 px-3.5 text-xs font-medium text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"
                    onClick={() => setShowFormPreview(true)}
                    disabled={workspaceLoading || builderBlockedSmallScreen}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>

                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    onClick={() => setShowSaveConfirm(true)}
                    disabled={disableSave}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {saving ? "Saving…" : isEditMode ? "Save changes" : "Save form"}
                  </button>
                </div>
              </div>
            ) : null}

            {showBuilderModeChooser ? (
              <FormBuilderModeChooser
                onChooseAi={() => void openAiGenerateModal()}
                onChooseManual={() => openManualBuilderMode(false)}
              />
            ) : (
              <FormBuilder
                onChangeSections={handleBuilderSectionsChange}
                initialSections={sections}
                title={title}
                onTitleChange={setTitle}
                formType={formType}
                lockExistingDeletes={hasAudits}
                lockedFieldIds={lockedFieldIds}
                lockedGridColumnIds={lockedGridColumnIds}
                resetKey={builderResetKey}
              />
            )}
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
        onClose={() => {
          setShowFormPreview(false);
          setAuditorMode(false);
        }}
        title={title}
        sections={sections}
        formStyle={formStyle}
        auditorMode={auditorMode}
        onAuditorModeChange={setAuditorMode}
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
          sourceFile={aiSourceFile}
          onSourceFileChange={setAiSourceFile}
          sourceFileError={aiSourceFileError}
          onSourceFileError={setAiSourceFileError}
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
          maxWidthClass={aiCompleteStep === "preview" ? "max-w-5xl" : aiExtraction ? "max-w-lg" : "max-w-md"}
          onClose={() => {
            setShowAiCompleteModal(false);
            setAiCompleteStep("success");
          }}
        >
          {aiCompleteStep === "success" ? (
            <div className="relative overflow-hidden p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-28"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--hse-teal) 12%, transparent), color-mix(in srgb, var(--hse-sky) 45%, transparent) 55%, transparent)",
                }}
              />
              <div className="relative flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="mt-3 text-lg font-semibold tracking-tight">Form drafted</div>
                <p className="mt-2 max-w-sm text-sm leading-6 text-foreground/70">
                  Review the briefing, test as an auditor, then open the builder to polish or save.
                </p>
              </div>

              {aiExtraction ? (
                <div className="relative mt-4 space-y-3 text-left">
                  <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm leading-6 text-foreground/80">
                    {aiExtraction.summary}
                  </div>
                  <div className="rounded-md border border-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] px-3 py-2 text-xs leading-5 text-foreground/75">
                    This draft preserves the same information, meaning, and required data points even when the layout is simplified or not visually identical to the original form.
                  </div>
                  {aiExtraction.analysis ? (
                    <div className="rounded-md border border-foreground/15 bg-background px-3 py-2 text-xs leading-5 text-foreground/75">
                      <div className="mb-1 font-medium text-foreground/85">Import coverage</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {typeof aiExtraction.analysis.pagesInspected === "number" ? (
                          <span>{aiExtraction.analysis.pagesInspected} page{aiExtraction.analysis.pagesInspected === 1 ? "" : "s"}</span>
                        ) : null}
                        {typeof aiExtraction.analysis.tablesDetected === "number" ? (
                          <span>{aiExtraction.analysis.tablesDetected} table{aiExtraction.analysis.tablesDetected === 1 ? "" : "s"}</span>
                        ) : null}
                        {typeof aiExtraction.analysis.controlsDetected === "number" ? (
                          <span>{aiExtraction.analysis.controlsDetected} input control{aiExtraction.analysis.controlsDetected === 1 ? "" : "s"}</span>
                        ) : null}
                        {typeof aiExtraction.analysis.confidence === "number" ? (
                          <span>{Math.round(aiExtraction.analysis.confidence * 100)}% confidence</span>
                        ) : null}
                        {aiExtraction.analysis.coverage ? (
                          <span className="capitalize">{aiExtraction.analysis.coverage} coverage</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {aiExtraction.analysis?.omittedContent?.length ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                      <div className="mb-1 font-medium">Content needing review</div>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {aiExtraction.analysis.omittedContent.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {aiExtraction.adaptations?.length ? (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
                      <div className="mb-1 font-medium">How the source was adapted</div>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {aiExtraction.adaptations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {aiExtraction.staticColumns?.length ||
                  (typeof aiExtraction.staticItemCount === "number" && aiExtraction.staticItemCount > 0) ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
                      <div className="mb-1 font-semibold text-amber-950">
                        Printed items were skipped on purpose
                      </div>
                      <p>
                        {aiExtraction.staticColumns?.length === 1 ? (
                          <>
                            Column <span className="font-semibold">&quot;{aiExtraction.staticColumns[0]}&quot;</span> looks
                            like fixed text that stays the same every time (for example a prep-list item column).
                          </>
                        ) : aiExtraction.staticColumns && aiExtraction.staticColumns.length > 1 ? (
                          <>
                            Columns{" "}
                            <span className="font-semibold">
                              {aiExtraction.staticColumns.map((label) => `"${label}"`).join(", ")}
                            </span>{" "}
                            look like fixed text that stays the same every time.
                          </>
                        ) : (
                          <>Some table columns look like printed fixed text (items / labels).</>
                        )}
                        {typeof aiExtraction.staticItemCount === "number" && aiExtraction.staticItemCount > 0 ? (
                          <> The source had about {aiExtraction.staticItemCount} printed rows.</>
                        ) : null}
                      </p>
                      <p className="mt-1.5">
                        I only built the table structure so long lists stay easy to manage. Add those items in the
                        builder with <span className="font-semibold">Edit static items</span>, or type them into the
                        static column after you save — they stay on the form template and sync to every device.
                      </p>
                    </div>
                  ) : null}
                  {aiExtraction.uncertainItems?.length ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                      <div className="mb-1 flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Review uncertain items
                      </div>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {aiExtraction.uncertainItems.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {aiExtraction.suggestedActions?.length ? (
                    <div className="rounded-md border border-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_6%,white)] px-3 py-2.5">
                      <div className="mb-1.5 text-xs font-medium text-foreground/85">Quick polish before you open</div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiExtraction.suggestedActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            className="inline-flex h-7 items-center rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-background px-2.5 text-[11px] font-medium text-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_10%,white)]"
                            onClick={() => {
                              handleLocalAiAction(action);
                              if (action.localAction) {
                                // keep modal open so user can open builder next
                              } else if (action.refinePrompt) {
                                setShowAiCompleteModal(false);
                                openAiDraftInBuilder();
                                void refineCurrentForm(action.refinePrompt);
                              }
                            }}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px] text-foreground/50">
                        Instant chips apply immediately · you can keep polishing with AI assist in the builder
                      </p>
                    </div>
                  ) : null}
                  {(() => {
                    const setupTasks = (aiExtraction.prefilledContent || []).filter(
                      (item) =>
                        !(
                          aiExtraction.staticColumns?.length &&
                          /static|printed items|Edit static items|skipped copying/i.test(item)
                        ),
                    );
                    if (!setupTasks.length) return null;
                    return (
                      <div className="rounded-md border border-foreground/15 bg-background px-3 py-2 text-xs leading-5 text-foreground/75">
                        <div className="mb-1 font-medium text-foreground/85">Setup tasks from source content</div>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {setupTasks.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-foreground/15 px-3 text-sm"
                  onClick={() => {
                    setAuditorMode(true);
                    setAiCompleteStep("preview");
                  }}
                >
                  <Hand className="h-3.5 w-3.5" />
                  Test as auditor
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-foreground/15 px-3 text-sm"
                  onClick={() => {
                    setShowAiCompleteModal(false);
                    setShowSaveConfirm(true);
                  }}
                >
                  Save form
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-foreground px-3 text-sm font-medium text-background"
                  onClick={() => openAiDraftInBuilder()}
                >
                  {aiExtraction?.staticColumns?.length ? "Open in builder (add items)" : "Open in builder"}
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-foreground/50">
                Try the interactive preview, then polish in the builder with AI assist.
              </p>
            </div>
          ) : (
            <div className="flex max-h-[min(88dvh,860px)] flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Test your generated form</div>
                  <div className="text-xs text-foreground/60">
                    Tap fields and walk the table — edit anything that feels off in the builder.
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-foreground/55 underline hover:text-foreground"
                  onClick={() => setAiCompleteStep("success")}
                >
                  Back to report
                </button>
              </div>
              <FormInteractivePreview
                title={title}
                sections={sections}
                formStyle={formStyle}
                auditorMode
                maxHeightClass="min-h-0 flex-1"
              />
              <div className="flex flex-col gap-2 border-t border-foreground/10 px-4 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-foreground/15 px-3 text-sm"
                  onClick={() => {
                    setShowAiCompleteModal(false);
                    setShowSaveConfirm(true);
                  }}
                >
                  Save form
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background"
                  onClick={() => openAiDraftInBuilder()}
                >
                  Open in builder
                </button>
              </div>
            </div>
          )}
        </CenteredOverlay>
      ) : null}
    </div>
  );
}
