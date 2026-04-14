"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Clock3, Loader2, ShieldAlert, Sparkles, Users, FileText, Settings2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { readCachedActivityRows, writeCachedActivityRows, type CachedActivityRow } from "@/lib/client/activityCache";
import { readAuditsListCache, writeAuditsListCache, type CachedAuditRow } from "@/lib/client/auditsListCache";

type WorkspaceResponse = {
  tenant: { id: string; name: string; slug: string; logoUrl: string | null };
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  selectedCategoryId: string | null;
  templates: Array<{ id: string; title: string; updatedAt: string; categoryId: string | null }>;
  isAdmin: boolean;
  role: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
  capabilities: {
    canAccessSettings: boolean;
    canCreateForms: boolean;
    canManageCategories: boolean;
    canManageStaff: boolean;
  };
};

type ActivityRow = {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

type StaffRow = {
  userId: string;
  role: string;
  email: string;
  fullName: string;
  hasPassword: boolean;
};

type DashboardMetricsResponse = {
  tenant: { id: string; name: string; slug: string };
  summary: {
    submittedCount: number;
    draftCount: number;
    staffCount: number;
    complianceRate: number;
  };
  temperature: {
    totalReadings: number;
    totalAlerts: number;
    averageTemperature: number | null;
    minTemperature: number | null;
    maxTemperature: number | null;
    recentAlerts: Array<{
      auditId: string;
      templateTitle: string;
      createdAt: string;
      key: string;
      label: string;
      value: number;
      unit?: "C" | "F";
      alertBelow?: number;
      alertAbove?: number;
    }>;
    daily: Array<{ day: string; readings: number; alerts: number; average: number | null }>;
  };
};

const RISK_ACTIONS = new Set([
  "staff.remove",
  "staff.upsert",
  "staff.update",
  "template.delete",
  "template.update.versioned",
  "category.delete",
]);

function humanizeAction(action: string) {
  return action
    .replace(/^audit\./, "Audit ")
    .replace(/^template\./, "Template ")
    .replace(/^staff\./, "Staff ")
    .replace(/^category\./, "Category ")
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function detailObject(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function isRiskRow(row: ActivityRow) {
  const details = detailObject(row.details);
  return Boolean(RISK_ACTIONS.has(row.action) || details?.hasTemperatureAlerts);
}

function actorLabel(row: ActivityRow) {
  return row.actorName || row.actorEmail || row.userId;
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatDayLabel(day: string) {
  const date = new Date(`${day}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function TenantDashboardClient({ tenantSlug }: { tenantSlug: string }) {
  const { session, loading: authLoading } = useAuth();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [audits, setAudits] = useState<CachedAuditRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetricsResponse | null>(null);

  useEffect(() => {
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!tenantSlug) return;

    const cachedActivity = readCachedActivityRows(tenantSlug);
    if (cachedActivity.length > 0) {
      setActivity(cachedActivity as ActivityRow[]);
    }

    const cachedAudits = readAuditsListCache(session?.user?.id || null, tenantSlug);
    if (cachedAudits?.rows?.length) {
      setAudits(cachedAudits.rows);
    }
  }, [tenantSlug, session?.user?.id]);

  useEffect(() => {
    const onActivityUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (custom.detail?.tenantSlug !== tenantSlug) return;
      const cached = readCachedActivityRows(tenantSlug);
      setActivity(cached as ActivityRow[]);
    };

    const onAuditsUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (custom.detail?.tenantSlug !== tenantSlug) return;
      const cached = readAuditsListCache(session?.user?.id || null, tenantSlug);
      if (cached?.rows?.length) setAudits(cached.rows);
    };

    window.addEventListener("activity-cache-updated", onActivityUpdate as EventListener);
    window.addEventListener("audits-cache-updated", onAuditsUpdate as EventListener);
    return () => {
      window.removeEventListener("activity-cache-updated", onActivityUpdate as EventListener);
      window.removeEventListener("audits-cache-updated", onAuditsUpdate as EventListener);
    };
  }, [tenantSlug, session?.user?.id]);

  useEffect(() => {
    const token = session?.access_token || "";
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!online) {
      setLoading(false);
      return;
    }

    if (!token || !tenantSlug) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const fetchJson = async <T,>(url: string) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      return json as T;
    };

    const load = async () => {
      const workspaceUrl = new URL("/api/workspace", window.location.origin);
      workspaceUrl.searchParams.set("tenantSlug", tenantSlug);

      const auditsUrl = new URL("/api/audit/list", window.location.origin);
      auditsUrl.searchParams.set("tenantSlug", tenantSlug);

      const activityUrl = new URL("/api/activity", window.location.origin);
      activityUrl.searchParams.set("tenantSlug", tenantSlug);
      activityUrl.searchParams.set("limit", "300");

      const metricsUrl = new URL("/api/dashboard/metrics", window.location.origin);
      metricsUrl.searchParams.set("tenantSlug", tenantSlug);

      const staffUrl = new URL("/api/staff", window.location.origin);
      staffUrl.searchParams.set("tenantSlug", tenantSlug);

      const [workspaceResult, auditsResult, activityResult, staffResult, metricsResult] = await Promise.allSettled([
        fetchJson<WorkspaceResponse>(workspaceUrl.toString()),
        fetchJson<{ rows?: CachedAuditRow[]; maxUpdatedAt?: string | null }>(auditsUrl.toString()),
        fetchJson<{ rows?: ActivityRow[] }>(activityUrl.toString()),
        fetchJson<{ staff?: StaffRow[] }>(staffUrl.toString()),
        fetchJson<DashboardMetricsResponse>(metricsUrl.toString()),
      ]);

      if (cancelled) return;

      if (workspaceResult.status === "fulfilled") {
        setWorkspace(workspaceResult.value);
      }

      if (auditsResult.status === "fulfilled") {
        const nextAudits = Array.isArray(auditsResult.value.rows) ? auditsResult.value.rows : [];
        if (nextAudits.length > 0) {
          setAudits(nextAudits);
          writeAuditsListCache(session?.user?.id || null, tenantSlug, nextAudits, auditsResult.value.maxUpdatedAt || null);
        }
      }

      if (activityResult.status === "fulfilled") {
        const nextActivity = Array.isArray(activityResult.value.rows) ? activityResult.value.rows : [];
        if (nextActivity.length > 0) {
          setActivity(nextActivity);
          writeCachedActivityRows(tenantSlug, nextActivity as CachedActivityRow[]);
        }
      }

      if (staffResult.status === "fulfilled") {
        setStaff(Array.isArray(staffResult.value.staff) ? staffResult.value.staff : []);
      }

      if (metricsResult && metricsResult.status === "fulfilled") {
        setDashboardMetrics(metricsResult.value);
      }

      const usableData =
        workspaceResult.status === "fulfilled" ||
        auditsResult.status === "fulfilled" ||
        activityResult.status === "fulfilled" ||
        staffResult.status === "fulfilled" ||
        metricsResult?.status === "fulfilled";
      if (!usableData && !online) {
        setError("This dashboard is cached locally but needs internet to refresh cross-device data.");
      }

      setLoading(false);
    };

    load().catch((err) => {
      if (cancelled) return;
      if (!workspace && audits.length === 0 && activity.length === 0 && staff.length === 0) {
        setError(err?.message || "Failed to load dashboard");
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, online, session?.access_token, session?.user?.id, tenantSlug]);

  if (!online) {
    return (
      <OfflineRouteBlock
        title="Admin dashboard needs internet"
        message="This dashboard reads live compliance data and staff activity from the database. Open it again once you are online so it can refresh safely."
        hint="Offline cache is reserved for the workspace, saved forms, and form drafting."
        backHref={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
        backLabel="Back to workspace"
      />
    );
  }

  const metrics = useMemo(() => {
    const submitted = audits.filter((row) => row.status === "SUBMITTED");
    const drafts = audits.filter((row) => row.status === "DRAFT");
    const staleDrafts = drafts.filter((row) => Date.now() - new Date(row.createdAt).getTime() > 72 * 60 * 60 * 1000);
    const riskRows = activity.filter(isRiskRow);
    const tempAlerts = activity.filter((row) => detailObject(row.details)?.hasTemperatureAlerts).length;
    const activeActors = new Set(activity.map((row) => row.userId)).size;
    const submissionRate = audits.length > 0 ? (submitted.length / audits.length) * 100 : 0;
    const staffCoverage = staff.length > 0 ? (activeActors / staff.length) * 100 : 0;
    const categories = workspace?.categories.length || 0;
    const templates = workspace?.templates.length || 0;
    const dashboardTemp = dashboardMetrics?.temperature;

    return {
      submitted: submitted.length,
      drafts: drafts.length,
      staleDrafts: staleDrafts.length,
      riskRows: riskRows.length,
      tempAlerts,
      realTempReadings: dashboardTemp?.totalReadings || 0,
      realTempAlerts: dashboardTemp?.totalAlerts || 0,
      avgTemp: dashboardTemp?.averageTemperature ?? null,
      minTemp: dashboardTemp?.minTemperature ?? null,
      maxTemp: dashboardTemp?.maxTemperature ?? null,
      activeActors,
      submissionRate,
      staffCoverage,
      categories,
      templates,
      complianceRate: dashboardMetrics?.summary.complianceRate || 0,
    };
  }, [activity, audits, dashboardMetrics, staff.length, workspace?.categories.length, workspace?.templates.length]);

  const activityByActor = useMemo(() => {
    const map = new Map<string, { name: string; total: number; submissions: number; risk: number }>();
    for (const row of activity) {
      const key = row.userId;
      const current = map.get(key) || { name: actorLabel(row), total: 0, submissions: 0, risk: 0 };
      current.total += 1;
      if (row.action === "audit.submit") current.submissions += 1;
      if (isRiskRow(row)) current.risk += 1;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [activity]);

  const timeline = useMemo(() => {
    const days: string[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      days.push(date.toISOString().slice(0, 10));
    }

    return days.map((day) => {
      const submissions = activity.filter((row) => row.action === "audit.submit" && dayKey(row.createdAt) === day).length;
      const alerts = activity.filter((row) => isRiskRow(row) && dayKey(row.createdAt) === day).length;
      const drafts = audits.filter((row) => row.status === "DRAFT" && dayKey(row.createdAt) === day).length;
      return { day, submissions, alerts, drafts };
    });
  }, [activity, audits]);

  const latestRisks = useMemo(() => activity.filter(isRiskRow).slice(0, 5), [activity]);

  const maxTimelineValue = Math.max(
    1,
    ...timeline.flatMap((entry) => [entry.submissions, entry.alerts, entry.drafts])
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-foreground/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(242,245,248,0.96),_rgba(229,231,235,0.92))] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <Sparkles className="h-3.5 w-3.5" />
              Admin dashboard
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Compliance and operations overview</h1>
            <p className="mt-1 max-w-2xl text-sm text-foreground/70">
              Track staff activity, temperature alerts, audit throughput, and follow-up risk from one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-foreground/65">
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <Clock3 className="h-3.5 w-3.5" />
              {online ? "Live" : "Cached"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {metrics.riskRows} risk events
            </span>
          </div>
        </div>
      </div>

      <FeatureSyncNotice
        title="Cross-device sync requires internet"
        message="This dashboard uses cached data for fast loading, but fresh compliance, staff, and activity updates only arrive when the device is online."
      />

      {loading ? (
        <div className="rounded-xl border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          <div className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading dashboard metrics...
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Submission rate" value={percent(metrics.submissionRate)} helper={`${metrics.submitted} submitted / ${audits.length} forms`} icon={<BarChart3 className="h-4 w-4" />} />
        <MetricCard title="Drafts" value={String(metrics.drafts)} helper={`${metrics.staleDrafts} stale drafts over 72h`} icon={<FileText className="h-4 w-4" />} />
        <MetricCard title="Temperature alerts" value={String(metrics.realTempAlerts || metrics.tempAlerts)} helper="Captured from saved audit payloads" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard title="Staff coverage" value={percent(metrics.staffCoverage)} helper={`${metrics.activeActors} active actors / ${staff.length || 1} staff`} icon={<Users className="h-4 w-4" />} />
        <MetricCard title="Templates" value={String(metrics.templates)} helper={`${metrics.categories} categories configured`} icon={<Settings2 className="h-4 w-4" />} />
        <MetricCard title="Recent risk" value={String(metrics.riskRows)} helper="High-impact changes and alerts" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">7-day trend</h2>
              <p className="text-xs text-foreground/60">Submissions, alerts, and draft creation over the last week.</p>
            </div>
            <Link href={`/${tenantSlug}/activity`} className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground">
              Open activity
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {timeline.map((entry) => {
              const submissionWidth = `${Math.max(5, (entry.submissions / maxTimelineValue) * 100)}%`;
              const alertWidth = `${Math.max(5, (entry.alerts / maxTimelineValue) * 100)}%`;
              const draftWidth = `${Math.max(5, (entry.drafts / maxTimelineValue) * 100)}%`;
              return (
                <div key={entry.day} className="grid grid-cols-[72px_1fr] items-center gap-3 text-xs sm:grid-cols-[88px_1fr]">
                  <div className="text-foreground/60">{formatDayLabel(entry.day)}</div>
                  <div className="space-y-1">
                    <div className="flex h-2 overflow-hidden rounded-full bg-foreground/10">
                      <div className="bg-emerald-500" style={{ width: submissionWidth }} />
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-foreground/10">
                      <div className="bg-amber-500" style={{ width: alertWidth }} />
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-foreground/10">
                      <div className="bg-slate-500" style={{ width: draftWidth }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-foreground/60">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Submissions</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Alerts</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-500" /> Drafts</span>
          </div>
        </section>

        <section className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Compliance alerts</h2>
              <p className="text-xs text-foreground/60">Latest issues that deserve admin follow-up.</p>
            </div>
            <Link href={`/${tenantSlug}/audits`} className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground">
              View forms
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {latestRisks.length > 0 ? latestRisks.map((row) => (
              <div key={row.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="font-medium">{humanizeAction(row.action)}</div>
                <div className="mt-0.5 text-xs text-amber-900/75">{actorLabel(row)} • {new Date(row.createdAt).toLocaleString()}</div>
                <div className="mt-1 text-xs text-amber-900/85">{row.entityType}{row.entityId ? ` (${row.entityId.slice(0, 8)})` : ""}</div>
              </div>
            )) : (
              <div className="rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3 text-sm text-foreground/60">
                No risk events were captured in the loaded window.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Staff performance</h2>
              <p className="text-xs text-foreground/60">Who is active, who is submitting, and who is driving change.</p>
            </div>
            <span className="text-xs text-foreground/50">{staff.length} staff loaded</span>
          </div>

          <div className="mt-4 space-y-2">
            {activityByActor.length > 0 ? activityByActor.map((entry) => (
              <div key={entry.name} className="rounded-lg border border-foreground/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{entry.name}</div>
                    <div className="text-xs text-foreground/60">{entry.total} actions • {entry.submissions} submissions • {entry.risk} risk events</div>
                  </div>
                  <div className="text-sm font-semibold">{entry.total}</div>
                </div>
              </div>
            )) : (
              <div className="rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3 text-sm text-foreground/60">
                No activity loaded yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Operational summary</h2>
              <p className="text-xs text-foreground/60">Fast counts from the current tenant snapshot.</p>
            </div>
            <Activity className="h-4 w-4 text-foreground/50" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Submitted" value={String(metrics.submitted)} />
            <MiniStat label="Drafts" value={String(metrics.drafts)} />
            <MiniStat label="Stale drafts" value={String(metrics.staleDrafts)} />
            <MiniStat label="Active actors" value={String(metrics.activeActors)} />
          </div>

          <div className="mt-4 rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3 text-sm text-foreground/70">
            {workspace?.tenant.name || tenantSlug} is showing a {percent(metrics.submissionRate)} submission completion rate in the loaded window.
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Temperature compliance</h2>
              <p className="text-xs text-foreground/60">Real readings pulled from saved form payloads.</p>
            </div>
            <span className="text-xs text-foreground/50">{metrics.realTempReadings} readings</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Readings" value={String(metrics.realTempReadings)} />
            <MiniStat label="Alerts" value={String(metrics.realTempAlerts || metrics.tempAlerts)} />
            <MiniStat label="Average" value={metrics.avgTemp == null ? "-" : `${metrics.avgTemp.toFixed(1)}°`} />
            <MiniStat label="Range" value={metrics.minTemp != null && metrics.maxTemp != null ? `${metrics.minTemp.toFixed(1)}° - ${metrics.maxTemp.toFixed(1)}°` : "-"} />
          </div>

          <div className="mt-4 grid gap-2">
            {(dashboardMetrics?.temperature.daily || []).map((entry) => {
              const dayLabel = formatDayLabel(entry.day);
              const alertWidth = `${Math.max(5, Math.min(100, entry.alerts * 30))}%`;
              const readingWidth = `${Math.max(5, Math.min(100, entry.readings * 10))}%`;
              return (
                <div key={entry.day} className="grid grid-cols-[72px_1fr] items-center gap-3 text-xs sm:grid-cols-[88px_1fr]">
                  <div className="text-foreground/60">{dayLabel}</div>
                  <div className="space-y-1">
                    <div className="flex h-2 overflow-hidden rounded-full bg-foreground/10">
                      <div className="bg-sky-500" style={{ width: readingWidth }} />
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-foreground/10">
                      <div className="bg-rose-500" style={{ width: alertWidth }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-foreground/60">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Readings</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Alerts</span>
          </div>
        </section>

        <section className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Latest out-of-spec values</h2>
              <p className="text-xs text-foreground/60">Pulled from submitted form payloads and template thresholds.</p>
            </div>
            <span className="text-xs text-foreground/50">{dashboardMetrics?.temperature.recentAlerts.length || 0} shown</span>
          </div>

          <div className="mt-4 space-y-2">
            {(dashboardMetrics?.temperature.recentAlerts || []).slice(0, 5).map((alert) => (
              <div key={`${alert.auditId}:${alert.key}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="font-medium">{alert.label}</div>
                <div className="mt-0.5 text-xs text-amber-900/75">
                  {alert.templateTitle} • {new Date(alert.createdAt).toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-amber-900/85">
                  Reading {alert.value}{alert.unit ? `°${alert.unit}` : ""}
                  {typeof alert.alertBelow === "number" ? ` • below ${alert.alertBelow}` : ""}
                  {typeof alert.alertAbove === "number" ? ` • above ${alert.alertAbove}` : ""}
                </div>
              </div>
            ))}

            {(dashboardMetrics?.temperature.recentAlerts || []).length === 0 ? (
              <div className="rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3 text-sm text-foreground/60">
                No temperature exceptions were found in the loaded submissions.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value, helper, icon }: { title: string; value: string; helper: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-foreground/20 bg-background p-4">
      <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-foreground/55">
        <span>{title}</span>
        <span className="inline-flex items-center justify-center rounded-md border border-foreground/15 bg-foreground/[0.03] p-1 text-foreground/60">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-foreground/60">{helper}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/15 bg-background p-3">
      <div className="text-xs uppercase tracking-wide text-foreground/55">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}