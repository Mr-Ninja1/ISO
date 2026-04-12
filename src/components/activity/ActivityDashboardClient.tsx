"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowUpRight, Clock3, Filter, Loader2, Search, ShieldAlert, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { readCachedActivityRows, writeCachedActivityRows, type CachedActivityRow } from "@/lib/client/activityCache";

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

type ActivityGroup = "ALL" | "AUDIT" | "TEMPLATE" | "STAFF" | "CATEGORY" | "RISK";

const RISK_ACTIONS = new Set([
  "staff.remove",
  "staff.upsert",
  "staff.update",
  "template.delete",
  "template.update.versioned",
  "category.delete",
]);

function groupForAction(action: string): Exclude<ActivityGroup, "ALL" | "RISK"> {
  if (action.startsWith("audit.")) return "AUDIT";
  if (action.startsWith("template.")) return "TEMPLATE";
  if (action.startsWith("staff.")) return "STAFF";
  if (action.startsWith("category.")) return "CATEGORY";
  return "AUDIT";
}

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

function asDetailObject(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function detailSummary(row: ActivityRow) {
  const details = asDetailObject(row.details);
  if (!details) return "";

  const parts: string[] = [];
  if (typeof details.title === "string" && details.title) parts.push(details.title);
  if (typeof details.name === "string" && details.name) parts.push(details.name);
  if (typeof details.email === "string" && details.email) parts.push(details.email);
  if (typeof details.role === "string" && details.role) parts.push(`role ${details.role}`);
  if (typeof details.categoryId === "string" && details.categoryId) parts.push(`category ${details.categoryId.slice(0, 8)}`);
  if (typeof details.templateId === "string" && details.templateId) parts.push(`template ${details.templateId.slice(0, 8)}`);
  if (typeof details.previousTemplateId === "string" && details.previousTemplateId) parts.push(`from ${details.previousTemplateId.slice(0, 8)}`);
  if (typeof details.hasTemperatureAlerts === "boolean" && details.hasTemperatureAlerts) parts.push("temperature alerts");
  if (typeof details.changedRole === "boolean" && details.changedRole) parts.push("role change");
  if (typeof details.changedEmail === "boolean" && details.changedEmail) parts.push("email change");
  if (typeof details.changedPassword === "boolean" && details.changedPassword) parts.push("password reset");
  if (typeof details.changedName === "boolean" && details.changedName) parts.push("name change");
  if (Array.isArray(details.deletedTemplateIds) && details.deletedTemplateIds.length > 0) {
    parts.push(`${details.deletedTemplateIds.length} templates deleted`);
  }

  return parts.slice(0, 3).join(" • ");
}

function isRiskRow(row: ActivityRow) {
  if (RISK_ACTIONS.has(row.action)) return true;
  const details = asDetailObject(row.details);
  return Boolean(details?.hasTemperatureAlerts);
}

function actorLabel(row: ActivityRow) {
  return row.actorName || row.actorEmail || row.userId;
}

function entityLabel(row: ActivityRow) {
  if (row.entityType === "AuditLog") return "Form submission";
  if (row.entityType === "FormTemplate") return "Template";
  if (row.entityType === "FormTemplateLineage") return "Template lineage";
  if (row.entityType === "TenantMember") return "Staff member";
  if (row.entityType === "Category") return "Category";
  return row.entityType;
}

export function ActivityDashboardClient({ tenantSlug }: { tenantSlug: string }) {
  const { session, loading: authLoading } = useAuth();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ActivityGroup>("ALL");

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
    const cached = readCachedActivityRows(tenantSlug);
    if (cached.length > 0) {
      setRows(cached as ActivityRow[]);
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    const token = session?.access_token;
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!token || !tenantSlug) {
      setLoading(false);
      return;
    }

    if (!online) {
      if (rows.length === 0) {
        setError("Activity is a live cross-device feature and needs internet to refresh.");
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const url = new URL("/api/activity", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("limit", "300");

    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || `Failed to load activity (${res.status})`);
        }
        return json as { rows?: ActivityRow[] };
      })
      .then((json) => {
        if (cancelled) return;
        const nextRows = Array.isArray(json.rows) ? (json.rows as ActivityRow[]) : [];
        setRows(nextRows);
        writeCachedActivityRows(tenantSlug, nextRows as CachedActivityRow[]);
      })
      .catch((err) => {
        if (cancelled) return;
        if (rows.length === 0) {
          setError(err?.message || "Failed to load activity");
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, tenantSlug, authLoading]);

  useEffect(() => {
    const onCacheUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (custom.detail?.tenantSlug !== tenantSlug) return;
      const cached = readCachedActivityRows(tenantSlug);
      if (cached.length > 0) {
        setRows(cached as ActivityRow[]);
        setError("");
      }
    };

    window.addEventListener("activity-cache-updated", onCacheUpdate as EventListener);
    return () => {
      window.removeEventListener("activity-cache-updated", onCacheUpdate as EventListener);
    };
  }, [tenantSlug]);

  const actionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.action, (map.get(row.action) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (group === "RISK" && !isRiskRow(row)) return false;
      if (group !== "ALL" && group !== "RISK" && groupForAction(row.action) !== group) return false;
      if (!normalizedQuery) return true;

      const searchable = [
        row.action,
        row.entityType,
        row.entityId || "",
        actorLabel(row),
        row.actorEmail || "",
        detailSummary(row),
        JSON.stringify(row.details || {}),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [rows, group, query]);

  const stats = useMemo(() => {
    const riskEvents = rows.filter(isRiskRow).length;
    const uniqueActors = new Set(rows.map((row) => row.userId)).size;
    const uniqueEntities = new Set(rows.map((row) => `${row.entityType}:${row.entityId || ""}`)).size;
    const submissions = rows.filter((row) => row.action === "audit.submit").length;
    const lastEvent = rows[0] || null;
    const recent24h = rows.filter((row) => Date.parse(row.createdAt) >= Date.now() - 24 * 60 * 60 * 1000).length;

    return {
      riskEvents,
      uniqueActors,
      uniqueEntities,
      submissions,
      lastEvent,
      recent24h,
    };
  }, [rows]);

  const watchlist = useMemo(() => rows.filter(isRiskRow).slice(0, 4), [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-foreground/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(241,245,249,0.95),_rgba(226,232,240,0.9))] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <Sparkles className="h-3.5 w-3.5" />
              God&apos;s-eye activity
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Admin activity monitor</h2>
            <p className="mt-1 max-w-2xl text-sm text-foreground/70">
              See what changed, who changed it, and which events deserve attention across forms, templates, staff, and categories.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground/65">
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <Clock3 className="h-3.5 w-3.5" />
              {stats.recent24h} in the last 24h
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {stats.riskEvents} risk events
            </span>
          </div>
        </div>
      </div>

      <FeatureSyncNotice
        title="Live sync feature"
        message="This page needs internet to pull cross-device activity from the database. Cached activity can still show while offline, but new events will appear after reconnecting."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-foreground/55">Events</div>
          <div className="mt-2 text-2xl font-semibold">{rows.length}</div>
          <div className="mt-1 text-xs text-foreground/60">All activity loaded on this tenant</div>
        </div>
        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-foreground/55">Actors</div>
          <div className="mt-2 text-2xl font-semibold">{stats.uniqueActors}</div>
          <div className="mt-1 text-xs text-foreground/60">Distinct staff members involved</div>
        </div>
        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-foreground/55">Submissions</div>
          <div className="mt-2 text-2xl font-semibold">{stats.submissions}</div>
          <div className="mt-1 text-xs text-foreground/60">Audit submissions recorded</div>
        </div>
        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-foreground/55">Risk</div>
          <div className="mt-2 text-2xl font-semibold">{stats.riskEvents}</div>
          <div className="mt-1 text-xs text-foreground/60">Staff, template, and category changes</div>
        </div>
        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-foreground/55">Entities</div>
          <div className="mt-2 text-2xl font-semibold">{stats.uniqueEntities}</div>
          <div className="mt-1 text-xs text-foreground/60">Unique records touched</div>
        </div>
        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-foreground/55">Latest</div>
          <div className="mt-2 text-sm font-medium">
            {stats.lastEvent ? humanizeAction(stats.lastEvent.action) : "No events yet"}
          </div>
          <div className="mt-1 text-xs text-foreground/60">{stats.lastEvent ? new Date(stats.lastEvent.createdAt).toLocaleString() : "Waiting for activity"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Filter signal</div>
              <div className="text-xs text-foreground/60">Narrow the stream by domain or look only at risky changes.</div>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people, actions, entities, details"
                className="h-10 w-full rounded-md border border-foreground/20 bg-background pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ["ALL", "All"],
              ["AUDIT", "Forms"],
              ["TEMPLATE", "Templates"],
              ["STAFF", "Staff"],
              ["CATEGORY", "Categories"],
              ["RISK", "Risk only"],
            ] as Array<[ActivityGroup, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setGroup(value)}
                className={
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition " +
                  (group === value
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 bg-background text-foreground/80 hover:bg-foreground/5")
                }
              >
                {value === "RISK" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3 text-xs text-foreground/65">
            {online
              ? "Connected. This log is refreshed from the database and then kept warm from cache for quick review."
              : "Offline. You can review cached activity, but new events will not arrive until the device reconnects."}
          </div>
        </div>

        <div className="rounded-xl border border-foreground/20 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Watchlist</div>
              <div className="text-xs text-foreground/60">High-impact events worth checking first.</div>
            </div>
            <div className="text-xs text-foreground/50">{watchlist.length} shown</div>
          </div>
          <div className="mt-3 space-y-2">
            {watchlist.length > 0 ? (
              watchlist.map((row) => {
                const summary = detailSummary(row);
                return (
                  <div key={row.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{humanizeAction(row.action)}</div>
                        <div className="mt-0.5 text-xs text-amber-900/70">
                          {actorLabel(row)} • {entityLabel(row)}
                        </div>
                      </div>
                      <div className="text-xs text-amber-900/60">{new Date(row.createdAt).toLocaleString()}</div>
                    </div>
                    {summary ? <div className="mt-2 text-xs text-amber-900/80">{summary}</div> : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3 text-sm text-foreground/60">
                No high-impact events found in the loaded history.
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          <div className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activity...
          </div>
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="rounded-md border border-foreground/20 bg-foreground/[0.03] p-3 text-xs text-foreground/60">
          Showing cached activity. It will refresh in the background when your session is ready.
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {!loading && !error ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actionCounts.slice(0, 3).map(([action, count]) => (
            <div key={action} className="rounded-md border border-foreground/20 bg-background p-4">
              <div className="text-xs uppercase tracking-wide text-foreground/60">Top action</div>
              <div className="mt-1 text-base font-semibold">{humanizeAction(action)}</div>
              <div className="text-sm text-foreground/70">{count} events</div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-xl border border-foreground/20 bg-background">
          <div className="border-b border-foreground/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Event stream</div>
                <div className="text-xs text-foreground/60">{filteredRows.length} matching events in the loaded window.</div>
              </div>
              <div className="text-xs text-foreground/50">Newest first</div>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="p-4 text-sm text-foreground/70">No events match your current filters.</div>
          ) : (
            <div className="divide-y divide-foreground/10">
              {filteredRows.map((row) => {
                const risk = isRiskRow(row);
                const summary = detailSummary(row);
                const entityHref = row.entityType === "AuditLog" && row.entityId ? `/${tenantSlug}/audits/${row.entityId}` : null;
                return (
                  <div key={row.id} className={"p-4 " + (risk ? "bg-amber-50/70" : "bg-background") }>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium " + (risk ? "border-amber-300 bg-amber-100 text-amber-900" : "border-foreground/15 bg-foreground/[0.03] text-foreground/70") }>
                            {risk ? <AlertTriangle className="mr-1 h-3 w-3" /> : <Activity className="mr-1 h-3 w-3" />}
                            {humanizeAction(row.action)}
                          </span>
                          <span className="text-xs text-foreground/50">{entityLabel(row)}</span>
                          {entityHref ? (
                            <Link href={entityHref} className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground">
                              Open report
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          ) : null}
                        </div>
                        <div className="mt-2 min-w-0 text-sm text-foreground/85">
                          <span className="font-medium">{actorLabel(row)}</span>
                          <span className="text-foreground/55"> acted on </span>
                          <span className="font-medium">{row.entityType}</span>
                          {row.entityId ? <span className="text-foreground/55"> ({row.entityId.slice(0, 8)})</span> : null}
                        </div>
                        {summary ? <div className="mt-1 text-xs text-foreground/65">{summary}</div> : null}
                        {row.actorEmail ? <div className="mt-1 text-xs text-foreground/55">{row.actorEmail}</div> : null}
                      </div>
                      <div className="shrink-0 text-xs text-foreground/50">{new Date(row.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
