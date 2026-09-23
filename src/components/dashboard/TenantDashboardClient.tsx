"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Clock3, Loader2, ShieldAlert, Sparkles, Users, FileText, Settings2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { readCachedActivityRows, writeCachedActivityRows, type CachedActivityRow } from "@/lib/client/activityCache";
import { readAuditsListCache, writeAuditsListCache, type CachedAuditRow } from "@/lib/client/auditsListCache";
import { apiUrl } from "@/lib/client/apiBase";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { PlusCircle } from "lucide-react"; // Add PlusCircle icon

type WorkspaceResponse = {
  tenant: { id: string; name: string; slug: string; logoUrl: string | null };
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  selectedCategoryId: string | null;
  templates: Array<{
    id: string;
    title: string;
    updatedAt: string;
    categoryId: string | null;
    hasTemperatureInputs?: boolean;
    settings?: {
      dueDays?: number;
      temperatureAlertBelow?: number;
      temperatureAlertAbove?: number;
      temperatureUnit?: "C" | "F";
    };
  }>;
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
    dueRuleTemplates: number;
    tempRuleTemplates: number;
    overdueDrafts: number;
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

function TemperatureTrendChart({
  daily,
}: {
  daily: Array<{ day: string; readings: number; alerts: number; average: number | null }>;
}) {
  const hasSeries = daily.some((entry) => entry.average != null);
  if (!daily.length || !hasSeries) {
    return (
      <div className="rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3 text-sm text-foreground/60">
        Not enough temperature points yet for a trend line.
      </div>
    );
  }

  const values = daily
    .map((entry) => entry.average)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = 100;
  const height = 34;

  const points = daily
    .map((entry, index) => {
      if (entry.average == null) return null;
      const x = daily.length === 1 ? width / 2 : (index / (daily.length - 1)) * width;
      const y = height - ((entry.average - min) / span) * height;
      return `${x},${y}`;
    })
    .filter((point): point is string => Boolean(point));

  return (
    <div className="rounded-lg border border-foreground/15 bg-foreground/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-foreground/55">
        <span>Average temperature trend</span>
        <span>
          {min.toFixed(1)}° to {max.toFixed(1)}°
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full">
        <line x1="0" y1={height} x2={width} y2={height} className="stroke-foreground/20" strokeWidth="0.5" />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-sky-500"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {daily.map((entry, index) => {
          if (entry.average == null) return null;
          const x = daily.length === 1 ? width / 2 : (index / (daily.length - 1)) * width;
          const y = height - ((entry.average - min) / span) * height;
          return <circle key={entry.day} cx={x} cy={y} r="1.9" className="fill-sky-500" />;
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Alerts shown below per day
        </span>
      </div>
    </div>
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function DashboardCard({ title, description, icon, href }: { title: string; description: string; icon: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all duration-200"
    >
      <div className="p-3 rounded-full bg-indigo-100 text-indigo-600">
        {icon}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-gray-800">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </Link>
  );
}

export function TenantDashboardClient({ tenantSlug }: { tenantSlug: string }) {
  const { session, loading: authLoading } = useAuth();
  const offline = useAppOffline();
  const online = !offline;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [audits, setAudits] = useState<CachedAuditRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetricsResponse | null>(null);

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
      const workspaceUrl = new URL(apiUrl("/api/workspace"));
      workspaceUrl.searchParams.set("tenantSlug", tenantSlug);

      const auditsUrl = new URL(apiUrl("/api/audit/list"));
      auditsUrl.searchParams.set("tenantSlug", tenantSlug);

      const activityUrl = new URL(apiUrl("/api/activity"));
      activityUrl.searchParams.set("tenantSlug", tenantSlug);
      activityUrl.searchParams.set("limit", "300");

      const metricsUrl = new URL(apiUrl("/api/dashboard/metrics"));
      metricsUrl.searchParams.set("tenantSlug", tenantSlug);

      const staffUrl = new URL(apiUrl("/api/staff"));
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
    const dueRules = dashboardMetrics?.summary.dueRuleTemplates ?? (workspace?.templates.filter((template) => typeof template.settings?.dueDays === "number").length || 0);
    const tempRuleTemplates = dashboardMetrics?.summary.tempRuleTemplates ?? (workspace?.templates.filter((template) => template.hasTemperatureInputs && (typeof template.settings?.temperatureAlertBelow === "number" || typeof template.settings?.temperatureAlertAbove === "number")).length || 0);
    const overdueDrafts = dashboardMetrics?.summary.overdueDrafts ?? staleDrafts.length;
    const dashboardTemp = dashboardMetrics?.temperature;

    return {
      submitted: submitted.length,
      drafts: drafts.length,
      staleDrafts: staleDrafts.length,
      overdueDrafts,
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
      dueRules,
      tempRuleTemplates,
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
    <div className="flex flex-col gap-6">
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Admin Dashboard
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">Compliance and Operations Overview</h1>
            <p className="mt-2 max-w-2xl text-base text-gray-600">
              Track staff activity, temperature alerts, audit throughput, and follow-up risk from one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 shadow-sm">
              <Clock3 className="h-4 w-4" />
              {online ? "Live" : "Cached"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 shadow-sm">
              <ShieldAlert className="h-4 w-4" />
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
        <div className="flex items-center justify-center p-6 bg-white rounded-lg shadow-md text-gray-700">
          <Loader2 className="h-5 w-5 animate-spin mr-3" />
          Loading dashboard metrics...
        </div>
      ) : null}

      {error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DashboardCard
          title="Create Custom Form"
          description="Design new audit forms and templates from scratch."
          icon={<PlusCircle className="h-6 w-6" />}
          href={`/${tenantSlug}/forms/create`} // Assuming this is the correct path for form creation
        />
        <MetricCard title="Submission rate" value={percent(metrics.submissionRate)} helper={`${metrics.submitted} submitted / ${audits.length} forms`} icon={<BarChart3 className="h-4 w-4" />} />
        <MetricCard title="Drafts" value={String(metrics.drafts)} helper={`${metrics.staleDrafts} stale drafts over 72h`} icon={<FileText className="h-4 w-4" />} />
        <MetricCard title="Overdue drafts" value={String(metrics.overdueDrafts)} helper="Past the template due-date window" icon={<Clock3 className="h-4 w-4" />} />
        <MetricCard title="Temperature alerts" value={String(metrics.realTempAlerts || metrics.tempAlerts)} helper="Captured from saved audit payloads" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard title="Staff coverage" value={percent(metrics.staffCoverage)} helper={`${metrics.activeActors} active actors / ${staff.length || 1} staff`} icon={<Users className="h-4 w-4" />} />
        <MetricCard title="Templates" value={String(metrics.templates)} helper={`${metrics.categories} categories configured`} icon={<Settings2 className="h-4 w-4" />} />
        <MetricCard title="Due rules" value={String(metrics.dueRules)} helper="Templates with due-date defaults" icon={<Clock3 className="h-4 w-4" />} />
        <MetricCard title="Temp rules" value={String(metrics.tempRuleTemplates)} helper="Templates with temperature boundaries" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard title="Recent risk" value={String(metrics.riskRows)} helper="High-impact changes and alerts" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">7-day Trend</h2>
              <p className="text-sm text-gray-600 mt-1">Submissions, alerts, and draft creation over the last week.</p>
            </div>
            <Link href={`/${tenantSlug}/activity`} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Open Activity
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {timeline.map((entry) => {
              const submissionWidth = `${Math.max(5, (entry.submissions / maxTimelineValue) * 100)}%`;
              const alertWidth = `${Math.max(5, (entry.alerts / maxTimelineValue) * 100)}%`;
              const draftWidth = `${Math.max(5, (entry.drafts / maxTimelineValue) * 100)}%`;
              return (
                <div key={entry.day} className="grid grid-cols-[80px_1fr] items-center gap-4 text-sm">
                  <div className="text-gray-600">{formatDayLabel(entry.day)}</div>
                  <div className="space-y-1.5">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-emerald-100">
                      <div className="bg-emerald-500 rounded-l-full" style={{ width: submissionWidth }} />
                    </div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-amber-100">
                      <div className="bg-amber-500 rounded-l-full" style={{ width: alertWidth }} />
                    </div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="bg-slate-500 rounded-l-full" style={{ width: draftWidth }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-4 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Submissions</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Alerts</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Drafts</span>
          </div>
        </section>

        <section className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Compliance Alerts</h2>
              <p className="text-sm text-gray-600 mt-1">Latest issues that deserve admin follow-up.</p>
            </div>
            <Link href={`/${tenantSlug}/audits`} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800">
              View Forms
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {latestRisks.length > 0 ? latestRisks.map((row) => (
              <div key={row.id} className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                <div className="font-medium">{humanizeAction(row.action)}</div>
                <div className="mt-0.5 text-xs text-red-900/75">{actorLabel(row)} • {new Date(row.createdAt).toLocaleString()}</div>
                <div className="mt-1 text-xs text-red-900/85">{row.entityType}{row.entityId ? ` (${row.entityId.slice(0, 8)})` : ""}</div>
              </div>
            )) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                No risk events were captured in the loaded window.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Staff Performance</h2>
              <p className="text-sm text-gray-600 mt-1">Who is active, who is submitting, and who is driving change.</p>
            </div>
            <span className="text-sm text-gray-500">{staff.length} staff loaded</span>
          </div>

          <div className="mt-5 space-y-3">
            {activityByActor.length > 0 ? activityByActor.map((entry) => (
              <div key={entry.name} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-800">{entry.name}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{entry.total} actions • {entry.submissions} submissions • {entry.risk} risk events</div>
                  </div>
                  <div className="text-lg font-semibold text-gray-700">{entry.total}</div>
                </div>
              </div>
            )) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                No activity loaded yet.
              </div>
            )}
          </div>
        </section>

        <section className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Operational Summary</h2>
              <p className="text-sm text-gray-600 mt-1">Fast counts from the current tenant snapshot.</p>
            </div>
            <Activity className="h-5 w-5 text-gray-500" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <MiniStat label="Submitted" value={String(metrics.submitted)} />
            <MiniStat label="Drafts" value={String(metrics.drafts)} />
            <MiniStat label="Stale drafts" value={String(metrics.staleDrafts)} />
            <MiniStat label="Active actors" value={String(metrics.activeActors)} />
          </div>

          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            {workspace?.tenant.name || tenantSlug} is showing a {percent(metrics.submissionRate)} submission completion rate in the loaded window.
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Temperature Compliance</h2>
              <p className="text-sm text-gray-600 mt-1">Real readings pulled from saved form payloads.</p>
            </div>
            <span className="text-sm text-gray-500">{metrics.realTempReadings} readings</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MiniStat label="Readings" value={String(metrics.realTempReadings)} />
            <MiniStat label="Alerts" value={String(metrics.realTempAlerts || metrics.tempAlerts)} />
            <MiniStat label="Average" value={metrics.avgTemp == null ? "-" : `${metrics.avgTemp.toFixed(1)}°`} />
            <MiniStat label="Range" value={metrics.minTemp != null && metrics.maxTemp != null ? `${metrics.minTemp.toFixed(1)}° - ${metrics.maxTemp.toFixed(1)}°` : "-"} />
          </div>

          <div className="mt-5">
            <TemperatureTrendChart daily={dashboardMetrics?.temperature.daily || []} />
          </div>

          <div className="mt-5 grid gap-3">
            {(dashboardMetrics?.temperature.daily || []).map((entry) => {
              const dayLabel = formatDayLabel(entry.day);
              const alertWidth = `${Math.max(5, Math.min(100, entry.alerts * 30))}%`;
              const readingWidth = `${Math.max(5, Math.min(100, entry.readings * 10))}%`;
              return (
                <div key={entry.day} className="grid grid-cols-[80px_1fr] items-center gap-4 text-sm">
                  <div className="text-gray-600">{dayLabel}</div>
                  <div className="space-y-1.5">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-sky-100">
                      <div className="bg-sky-500 rounded-l-full" style={{ width: readingWidth }} />
                    </div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-rose-100">
                      <div className="bg-rose-500 rounded-l-full" style={{ width: alertWidth }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Readings</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Alerts</span>
          </div>
        </section>

        <section className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Latest Out-of-Spec Values</h2>
              <p className="text-sm text-gray-600 mt-1">Pulled from submitted form payloads and template thresholds.</p>
            </div>
            <span className="text-sm text-gray-500">{dashboardMetrics?.temperature.recentAlerts.length || 0} shown</span>
          </div>

          <div className="mt-5 space-y-3">
            {(dashboardMetrics?.temperature.recentAlerts || []).slice(0, 5).map((alert) => (
              <div key={`${alert.auditId}:${alert.key}`} className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-950">
                <div className="font-medium text-yellow-900">{alert.label}</div>
                <div className="mt-0.5 text-xs text-yellow-800/75">
                  {alert.templateTitle} • {new Date(alert.createdAt).toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-yellow-800/85">
                  Reading {alert.value}{alert.unit ? `°${alert.unit}` : ""}
                  {typeof alert.alertBelow === "number" ? ` • below ${alert.alertBelow}` : ""}
                  {typeof alert.alertAbove === "number" ? ` • above ${alert.alertAbove}` : ""}
                </div>
              </div>
            ))}

            {(dashboardMetrics?.temperature.recentAlerts || []).length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
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
    <div className="bg-white shadow-md rounded-lg p-5">
      <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-gray-500">
        <span>{title}</span>
        <span className="inline-flex items-center justify-center rounded-md bg-gray-100 p-2 text-gray-600">
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-sm text-gray-600">{helper}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white shadow-sm rounded-lg p-4 border border-gray-200">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-800">{value}</div>
    </div>
  );
}
