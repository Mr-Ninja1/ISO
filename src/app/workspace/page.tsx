"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { Activity, Clock3, FileText, FolderTree, GraduationCap, LayoutDashboard, Loader2, MoreVertical, Plus, Search, Settings, Users2, X } from "lucide-react";
import { hasPersistedAuthCredentials, useAuth } from "@/components/AuthProvider";
import { createClient, readPersistedSupabaseSession } from "@/lib/auth";
import { hardNavigate } from "@/lib/client/appEntryNavigation";
import { usePlatformDeveloperRedirect } from "@/lib/client/usePlatformDeveloperRedirect";
import { getWorkspaceAccessToken, hasWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { buildTenantHref } from "@/lib/client/tenantHref";
import { pushTenantRoute, tenantRouteHref } from "@/lib/client/tenantNavigation";
import { fetchWorkspaceViaSupabase } from "@/lib/data/fetchWorkspaceViaSupabase";
import { AddFormOptionsModal } from "@/components/AddFormOptionsModal";
import { ConnectivityIndicator } from "@/components/ConnectivityIndicator";
import { LoggedInStaffBadge } from "@/components/LoggedInStaffBadge";
import { NotificationModal } from "@/components/NotificationModal";
import { WorkspaceSeedModal } from "@/components/WorkspaceSeedModal";
import { WorkspaceTourModal } from "@/components/WorkspaceTourModal";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import {
  readAuditTemplateCache,
  readAuditTemplateCacheAsync,
  writeAuditTemplateCache,
} from "@/lib/client/auditTemplateCache";
import { writeAuditsListCache, type CachedAuditRow } from "@/lib/client/auditsListCache";
import { isAppOffline } from "@/lib/client/appOffline";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { dbGetDraft, dbGetTemplate, dbPutTemplate } from "@/lib/client/formsDb";
import { apiUrl } from "@/lib/client/apiBase";
import { requestWorkspaceRevalidate } from "@/lib/client/requestWorkspaceRevalidate";
import { clearOfflineBootstrapComplete, isOfflineBootstrapComplete } from "@/lib/client/offlineBootstrap";
import {
  cacheAllTenantTemplatesFromApi,
  clearTenantTemplateBulkCached,
  isTenantTemplateBulkCached,
} from "@/lib/client/offlineTemplateWarmup";
import { BackgroundSyncManager } from "@/components/BackgroundSyncManager";
import { WorkspaceMessageInboxButton } from "@/components/messages/TenantMessageCenter";
import {
  clearTenantDeactivatedBlocked,
  deactivationReasonFromError,
  getTenantDeactivationReason,
  isTenantDeactivatedBlocked,
  isTenantDeactivatedError,
  setTenantDeactivatedBlocked,
} from "@/lib/client/brandAccess";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { TenantDeactivatedScreen } from "@/components/TenantDeactivatedScreen";
import { FloatingActionMenu } from "@/components/workspace/FloatingActionMenu";
import { useRequiresInternet } from "@/hooks/useRequiresInternet";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { WorkspaceAndroidAppMenuItem } from "@/components/WorkspaceAndroidAppMenuItem";
import { TemplateDueRuleFields, type DueRuleFormState } from "@/components/TemplateDueRuleFields";
import { DueReminderPoller } from "@/components/DueReminderPoller";
import {
  applyDueRuleToMeta,
  dueRuleToFormState,
  formatDueRuleSummary,
  isPastDue,
  isReminderDue,
  parseTemplateDueRule,
  resolveTemplateDueReminderAt,
  templateToReminderTarget,
  type TemplateDueRule,
  type TemplateReminderTarget,
} from "@/lib/dueRules";
import {
  clearRemindersForTemplate,
  DUE_REMINDER_EVENT,
  ensureNotificationPermission,
  type DueReminderDetail,
} from "@/lib/client/dueReminderNotify";

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

type TemplateSummary = {
  id: string;
  title: string;
  updatedAt: string;
  categoryId: string | null;
  hasTemperatureInputs?: boolean;
  settings?: {
    dueDays?: number;
    dueRule?: TemplateDueRule | null;
    dueReminderAt?: string;
    dueRuleSetAt?: string;
    temperatureAlertBelow?: number;
    temperatureAlertAbove?: number;
    temperatureUnit?: "C" | "F";
    cardIcon?: string;
    cardColor?: string;
  };
};

type WorkspaceData = {
  tenant: TenantSummary;
  categories: CategorySummary[];
  selectedCategoryId: string | null;
  templates: TemplateSummary[];
  isAdmin: boolean;
  role?: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
  capabilities?: {
    canAccessSettings?: boolean;
    canCreateForms?: boolean;
    canManageCategories?: boolean;
    canManageStaff?: boolean;
  };
};

type WorkspaceCacheEnvelope = {
  ts: number;
  data: WorkspaceData;
};

const RECENT_TEMPLATES_LIMIT = 6;
type WorkspaceTheme = "hse-pro" | "default" | "slate-soft" | "warm-paper" | "mint-soft";
const THEME_STORAGE_KEY = "iso-theme-v1";

function templateCardClasses(color: string | undefined) {
  switch (color) {
    case "emerald":
      return "border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-emerald-100/50 hover:shadow-lg hover:shadow-emerald-200/30 hover:-translate-y-0.5 transition-all duration-200";
    case "amber":
      return "border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-amber-100/50 hover:shadow-lg hover:shadow-amber-200/30 hover:-translate-y-0.5 transition-all duration-200";
    case "sky":
      return "border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-sky-100/50 hover:shadow-lg hover:shadow-sky-200/30 hover:-translate-y-0.5 transition-all duration-200";
    case "violet":
      return "border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-violet-100/50 hover:shadow-lg hover:shadow-violet-200/30 hover:-translate-y-0.5 transition-all duration-200";
    case "rose":
      return "border-rose-200/60 bg-gradient-to-br from-rose-50/80 to-rose-100/50 hover:shadow-lg hover:shadow-rose-200/30 hover:-translate-y-0.5 transition-all duration-200";
    default:
      return "border-slate-200/60 bg-gradient-to-br from-white to-slate-50/50 hover:shadow-lg hover:shadow-slate-200/30 hover:-translate-y-0.5 transition-all duration-200";
  }
}

function templateIconGlyph(icon: string | undefined) {
  switch (icon) {
    case "checklist":
      return "✅";
    case "safety":
      return "🛡️";
    case "cleaning":
      return "🧹";
    case "inventory":
      return "📦";
    case "staff":
      return "👥";
    case "food":
      return "🍽️";
    case "temperature":
      return "🌡️";
    default:
      return "📋";
  }
}

function workspaceCacheKey(userId: string | null, tenantSlug: string, categoryId: string | null) {
  return `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:${categoryId || "all"}`;
}

function readWorkspaceCacheEnvelope(userId: string | null, tenantSlug: string, categoryId: string | null): WorkspaceCacheEnvelope | null {
  if (!tenantSlug) return null;
  try {
    const raw = localStorage.getItem(workspaceCacheKey(userId, tenantSlug, categoryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceCacheEnvelope;
    if (!parsed?.data || typeof parsed.ts !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function readWorkspaceCache(userId: string | null, tenantSlug: string, categoryId: string | null): WorkspaceData | null {
  return readWorkspaceCacheEnvelope(userId, tenantSlug, categoryId)?.data || null;
}

/** Prefer category snapshot, then tenant-wide cache saved during warmup or tab switches. */
function readWorkspaceCacheResolved(
  userId: string | null,
  tenantSlug: string,
  categoryId: string | null
): WorkspaceData | null {
  return readWorkspaceCache(userId, tenantSlug, categoryId) ?? readWorkspaceCache(userId, tenantSlug, null);
}

function isWorkspaceCacheFresh(userId: string | null, tenantSlug: string, categoryId: string | null, ttlMs: number) {
  const envelope = readWorkspaceCacheEnvelope(userId, tenantSlug, categoryId);
  if (!envelope) return false;
  return Date.now() - envelope.ts <= ttlMs;
}

function writeWorkspaceCache(userId: string | null, tenantSlug: string, categoryId: string | null, data: WorkspaceData) {
  if (!tenantSlug) return;
  try {
    const payload: WorkspaceCacheEnvelope = { ts: Date.now(), data };
    localStorage.setItem(workspaceCacheKey(userId, tenantSlug, categoryId), JSON.stringify(payload));

    // Keep category tabs consistent across cached category views.
    // Each cache entry stores templates for a single category, but categories list should be global.
    if (Array.isArray(data.categories) && data.categories.length > 0) {
      const tenantMarker = `:${tenantSlug}:`;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (!key.startsWith("workspace-cache:v2:")) continue;
        if (!key.includes(tenantMarker)) continue;

        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const existing = JSON.parse(raw) as WorkspaceCacheEnvelope;
          if (!existing?.data) continue;
          // Only patch if different length (fast heuristic).
          if (Array.isArray(existing.data.categories) && existing.data.categories.length === data.categories.length) continue;
          const next: WorkspaceCacheEnvelope = {
            ts: Date.now(),
            data: {
              ...existing.data,
              tenant: data.tenant,
              categories: data.categories,
              role: data.role ?? existing.data.role,
              isAdmin: typeof data.isAdmin === "boolean" ? data.isAdmin : existing.data.isAdmin,
              capabilities: data.capabilities ?? existing.data.capabilities,
            },
          };
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore malformed cache items
        }
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("workspace-cache-updated", {
          detail: { tenantSlug, categoryId },
        })
      );
    }
  } catch {
    // ignore quota / serialization failures
  }
}

function recentTemplatesKey(tenantSlug: string) {
  return `recent-templates:v1:${tenantSlug}`;
}

function readRecentTemplateIds(tenantSlug: string): string[] {
  if (!tenantSlug) return [];
  try {
    const raw = localStorage.getItem(recentTemplatesKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeRecentTemplateIds(tenantSlug: string, ids: string[]) {
  if (!tenantSlug) return;
  try {
    localStorage.setItem(recentTemplatesKey(tenantSlug), JSON.stringify(ids.slice(0, RECENT_TEMPLATES_LIMIT)));
  } catch {
    // ignore localStorage failures
  }
}

function normalizeTenantSlug(value: string | null | undefined) {
  const slug = (value || "").trim();
  if (!slug || slug === "_" || slug === "workspace") return "";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return "";
  return slug;
}

function WorkspaceSkeleton() {
  return <WorkspaceLoadingShell />;
}

function WorkspaceUnavailable({
  tenantSlug,
  message,
  onRetry,
  onSwitchBrand,
}: {
  tenantSlug: string;
  message: string;
  onRetry: () => void;
  onSwitchBrand?: () => void;
}) {
  return (
    <div className="workspace-shell min-h-dvh">
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-xl font-semibold">Workspace</h1>
        <div className="ui-card-muted mt-4 p-3 text-sm">{message}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="ui-btn-primary h-10 px-4" onClick={onRetry}>
            Retry
          </button>
          {onSwitchBrand ? (
            <button type="button" className="ui-btn-secondary inline-flex h-10 items-center justify-center px-4" onClick={onSwitchBrand}>
              Switch brand
            </button>
          ) : null}
          {tenantSlug ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4"
              onClick={() => {
                window.location.href = `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}&refresh=1`;
              }}
            >
              Reload workspace
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WorkspaceCardSkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-foreground/20 bg-background p-4 shadow-sm">
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-2/3 rounded bg-foreground/10" />
            <div className="h-3 w-1/2 rounded bg-foreground/10" />
            <div className="mt-4 h-10 w-full rounded-md bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

type QuickTemplateSettings = DueRuleFormState & {
  temperatureAlertBelow: string;
  temperatureAlertAbove: string;
  temperatureUnit: "C" | "F";
  cardIcon: string;
  cardColor: string;
};

function TemplateQuickSettingsModal({
  open,
  template,
  saving,
  error,
  showTemperatureSettings,
  onClose,
  onSave,
}: {
  open: boolean;
  template: TemplateSummary | null;
  saving: boolean;
  error: string;
  showTemperatureSettings: boolean;
  onClose: () => void;
  onSave: (settings: QuickTemplateSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<QuickTemplateSettings>({
    mode: "none",
    days: "",
    durationMinutes: "",
    fixedLocal: "",
    temperatureAlertBelow: "",
    temperatureAlertAbove: "",
    temperatureUnit: "C",
    cardIcon: "clipboard",
    cardColor: "default",
  });

  useEffect(() => {
    if (!open || !template) return;
    const dueForm = dueRuleToFormState(template.settings?.dueRule ?? parseTemplateDueRule({ dueDays: template.settings?.dueDays }));
    setDraft({
      ...dueForm,
      temperatureAlertBelow:
        typeof template.settings?.temperatureAlertBelow === "number" ? String(template.settings.temperatureAlertBelow) : "",
      temperatureAlertAbove:
        typeof template.settings?.temperatureAlertAbove === "number" ? String(template.settings.temperatureAlertAbove) : "",
      temperatureUnit: template.settings?.temperatureUnit === "F" ? "F" : "C",
      cardIcon: template.settings?.cardIcon || "clipboard",
      cardColor: template.settings?.cardColor || "default",
    });
  }, [open, template]);

  if (!open || !template) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close quick settings" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-foreground/20 bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/55">Quick settings</div>
            <h3 className="mt-1 text-lg font-semibold">{template.title}</h3>
            <p className="mt-1 text-sm text-foreground/65">
              Set due-date defaults{showTemperatureSettings ? " and template-level temperature thresholds." : "."}
            </p>
          </div>
          <button type="button" className="inline-flex h-9 items-center justify-center rounded-full border border-foreground/15 px-3 text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className={showTemperatureSettings ? "mt-4 grid gap-3 sm:grid-cols-2" : "mt-4 grid gap-3"}>
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/70">Card icon (optional)</span>
            <select
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm"
              value={draft.cardIcon}
              onChange={(e) => setDraft((prev) => ({ ...prev, cardIcon: e.target.value }))}
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
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/70">Card color (optional)</span>
            <select
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm"
              value={draft.cardColor}
              onChange={(e) => setDraft((prev) => ({ ...prev, cardColor: e.target.value }))}
            >
              <option value="default">Default</option>
              <option value="emerald">Emerald</option>
              <option value="amber">Amber</option>
              <option value="sky">Sky</option>
              <option value="violet">Violet</option>
              <option value="rose">Rose</option>
            </select>
          </label>
          <TemplateDueRuleFields
            value={{
              mode: draft.mode,
              days: draft.days,
              durationMinutes: draft.durationMinutes,
              fixedLocal: draft.fixedLocal,
            }}
            disabled={saving}
            onChange={(due) => setDraft((prev) => ({ ...prev, ...due }))}
          />
          {showTemperatureSettings ? (
            <>
              <label className="grid gap-1 text-sm">
                <span className="text-foreground/70">Temperature unit</span>
                <select
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm"
                  value={draft.temperatureUnit}
                  onChange={(e) => setDraft((prev) => ({ ...prev, temperatureUnit: e.target.value === "F" ? "F" : "C" }))}
                >
                  <option value="C">Celsius (C)</option>
                  <option value="F">Fahrenheit (F)</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-foreground/70">Alert below</span>
                <input
                  type="number"
                  step="0.1"
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm"
                  value={draft.temperatureAlertBelow}
                  onChange={(e) => setDraft((prev) => ({ ...prev, temperatureAlertBelow: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-foreground/70">Alert above</span>
                <input
                  type="number"
                  step="0.1"
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm"
                  value={draft.temperatureAlertAbove}
                  onChange={(e) => setDraft((prev) => ({ ...prev, temperatureAlertAbove: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </>
          ) : null}
        </div>

        {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-11 rounded-full border border-foreground/15 px-4 text-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60"
            disabled={saving}
            onClick={() => onSave(draft)}
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function WorkspacePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, loading: authLoading, signOut } = useAuth();
  usePlatformDeveloperRedirect();

  const tenantSlug = normalizeTenantSlug(searchParams.get("tenantSlug"));
  const categoryId = searchParams.get("categoryId");
  const forceRefresh = searchParams.get("refresh") === "1";
  const requestedView = searchParams.get("view");

  const accessToken = getWorkspaceAccessToken(session);
  const cacheUserId = user?.id || null;

  const [tenantChoices, setTenantChoices] = useState<TenantSummary[]>([]);
  const [tenantChoiceLoading, setTenantChoiceLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [switchingCategory, setSwitchingCategory] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string>("");

  const [seedOpen, setSeedOpen] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [workspaceTourOpen, setWorkspaceTourOpen] = useState(false);

  const [addFormOpen, setAddFormOpen] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<WorkspaceTheme>("hse-pro");
  const [uiActiveCategoryId, setUiActiveCategoryId] = useState<string | null>(null);
  const [openingTemplateId, setOpeningTemplateId] = useState<string | null>(null);
  const [cardMenuTemplateId, setCardMenuTemplateId] = useState<string | null>(null);
  const cardMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const [quickSettingsTemplate, setQuickSettingsTemplate] = useState<TemplateSummary | null>(null);
  const [quickSettingsLoading, setQuickSettingsLoading] = useState(false);
  const [quickSettingsSaving, setQuickSettingsSaving] = useState(false);
  const [quickSettingsError, setQuickSettingsError] = useState("");
  const [movingTemplateId, setMovingTemplateId] = useState<string | null>(null);
  const [offlinePreparing, setOfflinePreparing] = useState(false);
  const [nativeWarmupRunning, setNativeWarmupRunning] = useState(false);
  const [offlinePreparedAt, setOfflinePreparedAt] = useState<string | null>(null);
  const [prefetchingSchemas, setPrefetchingSchemas] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [templateHydrationTick, setTemplateHydrationTick] = useState(0);
  const [templateQuery, setTemplateQuery] = useState("");
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [draftTemplateIds, setDraftTemplateIds] = useState<Set<string>>(new Set());
  const [reminderDueTemplateIds, setReminderDueTemplateIds] = useState<Set<string>>(new Set());
  const [revalidateTick, setRevalidateTick] = useState(0);
  const [confirmOfflineOpen, setConfirmOfflineOpen] = useState(false);
  const [openingSettings, setOpeningSettings] = useState(false);
  const [openingStaff, setOpeningStaff] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openingActivity, setOpeningActivity] = useState(false);
  const [openingAdminDashboard, setOpeningAdminDashboard] = useState(false);
  const [openingAudits, setOpeningAudits] = useState(false);
  const [openingFormsNav, setOpeningFormsNav] = useState(false);
  const [openingAdminNav, setOpeningAdminNav] = useState(false);
  const [notification, setNotification] = useState<{ title: string; message: string; tone?: "default" | "success" | "warning" | "error" } | null>(null);
  const workspaceRetryTimerRef = useRef<number | null>(null);
  /** Limits infinite skeleton when /api/workspace keeps returning 503 (e.g. dev DB pool saturated). */
  const workspaceBusyRetriesRef = useRef(0);
  const workspaceBusyRetriesSlugRef = useRef<string | null>(null);
  const forceWorkspaceNetworkRefetchRef = useRef(false);
  const suggestionsFetchedRef = useRef(false);
  const offlineFromHook = useAppOffline();
  const { blockIfOffline } = useRequiresInternet();
  const activeCategoryId = uiActiveCategoryId ?? categoryId ?? workspace?.selectedCategoryId ?? null;
  const workspaceLoadKey = `${categoryId ?? ""}|${forceRefresh ? "refresh" : "normal"}`;
  const workspaceRole = workspace?.role || (workspace?.isAdmin ? "ADMIN" : "MEMBER");
  const canSeeAdminHub = workspaceRole === "ADMIN" || workspaceRole === "MANAGER";
  const activeView = canSeeAdminHub ? (requestedView === "forms" ? "forms" : "admin") : "forms";
  const isAdminView = activeView === "admin";
  const isFormsView = activeView === "forms";

  const workspaceTemplatesPrefetchKey = useMemo(() => {
    const tpls = workspace?.templates;
    if (!tpls?.length) return "";
    return tpls.map((t) => `${t.id}:${t.updatedAt}`).join("|");
  }, [workspace]);

  const workspaceTourSeenKey = tenantSlug ? `workspace-tour:v1:${tenantSlug}` : "";

  function rememberRecentTemplate(templateId: string) {
    if (!tenantSlug) return;
    const next = [templateId, ...recentTemplateIds.filter((id) => id !== templateId)].slice(
      0,
      RECENT_TEMPLATES_LIMIT
    );
    setRecentTemplateIds(next);
    writeRecentTemplateIds(tenantSlug, next);
  }

  function markWorkspaceTourSeen() {
    if (!workspaceTourSeenKey) return;
    try {
      localStorage.setItem(workspaceTourSeenKey, "1");
    } catch {
      // ignore storage failures
    }
  }

  function openWorkspaceSeedFromTour() {
    markWorkspaceTourSeen();
    setWorkspaceTourOpen(false);
    setSeedOpen(true);
  }

  function dismissWorkspaceTour() {
    markWorkspaceTourSeen();
    setWorkspaceTourOpen(false);
  }

  function clearTenantLocalCache(options?: { showToast?: boolean }) {
    if (!tenantSlug) return;

    const prefixA = `workspace-cache:v2:${cacheUserId || "anon"}:${tenantSlug}:`;
    const prefixB = `audit-template-cache:v1:${tenantSlug}:`;
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(prefixA) || key.startsWith(prefixB) || key === recentTemplatesKey(tenantSlug)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      localStorage.removeItem(key);
    }

    clearTenantTemplateBulkCached(tenantSlug);
    clearOfflineBootstrapComplete(cacheUserId, tenantSlug);
    setOfflinePreparedAt(null);

    setRecentTemplateIds([]);
    setMenuOpen(false);
    if (options?.showToast !== false) {
      setNotification({
        title: "Cache cleared",
        message: "Local workspace and form caches were removed for this brand.",
        tone: "success",
      });
    }
  }

  function handleTenantDeactivatedExit(reason?: string | null) {
    if (!tenantSlug) return;
    clearTenantLocalCache({ showToast: false });
    setTenantDeactivatedBlocked(tenantSlug, reason);
    try {
      if (localStorage.getItem("lastTenantSlug") === tenantSlug) {
        localStorage.removeItem("lastTenantSlug");
      }
    } catch {
      // ignore
    }
    setWorkspace(null);
    setUiActiveCategoryId(null);
    setWorkspaceLoading(false);
    setSwitchingCategory(false);
    setError("");
    router.replace("/workspace");
  }

  useEffect(() => {
    function onTenantDeactivated(ev: Event) {
      const detail = (ev as CustomEvent<{ tenantSlug?: string; reason?: string | null }>).detail;
      const slug = detail?.tenantSlug;
      if (!slug || slug !== tenantSlug) return;
      handleTenantDeactivatedExit(detail?.reason);
    }
    window.addEventListener("iso-tenant-deactivated", onTenantDeactivated);
    return () => window.removeEventListener("iso-tenant-deactivated", onTenantDeactivated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  async function prefetchTemplateSchema(templateId: string) {
    if (!accessToken || !tenantSlug) return;
    if (readAuditTemplateCache(tenantSlug, templateId)) return;

    const url = new URL(apiUrl("/api/audit/template"));
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("templateId", templateId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Template prefetch failed (${res.status})`);

    writeAuditTemplateCache(tenantSlug, templateId, data);
  }

  async function prepareOfflineMode() {
    if (!workspace || !accessToken || !tenantSlug) return;

    setOfflinePreparing(true);
    setError("");

    try {
      const targets: Array<string | null> = [null, ...workspace.categories.map((c) => c.id)];

      for (const cid of targets) {
        const url = new URL(apiUrl("/api/workspace"));
        url.searchParams.set("tenantSlug", tenantSlug);
        if (cid) url.searchParams.set("categoryId", cid);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any)?.error || `Offline prep failed (${res.status})`);
        writeWorkspaceCache(cacheUserId, tenantSlug, cid, data as WorkspaceData);
      }

      await cacheAllTenantTemplatesFromApi(accessToken, tenantSlug);

      const now = new Date().toISOString();
      localStorage.setItem("offlineModeEnabled", "1");
      localStorage.setItem("offlinePreparedAt", now);
      setOfflinePreparedAt(now);
      setNotification({
        title: "Offline mode prepared",
        message: "Workspace and form schemas are cached. Open Saved forms while online to sync history.",
        tone: "success",
      });
    } catch (err: any) {
      setError(err?.message || "Offline preparation failed");
    } finally {
      setOfflinePreparing(false);
      setMenuOpen(false);
    }
  }

  async function primeOfflineCachesInBackground() {
    if (!workspace || !accessToken || !tenantSlug) return;
    if (isAppOffline()) return;
    const schemasReady = isTenantTemplateBulkCached(tenantSlug);
    if (schemasReady && offlinePreparedAt) return;

    setNativeWarmupRunning(true);
    const timeoutId = window.setTimeout(() => {
      setNativeWarmupRunning(false);
      if (
        tenantSlug &&
        readWorkspaceCacheResolved(cacheUserId, tenantSlug, categoryId) &&
        isTenantTemplateBulkCached(tenantSlug)
      ) {
        setOfflinePreparedAt((prev) => prev ?? "cached");
      }
    }, 45_000);

    try {
      // One workspace snapshot only — parallel GET /api/workspace per category hammers Prisma and causes 503s + infinite retry UX on mobile shells.
      const url = new URL(apiUrl("/api/workspace"));
      url.searchParams.set("tenantSlug", tenantSlug);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as WorkspaceData | null;
        if (data) {
          writeWorkspaceCache(cacheUserId, tenantSlug, null, data);
          if (data.selectedCategoryId) {
            writeWorkspaceCache(cacheUserId, tenantSlug, data.selectedCategoryId, data);
          }
        }
      }

      if (!schemasReady) {
        await cacheAllTenantTemplatesFromApi(accessToken, tenantSlug);
      }

      const now = new Date().toISOString();
      localStorage.setItem("offlineModeEnabled", "1");
      localStorage.setItem("offlinePreparedAt", now);
      setOfflinePreparedAt(now);
    } catch {
      // silent background warm-up
    } finally {
      window.clearTimeout(timeoutId);
      setNativeWarmupRunning(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    try {
      setLoggingOut(true);
      setMenuOpen(false);
      await signOut();
    } finally {
      router.push("/login");
      setLoggingOut(false);
    }
  }

  function clearNavLoading(delayMs = 600) {
    window.setTimeout(() => {
      setOpeningSettings(false);
      setOpeningStaff(false);
      setOpeningActivity(false);
      setOpeningAdminDashboard(false);
      setOpeningAudits(false);
      setOpeningFormsNav(false);
      setOpeningAdminNav(false);
    }, delayMs);
  }

  function handleOpenFormsWorkspace() {
    if (!workspace) return;
    if (openingFormsNav) return;
    setOpeningFormsNav(true);
    router.push(`/workspace/forms?tenantSlug=${encodeURIComponent(workspace.tenant.slug)}`);
    clearNavLoading();
  }

  function handleOpenAdminView() {
    if (!workspace) return;
    if (openingAdminNav) return;
    setOpeningAdminNav(true);
    router.replace(`/workspace?tenantSlug=${encodeURIComponent(workspace.tenant.slug)}&view=admin`);
    clearNavLoading(400);
  }

  function handleSwitchBrand() {
    setMenuOpen(false);
    if (blockIfOffline("Switch brand")) return;
    try {
      localStorage.removeItem("lastTenantSlug");
    } catch {
      // ignore
    }
    router.push("/workspace");
  }

  function handleOpenSettings(targetTenantSlug: string) {
    if (openingSettings) return;
    setMenuOpen(false);
    setOpeningSettings(true);
    pushTenantRoute(router, targetTenantSlug, "settings");
    clearNavLoading();
  }

  function handleOpenStaffManagement(targetTenantSlug: string) {
    if (openingStaff) return;
    setMenuOpen(false);
    setOpeningStaff(true);
    pushTenantRoute(router, targetTenantSlug, "settings", { focus: "staff" });
    clearNavLoading();
  }

  function handleOpenActivity(targetTenantSlug: string) {
    if (openingActivity) return;
    setOpeningActivity(true);
    pushTenantRoute(router, targetTenantSlug, "activity");
    clearNavLoading();
  }

  function handleOpenAdminDashboard(targetTenantSlug: string) {
    if (openingAdminDashboard) return;
    setOpeningAdminDashboard(true);
    pushTenantRoute(router, targetTenantSlug, "dashboard");
    clearNavLoading();
  }

  function handleOpenAudits(targetTenantSlug: string) {
    if (openingAudits) return;
    setOpeningAudits(true);
    pushTenantRoute(router, targetTenantSlug, "audits");
    clearNavLoading();
  }

  function handleAddFromTemplates(selectedCategoryId: string | null) {
    if (!workspace) return;
    if (blockIfOffline("Template library")) return;
    setAddFormOpen(false);
    pushTenantRoute(
      router,
      workspace.tenant.slug,
      "templates/library",
      selectedCategoryId ? { categoryId: selectedCategoryId } : undefined
    );
  }

  function handleCreateCustomForm(selectedCategoryId: string | null) {
    if (!workspace) return;
    if (blockIfOffline("Create custom form")) return;
    setAddFormOpen(false);
    router.push(
      buildTenantHref(workspace.tenant.slug, "templates/new", {
        categoryId: selectedCategoryId || undefined,
      })
    );
  }

  async function openQuickSettings(template: TemplateSummary) {
    if (!accessToken || !tenantSlug) return;
    setQuickSettingsError("");
    setQuickSettingsLoading(true);
    setCardMenuTemplateId(null);

    try {
      const url = new URL(apiUrl("/api/templates/edit-info"));
      url.searchParams.set("tenantSlug", tenantSlug);
      url.searchParams.set("templateId", template.id);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to load template settings (${res.status})`);

      const meta = data?.template?.schema?.meta || {};
      setQuickSettingsTemplate({
        ...template,
        hasTemperatureInputs: Boolean(
          Array.isArray(data?.template?.schema?.sections)
            ? data.template.schema.sections.some(
                (section: any) =>
                  (section?.type === "fields" && Array.isArray(section.fields) && section.fields.some((field: any) => field?.type === "temp" && field?.isActive !== false)) ||
                  (section?.type === "grid" && Array.isArray(section.columns) && section.columns.some((col: any) => col?.type === "temp" && col?.isActive !== false))
              )
            : Array.isArray(data?.template?.schema?.fields) && data.template.schema.fields.some((field: any) => field?.type === "temp" && field?.isActive !== false)
        ),
        settings: {
          dueRule: parseTemplateDueRule(meta) ?? template.settings?.dueRule ?? null,
          dueDays:
            typeof meta.dueDays === "number"
              ? meta.dueDays
              : template.settings?.dueDays,
          dueReminderAt:
            typeof meta.dueReminderAt === "string"
              ? meta.dueReminderAt
              : template.settings?.dueReminderAt,
          dueRuleSetAt:
            typeof meta.dueRuleSetAt === "string"
              ? meta.dueRuleSetAt
              : template.settings?.dueRuleSetAt,
          temperatureAlertBelow:
            typeof meta.temperatureAlertBelow === "number"
              ? meta.temperatureAlertBelow
              : template.settings?.temperatureAlertBelow,
          temperatureAlertAbove:
            typeof meta.temperatureAlertAbove === "number"
              ? meta.temperatureAlertAbove
              : template.settings?.temperatureAlertAbove,
          temperatureUnit:
            meta.temperatureUnit === "F" || meta.temperatureUnit === "C"
              ? meta.temperatureUnit
              : template.settings?.temperatureUnit,
          cardIcon: typeof meta.cardIcon === "string" ? meta.cardIcon : template.settings?.cardIcon,
          cardColor: typeof meta.cardColor === "string" ? meta.cardColor : template.settings?.cardColor,
        },
      });
    } catch (err: any) {
      setQuickSettingsError(err?.message || "Failed to open quick settings");
      setQuickSettingsTemplate(template);
    } finally {
      setQuickSettingsLoading(false);
    }
  }

  async function moveTemplateToCategory(template: TemplateSummary, categoryId: string) {
    if (!accessToken || !tenantSlug || !categoryId || categoryId === template.categoryId) return;
    setMovingTemplateId(template.id);
    setCardMenuTemplateId(null);

    try {
      const res = await fetch(apiUrl("/api/templates/set-category"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          templateId: template.id,
          categoryId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Failed to move form (${res.status})`);

      setWorkspace((prev) => {
        if (!prev) return prev;
        const movedAway = Boolean(prev.selectedCategoryId && categoryId !== prev.selectedCategoryId);
        const nextTemplates = movedAway
          ? prev.templates.filter((item) => item.id !== template.id)
          : prev.templates.map((item) => (item.id === template.id ? { ...item, categoryId } : item));
        const nextWorkspace = { ...prev, templates: nextTemplates };
        try {
          writeWorkspaceCache(cacheUserId, tenantSlug, categoryId, nextWorkspace);
          if (prev.selectedCategoryId) {
            writeWorkspaceCache(cacheUserId, tenantSlug, prev.selectedCategoryId, nextWorkspace);
          }
          writeWorkspaceCache(cacheUserId, tenantSlug, null, nextWorkspace);
        } catch {
          // cache sync is best-effort
        }
        return nextWorkspace;
      });

      requestWorkspaceRevalidate(tenantSlug);
      setNotification({
        title: "Form moved",
        message: "This form was moved to the selected category.",
        tone: "success",
      });
    } catch (err: unknown) {
      setNotification({
        title: "Move failed",
        message: err instanceof Error ? err.message : "Failed to move form",
        tone: "warning",
      });
    } finally {
      setMovingTemplateId(null);
    }
  }

  async function saveQuickSettings(settings: QuickTemplateSettings) {
    if (!accessToken || !tenantSlug || !quickSettingsTemplate) return;
    setQuickSettingsSaving(true);
    setQuickSettingsError("");

    try {
      const infoUrl = new URL(apiUrl("/api/templates/edit-info"));
      infoUrl.searchParams.set("tenantSlug", tenantSlug);
      infoUrl.searchParams.set("templateId", quickSettingsTemplate.id);

      const infoRes = await fetch(infoUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const infoJson = await infoRes.json().catch(() => ({}));
      if (!infoRes.ok) throw new Error(infoJson?.error || `Failed to load template (${infoRes.status})`);

      const schema = infoJson?.template?.schema || {};
      const meta = schema && typeof schema === "object" && !Array.isArray(schema) && schema.meta && typeof schema.meta === "object" && !Array.isArray(schema.meta)
        ? schema.meta
        : {};

      const nextMeta = applyDueRuleToMeta(meta as Record<string, unknown>, {
        mode: settings.mode,
        days: settings.days,
        durationMinutes: settings.durationMinutes,
        fixedLocal: settings.fixedLocal,
      });

      Object.assign(nextMeta, {
        temperatureAlertBelow: settings.temperatureAlertBelow.trim() === "" ? undefined : Number(settings.temperatureAlertBelow),
        temperatureAlertAbove: settings.temperatureAlertAbove.trim() === "" ? undefined : Number(settings.temperatureAlertAbove),
        temperatureUnit: settings.temperatureUnit,
        cardIcon: settings.cardIcon || undefined,
        cardColor: settings.cardColor || undefined,
      });

      const nextSchema = {
        ...schema,
        meta: nextMeta,
      };

      const dueAt = resolveTemplateDueReminderAt(nextMeta);
      const nextSettings: NonNullable<TemplateSummary["settings"]> = {
        dueRule: parseTemplateDueRule(nextMeta),
        dueDays: typeof nextMeta.dueDays === "number" ? nextMeta.dueDays : undefined,
        dueReminderAt: dueAt?.toISOString(),
        dueRuleSetAt: typeof nextMeta.dueRuleSetAt === "string" ? nextMeta.dueRuleSetAt : undefined,
        temperatureAlertBelow:
          typeof nextMeta.temperatureAlertBelow === "number" ? nextMeta.temperatureAlertBelow : undefined,
        temperatureAlertAbove:
          typeof nextMeta.temperatureAlertAbove === "number" ? nextMeta.temperatureAlertAbove : undefined,
        temperatureUnit: settings.temperatureUnit,
        cardIcon: typeof nextMeta.cardIcon === "string" ? nextMeta.cardIcon : undefined,
        cardColor: typeof nextMeta.cardColor === "string" ? nextMeta.cardColor : undefined,
      };

      const saveRes = await fetch(apiUrl("/api/templates/save-changes"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          templateId: quickSettingsTemplate.id,
          title: infoJson?.template?.title || quickSettingsTemplate.title,
          categoryId: infoJson?.template?.categoryId ?? quickSettingsTemplate.categoryId,
          schema: nextSchema,
        }),
      });

      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saveJson?.error || `Failed to save settings (${saveRes.status})`);

      const savedTemplateId =
        typeof saveJson?.templateId === "string" ? saveJson.templateId : quickSettingsTemplate.id;

      setWorkspace((prev) => {
        if (!prev) return prev;
        const nextTemplates = prev.templates.map((t) => {
          if (t.id !== quickSettingsTemplate.id && t.id !== savedTemplateId) return t;
          return { ...t, id: savedTemplateId, settings: nextSettings };
        });
        const merged =
          savedTemplateId !== quickSettingsTemplate.id &&
          !nextTemplates.some((t) => t.id === savedTemplateId)
            ? [
                ...nextTemplates,
                { ...quickSettingsTemplate, id: savedTemplateId, settings: nextSettings },
              ]
            : nextTemplates;
        const nextWorkspace = { ...prev, templates: merged };
        try {
          writeWorkspaceCache(cacheUserId, tenantSlug, categoryId, nextWorkspace);
          if (nextWorkspace.selectedCategoryId) {
            writeWorkspaceCache(cacheUserId, tenantSlug, nextWorkspace.selectedCategoryId, nextWorkspace);
          }
          writeWorkspaceCache(cacheUserId, tenantSlug, null, nextWorkspace);
        } catch {
          // cache sync is best-effort
        }
        return nextWorkspace;
      });

      clearRemindersForTemplate(tenantSlug, savedTemplateId);
      setQuickSettingsTemplate(null);

      try {
        const cachedTpl = await dbGetTemplate(tenantSlug, quickSettingsTemplate.id);
        if (cachedTpl) {
          await dbPutTemplate({
            ...cachedTpl,
            schema: nextSchema as typeof cachedTpl.schema,
          });
        }
        writeAuditTemplateCache(tenantSlug, quickSettingsTemplate.id, {
          tenant: {
            slug: tenantSlug,
            name: workspace?.tenant.name || tenantSlug,
            logoUrl: workspace?.tenant.logoUrl ?? null,
          },
          template: {
            id: quickSettingsTemplate.id,
            title: quickSettingsTemplate.title,
            schema: nextSchema,
            updatedAt: new Date().toISOString(),
          },
        });
      } catch {
        // offline cache sync is best-effort
      }

      void ensureNotificationPermission();
    } catch (err: any) {
      setQuickSettingsError(err?.message || "Failed to save quick settings");
    } finally {
      setQuickSettingsSaving(false);
    }
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as WorkspaceTheme | null;
      if (!stored) return;
      if (!["hse-pro", "default", "slate-soft", "warm-paper", "mint-soft"].includes(stored)) return;
      setTheme(stored);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "default") {
      root.removeAttribute("data-theme");
    } else if (theme === "hse-pro") {
      root.setAttribute("data-theme", "hse-pro");
    } else {
      root.setAttribute("data-theme", theme);
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const showTenantPicker = useMemo(
    () => !tenantSlug && tenantChoices.length > 1,
    [tenantSlug, tenantChoices.length]
  );

  const cachedWorkspaceForUi =
    workspace ?? (tenantSlug ? readWorkspaceCacheResolved(cacheUserId, tenantSlug, categoryId) : null);
  const hasLocalWorkspaceCache = Boolean(
    tenantSlug && readWorkspaceCacheResolved(cacheUserId, tenantSlug, categoryId)
  );
  const offlineWarmupBlocking = Boolean(
    !offlineFromHook &&
      !hasLocalWorkspaceCache &&
      !offlinePreparedAt &&
      (nativeWarmupRunning || offlinePreparing)
  );

  const filteredTemplates = useMemo(() => {
    if (!workspace) return [];
    const q = templateQuery.trim().toLowerCase();
    if (!q) return workspace.templates;
    return workspace.templates.filter((t) => t.title.toLowerCase().includes(q));
  }, [workspace, templateQuery]);

  const recentTemplates = useMemo(() => {
    if (!workspace || recentTemplateIds.length === 0) return [];
    const byId = new Map(workspace.templates.map((t) => [t.id, t]));
    return recentTemplateIds
      .map((id) => byId.get(id))
      .filter((t): t is TemplateSummary => Boolean(t));
  }, [workspace, recentTemplateIds]);

  const reminderTargets = useMemo((): TemplateReminderTarget[] => {
    if (!workspace?.templates?.length) return [];
    return workspace.templates
      .map((t) =>
        templateToReminderTarget(t.id, t.title, {
          dueRule: t.settings?.dueRule,
          dueDays: t.settings?.dueDays,
          dueReminderAt: t.settings?.dueReminderAt,
          dueRuleSetAt: t.settings?.dueRuleSetAt,
        })
      )
      .filter((x): x is TemplateReminderTarget => Boolean(x));
  }, [workspace?.templates]);

  useEffect(() => {
    if (!workspace?.templates?.length) {
      setReminderDueTemplateIds(new Set());
      return;
    }
    const due = new Set(
      workspace.templates
        .filter((t) =>
          isReminderDue({
            dueRule: t.settings?.dueRule,
            dueDays: t.settings?.dueDays,
            dueReminderAt: t.settings?.dueReminderAt,
            dueRuleSetAt: t.settings?.dueRuleSetAt,
          })
        )
        .map((t) => t.id)
    );
    setReminderDueTemplateIds(due);
  }, [workspace?.templates]);

  useEffect(() => {
    if (reminderTargets.length > 0) {
      void ensureNotificationPermission();
    }
  }, [reminderTargets.length]);

  useEffect(() => {
    const onReminder = (event: Event) => {
      const detail = (event as CustomEvent<DueReminderDetail>).detail;
      if (!detail || detail.tenantSlug !== tenantSlug) return;
      setNotification({
        title: `Reminder: ${detail.title}`,
        message: detail.body,
        tone: "warning",
      });
    };
    window.addEventListener(DUE_REMINDER_EVENT, onReminder as EventListener);
    return () => window.removeEventListener(DUE_REMINDER_EVENT, onReminder as EventListener);
  }, [tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    async function loadDraftIndicators() {
      if (!workspace?.tenant?.slug || !workspace.templates?.length) {
        if (!cancelled) setDraftTemplateIds(new Set());
        return;
      }
      const pairs = await Promise.all(
        workspace.templates.map(async (template) => {
          const draft = await dbGetDraft(workspace.tenant.slug, template.id);
          return [template.id, Boolean(draft)] as const;
        })
      );
      if (cancelled) return;
      setDraftTemplateIds(new Set(pairs.filter(([, hasDraft]) => hasDraft).map(([id]) => id)));
    }
    loadDraftIndicators();
    return () => {
      cancelled = true;
    };
  }, [workspace?.tenant?.slug, workspace?.templates]);

  // Hydrate instantly from local cache, independent of auth/network timing.
  useEffect(() => {
    if (!tenantSlug) return;
    const cached = readWorkspaceCacheResolved(cacheUserId, tenantSlug, categoryId);
    if (!cached) return;

    setWorkspace(cached);
    setUiActiveCategoryId(null);
    setWorkspaceLoading(false);
    setSwitchingCategory(false);
    setError("");
    localStorage.setItem("lastTenantSlug", cached.tenant.slug);
    // Keep dependency size stable to avoid React dev warning during fast refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, categoryId]);

  useEffect(() => {
    const onWorkspaceCacheUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string; categoryId?: string | null }>;
      if (custom.detail?.tenantSlug !== tenantSlug) return;
      const currentCategoryId = categoryId || null;
      const cached = readWorkspaceCache(cacheUserId, tenantSlug, currentCategoryId) || readWorkspaceCache(cacheUserId, tenantSlug, null);
      if (!cached) return;
      // Avoid updating state if the cached value matches current workspace
      const sameTenant = workspace?.tenant.slug === cached.tenant.slug && workspace?.tenant.name === cached.tenant.name && workspace?.tenant.logoUrl === cached.tenant.logoUrl;
      const sameCategory = workspace?.selectedCategoryId === cached.selectedCategoryId;
      const sameTemplates =
        Array.isArray(workspace?.templates) &&
        workspace.templates.length === cached.templates.length &&
        workspace.templates.every((t, idx) => {
          const n = cached.templates[idx];
          return (
            n &&
            t.id === n.id &&
            t.updatedAt === n.updatedAt &&
            t.categoryId === n.categoryId &&
            t.title === n.title
          );
        });

      if (sameTenant && sameCategory && sameTemplates) return;

      setWorkspace(cached);
      setUiActiveCategoryId(null);
      setWorkspaceLoading(false);
      setSwitchingCategory(false);
      setError("");
    };

    window.addEventListener("workspace-cache-updated", onWorkspaceCacheUpdated as EventListener);
    return () => {
      window.removeEventListener("workspace-cache-updated", onWorkspaceCacheUpdated as EventListener);
    };
  }, [tenantSlug, categoryId, cacheUserId]);

  useEffect(() => {
    if (authLoading) return;
    if (user?.id) return;
    if (hasPersistedAuthCredentials()) return;
    router.push("/login");
  }, [authLoading, user, router]);

  const sessionRestorePending =
    Boolean(user?.id) && !hasWorkspaceAccessToken(session) && !cachedWorkspaceForUi;

  useEffect(() => {
    if (!sessionRestorePending) return;
    const timeoutId = window.setTimeout(() => {
      if (!hasWorkspaceAccessToken(session) && !readPersistedSupabaseSession()?.access_token) {
        router.replace("/login");
      }
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [sessionRestorePending, session, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!accessToken) return;

    if (tenantSlug) return;

    const lastRaw = localStorage.getItem("lastTenantSlug") || "";
    const last = normalizeTenantSlug(lastRaw);
    if (!last && lastRaw) {
      localStorage.removeItem("lastTenantSlug");
    }
    if (last) {
      const url = `/workspace?tenantSlug=${encodeURIComponent(last)}`;
      if (isCapacitorNativeApp()) {
        hardNavigate(url);
      } else {
        router.replace(url);
      }
      return;
    }

    setTenantChoiceLoading(true);
    setError("");

    fetch(apiUrl("/api/tenants"), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load brands (${res.status})`);
        return data;
      })
      .then(async (data) => {
        const tenants = (data.tenants || []) as TenantSummary[];
        setTenantChoices(tenants);

        if (tenants.length === 0) {
          const { isPlatformDeveloperSession } = await import("@/lib/client/platformDeveloperSession");
          if (accessToken && (await isPlatformDeveloperSession(accessToken))) {
            router.replace("/admin");
            return;
          }
          router.push("/onboarding");
          return;
        }

        if (tenants.length === 1) {
          const slug = tenants[0].slug;
          localStorage.setItem("lastTenantSlug", slug);
          const url = `/workspace?tenantSlug=${encodeURIComponent(slug)}`;
          if (isCapacitorNativeApp()) {
            hardNavigate(url);
          } else {
            router.replace(url);
          }
          return;
        }
      })
      .catch((err) => {
        setError(err?.message || "Failed to load brands");
        setTenantChoices([]);
      })
      .finally(() => setTenantChoiceLoading(false));
  }, [authLoading, user, accessToken, tenantSlug, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!accessToken) return;
    if (!tenantSlug) return;

    if (isTenantDeactivatedBlocked(tenantSlug)) {
      handleTenantDeactivatedExit();
      return;
    }

    if (workspaceBusyRetriesSlugRef.current !== tenantSlug) {
      workspaceBusyRetriesSlugRef.current = tenantSlug;
      workspaceBusyRetriesRef.current = 0;
    }

    const cached = readWorkspaceCacheResolved(cacheUserId, tenantSlug, categoryId);
    const hasCached = Boolean(cached);
    if (cached) {
      setWorkspace(cached);
      setUiActiveCategoryId(null);
      setWorkspaceLoading(false);
      setSwitchingCategory(false);
      setError("");
      localStorage.setItem("lastTenantSlug", cached.tenant.slug);
    }

    if (workspace && !hasCached) {
      setSwitchingCategory(true);
    } else if (!hasCached && !cached) {
      setWorkspaceLoading(true);
    } else if (cached) {
      setWorkspaceLoading(false);
    }

    setError("");

    const url = new URL(apiUrl("/api/workspace"));
    url.searchParams.set("tenantSlug", tenantSlug);
    if (categoryId) url.searchParams.set("categoryId", categoryId);

    let keepLoading = false;

    const hasFreshCache = isWorkspaceCacheFresh(cacheUserId, tenantSlug, categoryId, 2 * 60_000);
    const forceNetworkRefetch = forceWorkspaceNetworkRefetchRef.current;
    if (forceNetworkRefetch) {
      forceWorkspaceNetworkRefetchRef.current = false;
    }

    // Offline (browser or embedded shell): never call /api/workspace — local caches only.
    if (offlineFromHook) {
      if (cached) {
        setWorkspace(cached);
        setWorkspaceLoading(false);
        setSwitchingCategory(false);
        setError("");
        return () => {
          if (workspaceRetryTimerRef.current !== null) {
            window.clearTimeout(workspaceRetryTimerRef.current);
            workspaceRetryTimerRef.current = null;
          }
        };
      }
      setWorkspaceLoading(false);
      setSwitchingCategory(false);
      setWorkspace(null);
      setError(
        "No offline copy of this workspace yet. Connect once while online so categories and forms can be cached, then this screen works fully offline."
      );
      return () => {
        if (workspaceRetryTimerRef.current !== null) {
          window.clearTimeout(workspaceRetryTimerRef.current);
          workspaceRetryTimerRef.current = null;
        }
      };
    }

    // Online + cache still within TTL: skip duplicate fetch unless forced (still show cache instantly above).
    if (hasFreshCache && cached && !forceRefresh && !forceNetworkRefetch) {
      setWorkspace(cached);
      setWorkspaceLoading(false);
      setSwitchingCategory(false);
      return () => {
        if (workspaceRetryTimerRef.current !== null) {
          window.clearTimeout(workspaceRetryTimerRef.current);
          workspaceRetryTimerRef.current = null;
        }
      };
    }

    // Online + stale / missing cache / ?refresh=1 → revalidate (prefer direct Supabase, fall back to /api/workspace).

    (async () => {
      let data: WorkspaceData | null = null;

      try {
        const supabase = createClient();
        data = (await fetchWorkspaceViaSupabase(supabase, tenantSlug, categoryId)) as WorkspaceData;
      } catch {
        /* RLS not deployed yet or transient PostgREST error — use API route */
      }

      if (!data) {
        const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
        const parsed = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error((parsed as any)?.error || `Failed to load workspace (${res.status})`) as Error & {
            status?: number;
            code?: string;
            deactivationReason?: string | null;
          };
          err.status = res.status;
          err.code = typeof (parsed as any)?.code === "string" ? (parsed as any).code : undefined;
          err.deactivationReason =
            typeof (parsed as any)?.deactivationReason === "string" ? (parsed as any).deactivationReason : null;
          throw err;
        }
        data = parsed as WorkspaceData;
      }

      return data;
    })()
      .then((data) => {
        workspaceBusyRetriesRef.current = 0;
        const sameTenant =
          workspace?.tenant.slug === data.tenant.slug &&
          workspace?.tenant.name === data.tenant.name &&
          workspace?.tenant.logoUrl === data.tenant.logoUrl;
        const sameCategory = workspace?.selectedCategoryId === data.selectedCategoryId;
        const sameTemplates =
          Array.isArray(workspace?.templates) &&
          workspace.templates.length === data.templates.length &&
          workspace.templates.every((t, idx) => {
            const n = data.templates[idx];
            return (
              n &&
              t.id === n.id &&
              t.updatedAt === n.updatedAt &&
              t.categoryId === n.categoryId &&
              t.title === n.title
            );
          });

        if (!(sameTenant && sameCategory && sameTemplates)) {
          setWorkspace(data);
          setUiActiveCategoryId(null);
        }
        localStorage.setItem("lastTenantSlug", data.tenant.slug);
        writeWorkspaceCache(cacheUserId, tenantSlug, categoryId, data);

        // Also cache under resolved selected category for instant tab switching.
        if (data.selectedCategoryId) {
          writeWorkspaceCache(cacheUserId, tenantSlug, data.selectedCategoryId, data);
        }

        if (data.selectedCategoryId && data.selectedCategoryId !== (categoryId ?? "")) {
          const next = new URLSearchParams(searchParams.toString());
          next.set("tenantSlug", data.tenant.slug);
          next.set("categoryId", data.selectedCategoryId);
          next.set("view", activeView);
          next.delete("refresh");
          router.replace(`/workspace?${next.toString()}`);
        } else if (forceRefresh) {
          const next = new URLSearchParams(searchParams.toString());
          next.set("view", activeView);
          next.delete("refresh");
          router.replace(`/workspace?${next.toString()}`);
        }
      })
      .catch((err) => {
        const busy = err?.status === 503 || /Workspace backend is busy/i.test(String(err?.message || ""));
        if (isTenantDeactivatedError(err)) {
          keepLoading = false;
          handleTenantDeactivatedExit(deactivationReasonFromError(err));
          return;
        }
        const authOrAccess =
          err?.status === 401 ||
          (err?.status === 403 && !isTenantDeactivatedError(err)) ||
          /Forbidden|Unauthorized/i.test(String(err?.message || ""));
        if (!hasCached) {
          if (busy || authOrAccess) {
            if (isAppOffline()) {
              keepLoading = false;
              setWorkspaceLoading(false);
              setSwitchingCategory(false);
              return;
            }
            workspaceBusyRetriesRef.current += 1;
            const maxBusyRetries = 28;
            if (workspaceBusyRetriesRef.current >= maxBusyRetries) {
              keepLoading = false;
              setWorkspace(null);
              setUiActiveCategoryId(null);
              setError(
                "Workspace did not respond in time (often the dev server or database is overloaded — especially after many parallel requests). Reload when Next.js has finished compiling, or stop other heavy tabs."
              );
              workspaceBusyRetriesRef.current = 0;
              return;
            }
            // Keep the first-time download panel visible and retry shortly instead of flashing an error state.
            keepLoading = true;
            if (!hasCached) {
              setWorkspace(null);
              setUiActiveCategoryId(null);
            }
            setError("");
            if (workspaceRetryTimerRef.current !== null) {
              window.clearTimeout(workspaceRetryTimerRef.current);
            }
            workspaceRetryTimerRef.current = window.setTimeout(() => {
              setRevalidateTick((x) => x + 1);
            }, 1200);
            return;
          }
          setWorkspace(null);
          setUiActiveCategoryId(null);
          setError(err?.message || "Failed to load workspace");
        }
      })
      .finally(() => {
        if (!keepLoading) setWorkspaceLoading(false);
        setSwitchingCategory(false);
      });

    return () => {
      if (workspaceRetryTimerRef.current !== null) {
        window.clearTimeout(workspaceRetryTimerRef.current);
        workspaceRetryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, accessToken, tenantSlug, workspaceLoadKey, revalidateTick, cacheUserId, offlineFromHook]);

  async function handleSeed(names: string[]) {
    if (!accessToken || !tenantSlug) return;

    setSeedBusy(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/workspace/seed"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, names }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Seed failed (${res.status})`);

      setSeedOpen(false);
      setNotification({
        title: "Categories created",
        message: "Your new categories are ready. You can now start building forms.",
        tone: "success",
      });

      // Refresh workspace data in-place (no route change) so users see updates immediately.
      const refreshUrl = new URL(apiUrl("/api/workspace"));
      refreshUrl.searchParams.set("tenantSlug", tenantSlug);
      if (categoryId) refreshUrl.searchParams.set("categoryId", categoryId);

      const refreshRes = await fetch(refreshUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const refreshData = await refreshRes.json().catch(() => ({}));
      if (refreshRes.ok && refreshData?.tenant) {
        const nextWorkspace = refreshData as WorkspaceData;
        setWorkspace(nextWorkspace);
        setUiActiveCategoryId(null);
        writeWorkspaceCache(cacheUserId, tenantSlug, categoryId, nextWorkspace);
        if (nextWorkspace.selectedCategoryId) {
          writeWorkspaceCache(cacheUserId, tenantSlug, nextWorkspace.selectedCategoryId, nextWorkspace);
        }
      } else {
        // Fallback: trigger existing revalidation flow if direct refresh fails.
        forceWorkspaceNetworkRefetchRef.current = true;
        setRevalidateTick((x) => x + 1);
      }
    } catch (err: any) {
      setError(err?.message || "Seed failed");
    } finally {
      setSeedBusy(false);
    }
  }

  useEffect(() => {
    const ts = localStorage.getItem("offlinePreparedAt");
    if (ts) {
      setOfflinePreparedAt(ts);
      return;
    }
    if (tenantSlug && readWorkspaceCacheResolved(cacheUserId, tenantSlug, categoryId) && isTenantTemplateBulkCached(tenantSlug)) {
      setOfflinePreparedAt("cached");
    }
  }, [tenantSlug, categoryId, cacheUserId]);

  useEffect(() => {
    return () => {
      setNativeWarmupRunning(false);
      setOfflinePreparing(false);
    };
  }, []);

  useEffect(() => {
    if (!offlineFromHook) return;
    setNativeWarmupRunning(false);
    setOfflinePreparing(false);
    setWorkspaceLoading(false);
    setSwitchingCategory(false);
  }, [offlineFromHook]);

  // Recover from stuck loading after visiting online-only routes (e.g. settings) without cache.
  useEffect(() => {
    if (!tenantSlug) return;
    const cached = readWorkspaceCacheResolved(cacheUserId, tenantSlug, categoryId);
    if (!cached) return;
    setWorkspace((prev) => prev ?? cached);
    setWorkspaceLoading(false);
    setSwitchingCategory(false);
    setNativeWarmupRunning(false);
    setOfflinePreparing(false);
    setOfflinePreparedAt((prev) => prev ?? "cached");
  }, [tenantSlug, categoryId, cacheUserId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("workspace-notice:v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        message?: string;
        tone?: "default" | "success" | "warning" | "error";
        ts?: number;
      };
      if (!parsed?.message) return;
      if (typeof parsed.ts === "number" && Date.now() - parsed.ts > 90_000) {
        localStorage.removeItem("workspace-notice:v1");
        return;
      }
      setNotification({
        title: "Workspace update",
        message: parsed.message,
        tone: parsed.tone || "default",
      });
      localStorage.removeItem("workspace-notice:v1");
    } catch {
      localStorage.removeItem("workspace-notice:v1");
    }
  }, []);

  useEffect(() => {
    if (!workspace || !tenantSlug || !accessToken) return;
    if (offlineFromHook) return;
    if (offlinePreparedAt && isTenantTemplateBulkCached(tenantSlug)) return;

    primeOfflineCachesInBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, tenantSlug, accessToken, offlinePreparedAt, offlineFromHook]);

  useEffect(() => {
    if (!tenantSlug) return;
    setRecentTemplateIds(readRecentTemplateIds(tenantSlug));
  }, [tenantSlug]);

  useEffect(() => {
    if (!workspace || !accessToken || !tenantSlug) return;
    if (isAppOffline()) return;
    if (isTenantTemplateBulkCached(tenantSlug)) return;

    let active = true;
    (async () => {
      try {
        await cacheAllTenantTemplatesFromApi(accessToken, tenantSlug);
        if (!active) return;
        const now = new Date().toISOString();
        localStorage.setItem("offlineModeEnabled", "1");
        localStorage.setItem("offlinePreparedAt", now);
        setOfflinePreparedAt(now);
      } catch {
        // primeOfflineCachesInBackground also attempts this
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.tenant.slug, workspace?.templates?.length, accessToken, tenantSlug]);

  useEffect(() => {
    if (!workspace || offlineFromHook) return;

    const role = workspace.role || (workspace.isAdmin ? "ADMIN" : "MEMBER");
    const canAccessSettings =
      workspace.capabilities?.canAccessSettings ?? (role === "ADMIN" || role === "MANAGER");
    if (!canAccessSettings) return;

    router.prefetch(`/${workspace.tenant.slug}/settings`);
  }, [
    workspace?.tenant.slug,
    workspace?.capabilities?.canAccessSettings,
    workspace?.role,
    workspace?.isAdmin,
    router,
    offlineFromHook,
  ]);

  useEffect(() => {
    if (!workspace || offlineFromHook) return;
    const toPrefetch = workspace.templates.slice(0, 8);
    for (const t of toPrefetch) {
      router.prefetch(`/${workspace.tenant.slug}/audits/new?templateId=${t.id}`);
    }
  }, [workspace?.tenant.slug, workspaceTemplatesPrefetchKey, router, offlineFromHook]);

  useEffect(() => {
    const onOnline = () => setRevalidateTick((x) => x + 1);
    const onFocus = () => {
      if (!isAppOffline()) setRevalidateTick((x) => x + 1);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !isAppOffline()) {
        setRevalidateTick((x) => x + 1);
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const onInvalidate = (event: Event) => {
      if (isAppOffline()) return;
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (!tenantSlug || custom.detail?.tenantSlug !== tenantSlug) return;
      // Allow mutations (create category/template) to reflect immediately,
      // even if the workspace cache TTL hasn't expired yet.
      forceWorkspaceNetworkRefetchRef.current = true;
      setRevalidateTick((x) => x + 1);
    };
    window.addEventListener("workspace-invalidate", onInvalidate as EventListener);
    return () => window.removeEventListener("workspace-invalidate", onInvalidate as EventListener);
  }, [tenantSlug]);

  useEffect(() => {
    if (!seedOpen || offlineFromHook) return;
    if (!accessToken) return;
    if (suggestionsFetchedRef.current) return;

    suggestionsFetchedRef.current = true;
    setSuggestionsLoading(true);
    const controller = new AbortController();
    fetch(apiUrl("/api/workspace/suggestions"), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load suggestions (${res.status})`);
        return data as { suggestions?: string[] };
      })
      .then((data) => setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []))
      .catch(() => {
        suggestionsFetchedRef.current = false;
        setSuggestions([]);
      })
      .finally(() => setSuggestionsLoading(false));

    return () => controller.abort();
  }, [seedOpen, accessToken, offlineFromHook]);

  useEffect(() => {
    if (!tenantSlug || !workspace) return;

    const total = workspace.templates.length;
    const cachedCount = workspace.templates.reduce((n, t) => {
      return n + (readAuditTemplateCache(tenantSlug, t.id) ? 1 : 0);
    }, 0);

    setPrefetchingSchemas(false);
    setPrefetchProgress({ done: cachedCount, total });
  }, [tenantSlug, workspace]);

  useEffect(() => {
    if (!tenantSlug || !workspace?.templates?.length) return;
    if (isAppOffline()) return;

    let cancelled = false;

    const hydrateTemplateCache = async () => {
      let hydratedCount = 0;

      for (const template of workspace.templates) {
        if (cancelled) return;
        if (readAuditTemplateCache(tenantSlug, template.id)) continue;

        const fromDb = await readAuditTemplateCacheAsync(tenantSlug, template.id);
        if (!fromDb || cancelled) continue;

        writeAuditTemplateCache(tenantSlug, template.id, fromDb);
        hydratedCount += 1;
      }

      if (hydratedCount > 0 && !cancelled) {
        setTemplateHydrationTick((x) => x + 1);
      }
    };

    void hydrateTemplateCache();

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, workspaceTemplatesPrefetchKey, templateHydrationTick]);

  const workspaceRoleForTour = workspace?.role;
  const canManageCategoriesForTour = workspace
    ? (workspace.capabilities?.canManageCategories ??
      (workspaceRoleForTour === "ADMIN" || workspaceRoleForTour === "MANAGER"))
    : false;
  const canCreateFormsForTour = workspace
    ? (workspace.capabilities?.canCreateForms ??
      (workspaceRoleForTour === "ADMIN" || workspaceRoleForTour === "MANAGER"))
    : false;
  const canStaffManageForTour = workspace
    ? (workspace.capabilities?.canManageStaff ??
      (workspaceRoleForTour === "ADMIN" || workspaceRoleForTour === "MANAGER"))
    : false;
  const categoryCountForTour = workspace?.categories.length ?? 0;
  const templateCountForTour = workspace?.templates.length ?? 0;

  useEffect(() => {
    if (!workspace) return;
    if (categoryCountForTour > 0 || templateCountForTour > 0) return;
    if (!(canManageCategoriesForTour || canCreateFormsForTour || canStaffManageForTour)) return;

    try {
      if (workspaceTourSeenKey && localStorage.getItem(workspaceTourSeenKey) === "1") return;
    } catch {
      // ignore storage failures
    }

    setWorkspaceTourOpen(true);
  }, [
    workspace,
    categoryCountForTour,
    templateCountForTour,
    canManageCategoriesForTour,
    canCreateFormsForTour,
    canStaffManageForTour,
    workspaceTourSeenKey,
  ]);

  if (authLoading && !cachedWorkspaceForUi && !hasWorkspaceAccessToken(session)) {
    return <WorkspaceSkeleton />;
  }

  if (sessionRestorePending) {
    return (
      <WorkspaceLoadingShell
        title="Restoring session"
        subtitle="Verifying your sign-in before opening the workspace…"
      />
    );
  }

  // Only show the full skeleton for first paint / initial checks.
  if (tenantSlug && isTenantDeactivatedBlocked(tenantSlug)) {
    return (
      <TenantDeactivatedScreen
        tenantSlug={tenantSlug}
        reason={getTenantDeactivationReason(tenantSlug)}
      />
    );
  }

  if (tenantChoiceLoading) return <WorkspaceSkeleton />;
  if (!cachedWorkspaceForUi && workspaceLoading) return <WorkspaceSkeleton />;

  if (showTenantPicker) {
    return (
      <div className="workspace-shell min-h-dvh">
        <div className="mx-auto max-w-7xl p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Choose a Brand</h1>
              <p className="text-sm text-foreground/70">Select where you want to work.</p>
            </div>
          </div>

          {error ? (
            <div className="ui-card-muted mt-4 p-3 text-sm">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {tenantChoices.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  clearTenantDeactivatedBlocked(t.slug);
                  localStorage.setItem("lastTenantSlug", t.slug);
                  router.push(`/workspace?tenantSlug=${encodeURIComponent(t.slug)}`);
                }}
                className="ui-card p-4 text-left transition hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                    {t.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoUrl} alt={t.name} className="h-10 w-10 object-contain" />
                    ) : (
                      <span className="font-semibold">{t.name[0]}</span>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-sm text-foreground/70">/{t.slug}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <Link href="/onboarding" className="ui-btn-secondary inline-flex h-11 items-center justify-center px-4">
              Create New Brand
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!tenantSlug) {
    return (
      <WorkspaceLoadingShell
        title="Opening workspace"
        subtitle={
          accessToken
            ? "Loading your brand…"
            : "Restoring your session…"
        }
      />
    );
  }

  if (error && !cachedWorkspaceForUi) {
    const offline = offlineFromHook;
    return (
      <div className="min-h-dvh bg-background">
        <div className="mx-auto max-w-7xl p-6">
          <h1 className="text-xl font-semibold">Workspace</h1>
          <div className="mt-4 space-y-3">
            <FeatureSyncNotice
              title={offline ? "Offline and no cache available" : "Live sync required"}
              message={
                offline
                  ? "This brand has not been cached on this device yet. Connect to the internet once so the workspace, schemas, and saved data can be downloaded and kept locally for offline use."
                  : "The workspace works offline from cache, but to see fresh cross-device updates you need internet so the app can pull the latest changes in the background."
              }
              tone="warning"
            />
            <div className="rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm">
              {error}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="h-10 rounded-md bg-foreground px-4 text-background"
              onClick={() => router.replace(`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`)}
            >
              Retry
            </button>
            <button type="button" className="ui-btn-secondary inline-flex h-10 items-center justify-center px-4" onClick={handleSwitchBrand}>
              Switch brand
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!cachedWorkspaceForUi) {
    if (workspaceLoading || tenantChoiceLoading) return <WorkspaceSkeleton />;
    return (
      <WorkspaceUnavailable
        tenantSlug={tenantSlug}
        message={error || "Workspace data is not available yet. Connect to the internet and try again."}
        onRetry={() => {
          forceWorkspaceNetworkRefetchRef.current = true;
          setRevalidateTick((x) => x + 1);
        }}
        onSwitchBrand={handleSwitchBrand}
      />
    );
  }

  if (tenantSlug && isTenantDeactivatedBlocked(tenantSlug)) {
    return (
      <TenantDeactivatedScreen
        tenantSlug={tenantSlug}
        reason={getTenantDeactivationReason(tenantSlug)}
      />
    );
  }

  const workspaceForRender = cachedWorkspaceForUi;
  const { tenant, categories, selectedCategoryId, templates } = workspaceForRender;
  const role = workspaceRole;
  const canManageCategories =
    workspaceForRender.capabilities?.canManageCategories ?? (role === "ADMIN" || role === "MANAGER");
  const canCreateForms =
    workspaceForRender.capabilities?.canCreateForms ?? (role === "ADMIN" || role === "MANAGER");
  const canAccessSettings =
    workspaceForRender.capabilities?.canAccessSettings ?? (role === "ADMIN" || role === "MANAGER");
  const canStaffManage =
    workspaceForRender.capabilities?.canManageStaff ?? (role === "ADMIN" || role === "MANAGER");

  const hasCategories = categories.length > 0;

  return (
    <div className="workspace-shell min-h-dvh">
      <DueReminderPoller tenantSlug={tenant.slug} reminders={reminderTargets} />
      <div className="ws-header-accent" />
      <div className="ws-header sticky top-0 z-10 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4">
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--hse-copper)_35%,var(--hse-teal))] bg-gradient-to-br from-[var(--hse-sky)] to-white shadow-sm">
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.logoUrl}
                  alt={`${tenant.name} logo`}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <span className="text-sm font-semibold">{tenant.name[0]}</span>
              )}
            </div>
            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-[var(--hse-teal)]" />
                <h1 className="truncate text-base font-semibold text-foreground">{tenant.name}</h1>
              </div>
              <p className="hidden text-sm text-[var(--hse-teal-mid)] sm:block">
                {isAdminView ? "HSE management · ISO Pro" : "Field inspections · ISO Pro"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:block">
              <LoggedInStaffBadge tenantSlug={tenant.slug} />
            </div>
            <ConnectivityIndicator />

            {accessToken && tenantSlug ? <WorkspaceMessageInboxButton /> : null}

            <div className="relative">
              <button
                type="button"
                className="ws-btn-ghost inline-flex h-9 items-center justify-center px-3"
                aria-label="Workspace menu"
                title="Menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={openingSettings || openingStaff || loggingOut}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[250] cursor-default"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    className="ui-menu absolute right-0 top-11 z-[251] w-56 p-1"
                    role="menu"
                  >
                    {canManageCategories ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                          onClick={() => {
                            setMenuOpen(false);
                            if (blockIfOffline("Manage categories")) return;
                            pushTenantRoute(router, tenant.slug, "categories");
                          }}
                        >
                          <FolderTree className="h-4 w-4" />
                          Manage categories
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                          onClick={() => {
                            setMenuOpen(false);
                            if (blockIfOffline("Categories")) return;
                            setSeedOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          Add categories
                        </button>
                      </>
                    ) : null}

                    {canCreateForms ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                          onClick={() => {
                            setMenuOpen(false);
                            if (blockIfOffline("Create custom form")) return;
                            router.push(
                              buildTenantHref(tenant.slug, "templates/new", {
                                categoryId: workspaceForRender.selectedCategoryId || undefined,
                              })
                            );
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          Create custom form
                        </button>

                      </>
                    ) : null}

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                      onClick={() => {
                        setMenuOpen(false);
                        if (blockIfOffline("Staff training")) return;
                        router.push(`/workspace/training?tenantSlug=${encodeURIComponent(tenant.slug)}`);
                      }}
                    >
                      <GraduationCap className="h-4 w-4" />
                      Staff training
                    </button>

                    <WorkspaceAndroidAppMenuItem onNavigate={() => setMenuOpen(false)} />

                    <div className="px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
                        Theme
                      </div>
                      <select
                        className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value as WorkspaceTheme)}
                      >
                        <option value="hse-pro">HSE Professional</option>
                        <option value="default">Classic</option>
                        <option value="slate-soft">Slate soft</option>
                        <option value="warm-paper">Warm paper</option>
                        <option value="mint-soft">Mint soft</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                      onClick={() => {
                        setMenuOpen(false);
                        if (blockIfOffline("Prepare offline mode")) return;
                        setConfirmOfflineOpen(true);
                      }}
                      disabled={offlinePreparing}
                    >
                      {offlinePreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {offlinePreparing ? "Preparing offline mode..." : "Prepare offline mode"}
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100"
                      onClick={() => clearTenantLocalCache()}
                    >
                      Clear local cache
                    </button>

                    {canAccessSettings ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleOpenSettings(tenant.slug)}
                        disabled={openingSettings || loggingOut}
                      >
                        {openingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                        {openingSettings ? "Opening…" : "Settings"}
                      </button>
                    ) : null}

                    {canStaffManage ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleOpenStaffManagement(tenant.slug)}
                        disabled={openingStaff || loggingOut}
                      >
                        {openingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
                        {openingStaff ? "Opening…" : "Staff management"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleLogout}
                      disabled={openingSettings || openingStaff || loggingOut}
                    >
                      {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {loggingOut ? "Signing out…" : "Log out"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {isFormsView && hasCategories ? (
          <div className="mx-auto max-w-7xl px-4 pb-3">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch]">
              {categories.map((c) => {
                const active = c.id === activeCategoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      if (offlineWarmupBlocking) return;
                      if (c.id === activeCategoryId) return;
                      const cachedCategoryData = readWorkspaceCache(cacheUserId, tenant.slug, c.id);
                      if (cachedCategoryData) {
                        setWorkspace(cachedCategoryData);
                        setUiActiveCategoryId(null);
                        setSwitchingCategory(false);
                      } else {
                        setUiActiveCategoryId(c.id);
                        setSwitchingCategory(true);
                      }

                      const next = new URLSearchParams(searchParams.toString());
                      next.set("tenantSlug", tenant.slug);
                      next.set("categoryId", c.id);
                      next.set("view", activeView);
                      router.push(`/workspace?${next.toString()}`);
                    }}
                    disabled={offlineWarmupBlocking}
                    className={
                      active
                        ? "ws-category-active h-9 shrink-0 rounded-full px-4 text-sm font-medium"
                        : "ws-category-inactive h-9 shrink-0 rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-3">
        <div className="h-px bg-foreground/10" />
      </div>

      <div className="mx-auto max-w-7xl p-4 pb-8">
        {error ? (
          <div className="mb-4 rounded-md border border-foreground/20 bg-background p-3 text-sm">
            {error}
          </div>
        ) : null}

        {workspace && switchingCategory ? (
          <div className="mb-4 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
            Loading this category in the background. Your current workspace stays open so you can keep working while the new
            category warms from cache.
          </div>
        ) : null}

        {isAdminView ? (
          <section className="ws-panel mb-4 overflow-hidden">
            <div className="ws-admin-hero relative overflow-hidden border-b border-[color-mix(in_srgb,var(--hse-teal)_12%,transparent)] px-4 py-5 sm:px-5 sm:py-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,61,51,0.08),transparent_50%)]" />
              <div className="absolute -right-12 top-0 h-32 w-32 rounded-full bg-sky-300/25 blur-3xl" />
              <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hse-teal-mid)]">
                    HSE console
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-[var(--hse-charcoal)] sm:text-3xl">
                    Health, safety &amp; environment management
                  </h2>
                  <p className="max-w-xl text-sm leading-6 text-[var(--accent-soft)] sm:text-base">
                    Configure categories, staff, and compliance settings for this brand. Open field inspections when your team is ready to run checklists or review submissions.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenFormsWorkspace}
                  disabled={openingFormsNav}
                  className="ws-btn-primary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {openingFormsNav ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {openingFormsNav ? "Opening forms…" : "Open forms workspace"}
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {canManageCategories ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (blockIfOffline("Categories")) return;
                        setSeedOpen(true);
                      }}
                      className="ws-toolbar-btn disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={seedBusy}
                    >
                      {seedBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {seedBusy ? "Creating…" : "Create categories"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (blockIfOffline("Manage categories")) return;
                        pushTenantRoute(router, tenant.slug, "categories");
                      }}
                      className="ws-toolbar-btn"
                    >
                      <FolderTree className="h-4 w-4" />
                      Manage categories
                    </button>
                  </>
                ) : null}

                {canCreateForms ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (blockIfOffline("Create forms")) return;
                      setAddFormOpen(true);
                    }}
                    className="ws-toolbar-btn"
                  >
                    <FileText className="h-4 w-4" />
                    Create forms
                  </button>
                ) : null}

                {canAccessSettings ? (
                  <button
                    type="button"
                    onClick={() => handleOpenSettings(tenant.slug)}
                    disabled={openingSettings}
                    className="ws-toolbar-btn disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {openingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                    {openingSettings ? "Opening…" : "Settings"}
                  </button>
                ) : null}

                {canStaffManage ? (
                  <button
                    type="button"
                    onClick={() => handleOpenStaffManagement(tenant.slug)}
                    disabled={openingStaff}
                    className="ws-toolbar-btn disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {openingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
                    {openingStaff ? "Opening…" : "Staff management"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => handleOpenAudits(tenant.slug)}
                disabled={openingAudits}
                className="ws-action-card group p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start gap-3">
                  <span className="ws-icon-indigo inline-flex h-11 w-11 items-center justify-center rounded-2xl">
                    {openingAudits ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{openingAudits ? "Opening…" : "View forms"}</span>
                    <span className="mt-1 block text-xs text-foreground/65">Drafts and submitted records</span>
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleOpenActivity(tenant.slug)}
                disabled={openingActivity}
                className="ws-action-card group p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start gap-3">
                  <span className="ws-icon-sky inline-flex h-11 w-11 items-center justify-center rounded-2xl">
                    {openingActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{openingActivity ? "Opening…" : "Activity monitor"}</span>
                    <span className="mt-1 block text-xs text-foreground/65">Track staff and system actions</span>
                  </span>
                </div>
              </button>

              {canAccessSettings ? (
                <button
                  type="button"
                  onClick={() => handleOpenSettings(tenant.slug)}
                  disabled={openingSettings}
                  className="ws-action-card group p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-start gap-3">
                    <span className="ws-icon-violet inline-flex h-11 w-11 items-center justify-center rounded-2xl">
                      {openingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{openingSettings ? "Opening…" : "Brand settings"}</span>
                      <span className="mt-1 block text-xs text-foreground/65">Logo, compliance, and preferences</span>
                    </span>
                  </div>
                </button>
              ) : null}

              {canAccessSettings ? (
                <button
                  type="button"
                  onClick={() => handleOpenAdminDashboard(tenant.slug)}
                  disabled={openingAdminDashboard}
                  className="ws-action-card group p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-start gap-3">
                    <span className="ws-icon-violet inline-flex h-11 w-11 items-center justify-center rounded-2xl">
                      {openingAdminDashboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutDashboard className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{openingAdminDashboard ? "Opening…" : "Admin dashboard"}</span>
                      <span className="mt-1 block text-xs text-foreground/65">Compliance metrics, alerts, and staff performance</span>
                    </span>
                  </div>
                </button>
              ) : null}

              {canStaffManage ? (
                <button
                  type="button"
                  onClick={() => handleOpenStaffManagement(tenant.slug)}
                  disabled={openingStaff}
                  className="ws-action-card group p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-start gap-3">
                    <span className="ws-icon-emerald inline-flex h-11 w-11 items-center justify-center rounded-2xl">
                      {openingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{openingStaff ? "Opening…" : "Staff management"}</span>
                      <span className="mt-1 block text-xs text-foreground/65">Invite, update, and remove brand staff</span>
                    </span>
                  </div>
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleSwitchBrand}
                className="group ui-card-muted p-4 text-left transition hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                    <LayoutDashboard className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Switch brand</span>
                    <span className="mt-1 block text-xs text-foreground/65">Choose another brand for this account</span>
                  </span>
                </div>
              </button>
            </div>
          </section>
        ) : null}

        {isFormsView ? (
          <div id="workspace-forms" className="grid gap-3">
            <div className="ws-panel flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--hse-teal)]">Field inspections</div>
                <div className="text-sm text-slate-600">Start checklists, resume drafts, and review submitted HSE records.</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAudits(tenant.slug)}
                  disabled={openingAudits}
                  className="ws-btn-ghost inline-flex h-9 items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {openingAudits ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {openingAudits ? "Opening…" : "Submitted forms"}
                </button>
                {canAccessSettings ? (
                  <button
                    type="button"
                    onClick={handleOpenAdminView}
                    disabled={openingAdminNav}
                    className="ws-btn-ghost inline-flex h-9 items-center justify-center gap-2 px-4 text-sm disabled:opacity-60"
                  >
                    {openingAdminNav ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    HSE console
                  </button>
                ) : null}
              </div>
            </div>

            <div className="ws-panel p-3 sm:p-4">
              <div className="relative flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                  aria-expanded={searchOpen}
                  aria-label="Toggle form search"
                >
                  <Search className="h-4 w-4" />
                  Search
                </button>

                {recentTemplates.length > 0 ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setRecentOpen((v) => !v)}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                      aria-expanded={recentOpen}
                      aria-label="Toggle recent forms"
                    >
                      <Clock3 className="h-4 w-4" />
                      Recent forms
                    </button>

                    {recentOpen ? (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-10 cursor-default"
                          aria-label="Close recent forms"
                          onClick={() => setRecentOpen(false)}
                        />
                        <div className="absolute right-0 top-11 z-20 w-72 rounded-md border border-foreground/20 bg-background p-2 shadow-sm">
                          <div className="mb-1 px-2 py-1 text-xs font-medium text-foreground/70">Recent forms</div>
                          <div className="flex max-h-60 flex-col overflow-auto">
                            {recentTemplates.map((t) => (
                              <button
                                key={`recent-dropdown-${t.id}`}
                                type="button"
                                onMouseEnter={() => {
                                  prefetchTemplateSchema(t.id).catch(() => {
                                    // best-effort prefetch
                                  });
                                  router.prefetch(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                                }}
                                onFocus={() => {
                                  prefetchTemplateSchema(t.id).catch(() => {
                                    // best-effort prefetch
                                  });
                                  router.prefetch(tenantRouteHref(tenant.slug, "audits/new", { templateId: t.id }));
                                }}
                                onClick={() => {
                                  setRecentOpen(false);
                                  setOpeningTemplateId(t.id);
                                  rememberRecentTemplate(t.id);
                                  prefetchTemplateSchema(t.id).catch(() => {});
                                  pushTenantRoute(router, tenant.slug, "audits/new", { templateId: t.id });
                                  window.setTimeout(() => setOpeningTemplateId(null), 600);
                                }}
                                className="rounded-md px-2 py-2 text-left text-sm hover:bg-foreground/5"
                              >
                                {t.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {searchOpen ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="template-search"
                    type="search"
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    placeholder="Search by form title"
                    className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm outline-none ring-0 placeholder:text-foreground/40 focus:border-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateQuery("");
                      setSearchOpen(false);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
                    aria-label="Close search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>

            {!hasCategories ? (
              <div className="rounded-lg border border-foreground/20 bg-background p-4 sm:p-5">
                <div className="inline-flex items-center rounded-full border border-foreground/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/60">
                  Start here
                </div>
                <h2 className="mt-2 text-base font-semibold">Create categories to begin</h2>
                <p className="mt-1 text-sm text-foreground/70">
                  Categories keep forms organised. Create categories first, then build forms under each one.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={openWorkspaceSeedFromTour}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-background"
                  >
                    Create categories
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceTourOpen(true)}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4 hover:bg-foreground/5"
                  >
                    Why this matters
                  </button>
                  <Link
                    href={`/workspace/training?tenantSlug=${encodeURIComponent(tenant.slug)}`}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4 hover:bg-foreground/5"
                  >
                    Staff training
                  </Link>
                </div>
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-foreground/20 bg-background p-6">
                <h2 className="text-lg font-semibold">No forms in this category yet.</h2>
                <p className="mt-1 text-sm text-foreground/70">Add a form from the library to get started.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setAddFormOpen(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-background"
                  >
                    <Plus className="h-4 w-4" />
                    Add a form
                  </button>
                  <Link
                    href={`/workspace/training?tenantSlug=${encodeURIComponent(tenant.slug)}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-foreground/20 px-4 hover:bg-foreground/5"
                  >
                    <GraduationCap className="h-4 w-4" />
                    Staff training
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredTemplates.length === 0 ? (
                  <div className="rounded-lg border border-foreground/20 bg-background p-6">
                    <h2 className="text-base font-semibold">No matching forms</h2>
                    <p className="mt-1 text-sm text-foreground/70">Try a different search term.</p>
                  </div>
                ) : (
                  filteredTemplates.map((t) => (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onMouseEnter={() => {
                        prefetchTemplateSchema(t.id).catch(() => {
                          // best-effort prefetch
                        });
                        router.prefetch(tenantRouteHref(tenant.slug, "audits/new", { templateId: t.id }));
                      }}
                      onFocus={() => {
                        prefetchTemplateSchema(t.id).catch(() => {
                          // best-effort prefetch
                        });
                        router.prefetch(tenantRouteHref(tenant.slug, "audits/new", { templateId: t.id }));
                      }}
                      onClick={() => {
                        setOpeningTemplateId(t.id);
                        rememberRecentTemplate(t.id);
                        prefetchTemplateSchema(t.id).catch(() => {});
                        pushTenantRoute(router, tenant.slug, "audits/new", { templateId: t.id });
                        window.setTimeout(() => setOpeningTemplateId(null), 600);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        setOpeningTemplateId(t.id);
                        rememberRecentTemplate(t.id);
                        prefetchTemplateSchema(t.id).catch(() => {});
                        pushTenantRoute(router, tenant.slug, "audits/new", { templateId: t.id });
                        window.setTimeout(() => setOpeningTemplateId(null), 600);
                      }}
                      className={
                        "relative w-full rounded-lg border p-4 text-left focus:outline-none focus:ring-2 focus:ring-foreground/30 " +
                        templateCardClasses(t.settings?.cardColor) +
                        " " +
                        (openingTemplateId === t.id ? "opacity-80" : "")
                      }
                    >
                      <div className="flex items-start justify-between gap-4 pr-8">
                        <div className="min-w-0 flex items-start gap-3">
                          <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-foreground/20 bg-background text-lg leading-none">
                            {templateIconGlyph(t.settings?.cardIcon)}
                          </div>
                          <div className="min-w-0">
                          <div className="font-semibold">{t.title}</div>
                          <div className="text-sm text-foreground/70">
                            {openingTemplateId === t.id ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Opening form...
                              </span>
                            ) : (
                              "Run audit"
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <div
                              className={
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                                (reminderDueTemplateIds.has(t.id)
                                  ? "border-red-300/80 bg-red-50 text-red-800"
                                  : "border-foreground/15 bg-foreground/[0.03] text-foreground/60")
                              }
                            >
                              {formatDueRuleSummary(
                                t.settings?.dueRule ?? null,
                                t.settings?.dueReminderAt ? new Date(t.settings.dueReminderAt) : null
                              )}
                            </div>
                            {draftTemplateIds.has(t.id) ? (
                              <div className="inline-flex rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                Saved draft
                              </div>
                            ) : null}
                          </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {canStaffManage ? (
                            <div className="relative z-20">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cardMenuBtnRef.current = e.currentTarget;
                                  setCardMenuTemplateId((current) => (current === t.id ? null : t.id));
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 bg-background text-foreground/70 hover:bg-foreground/5"
                                aria-label={`Open actions for ${t.title}`}
                                aria-expanded={cardMenuTemplateId === t.id}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              <FloatingActionMenu
                                open={cardMenuTemplateId === t.id}
                                anchorRef={cardMenuBtnRef}
                                onClose={() => setCardMenuTemplateId(null)}
                              >
                                {canManageCategories && categories.length > 0 ? (
                                  <div className="border-b border-foreground/10 px-3 py-2">
                                    <div className="text-xs font-medium text-foreground/55">Move to category</div>
                                    <select
                                      className="mt-1 h-9 w-full rounded-lg border border-foreground/15 bg-background px-2 text-sm"
                                      value={t.categoryId || ""}
                                      disabled={movingTemplateId === t.id}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const next = e.target.value;
                                        if (!next) return;
                                        void moveTemplateToCategory(t, next);
                                      }}
                                    >
                                      {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setCardMenuTemplateId(null);
                                    await openQuickSettings(t);
                                  }}
                                >
                                  Quick settings
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCardMenuTemplateId(null);
                                    router.push(
                                      buildTenantHref(tenant.slug, "templates/new", {
                                        editTemplateId: t.id,
                                        categoryId: t.categoryId || undefined,
                                      })
                                    );
                                  }}
                                >
                                  Edit form structure
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCardMenuTemplateId(null);
                                    const editLink = `${window.location.origin}${buildTenantHref(tenant.slug, "templates/new", {
                                      editTemplateId: t.id,
                                      categoryId: t.categoryId || undefined,
                                    })}`;
                                    navigator.clipboard.writeText(editLink).then(() => {
                                      setNotification({
                                        title: "Link copied",
                                        message: "The edit link is ready to share.",
                                        tone: "success",
                                      });
                                    }).catch(() => {
                                      setNotification({
                                        title: "Copy failed",
                                        message: "Your browser blocked clipboard access, so copy the form link manually.",
                                        tone: "warning",
                                      });
                                    });
                                  }}
                                >
                                  Copy edit link
                                </button>
                              </FloatingActionMenu>
                            </div>
                          ) : null}

                          {openingTemplateId === t.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-foreground/60" />
                          ) : (
                            <span className="text-sm text-foreground/60">→</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : canSeeAdminHub ? (
          <div className="rounded-xl border border-dashed border-foreground/20 bg-background/80 p-5 text-sm text-foreground/70">
            Admins land on HSE management first. Open field inspections when you need checklists, drafts, or submitted records.
          </div>
        ) : null}
      </div>

      <WorkspaceSeedModal
        open={seedOpen}
        onClose={() => (seedBusy ? null : setSeedOpen(false))}
        onSubmit={handleSeed}
        busy={seedBusy}
        suggestions={suggestions}
        loadingSuggestions={suggestionsLoading}
      />

      <WorkspaceTourModal
        open={workspaceTourOpen}
        onClose={dismissWorkspaceTour}
        onStartSetup={openWorkspaceSeedFromTour}
      />

      {workspace ? (
        <AddFormOptionsModal
          open={addFormOpen}
          onClose={() => setAddFormOpen(false)}
          categories={workspace.categories}
          defaultCategoryId={workspace.selectedCategoryId}
          onAddFromTemplates={handleAddFromTemplates}
          onCreateCustom={handleCreateCustomForm}
        />
      ) : null}

      <NotificationModal
        open={confirmOfflineOpen}
        title="Enable offline mode?"
        message="This will cache forms and category data for faster loading and reliable use on weak internet."
        tone="warning"
        actionLabel="Enable"
        onAction={async () => {
          setConfirmOfflineOpen(false);
          await prepareOfflineMode();
        }}
        onClose={() => setConfirmOfflineOpen(false)}
      />

      <NotificationModal
        open={Boolean(notification)}
        title={notification?.title || ""}
        message={notification?.message || ""}
        tone={notification?.tone || "default"}
        onClose={() => setNotification(null)}
      />

      <TemplateQuickSettingsModal
        open={Boolean(quickSettingsTemplate)}
        template={quickSettingsTemplate}
        saving={quickSettingsSaving || quickSettingsLoading}
        error={quickSettingsError}
        showTemperatureSettings={Boolean(quickSettingsTemplate?.hasTemperatureInputs)}
        onClose={() => {
          if (quickSettingsSaving || quickSettingsLoading) return;
          setQuickSettingsTemplate(null);
          setQuickSettingsError("");
        }}
        onSave={saveQuickSettings}
      />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <BackgroundSyncManager />
      <WorkspacePageInner />
    </Suspense>
  );
}
