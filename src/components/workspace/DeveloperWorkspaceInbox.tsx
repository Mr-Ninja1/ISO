"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { CenteredOverlay } from "@/components/ui/CenteredOverlay";
import { apiUrl } from "@/lib/client/apiBase";
import { appendTenantAlertsClientParams } from "@/lib/platformAudience";

export type DeveloperAlert = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  source: "tenant" | "global";
};

type TenantAlertsResponse = {
  alerts?: DeveloperAlert[];
  meta?: {
    tenantIsActive?: boolean;
    minNativeBuild?: number | null;
    liveUpdateChannel?: string | null;
    liveUpdateBundleUrl?: string | null;
  };
  error?: string;
  code?: string;
};

type Props = {
  tenantSlug: string;
  accessToken: string;
  /** Called when server reports brand deactivated (e.g. after reconnect). */
  onTenantDeactivated?: () => void;
  /** Latest meta from alerts poll (min native build, live update hints). */
  onMeta?: (meta: TenantAlertsResponse["meta"]) => void;
};

export function DeveloperWorkspaceInbox({ tenantSlug, accessToken, onTenantDeactivated, onMeta }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<DeveloperAlert[]>([]);
  const [error, setError] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    if (!tenantSlug || !accessToken) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL(apiUrl("/api/tenant-alerts"));
      url.searchParams.set("tenantSlug", tenantSlug);
      appendTenantAlertsClientParams(url);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as TenantAlertsResponse;

      if (res.status === 403 && json.code === "TENANT_DEACTIVATED") {
        onTenantDeactivated?.();
        return;
      }
      if (!res.ok) {
        setError(json.error || `Failed to load messages (${res.status})`);
        setAlerts([]);
        return;
      }

      const next = Array.isArray(json.alerts) ? json.alerts : [];
      setAlerts(next);
      if (json.meta) onMeta?.(json.meta);

      try {
        window.dispatchEvent(new CustomEvent("iso-tenant-alerts-updated", { detail: { tenantSlug, count: next.length } }));
      } catch {
        // ignore
      }
    } catch {
      setError("Could not load developer messages.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, tenantSlug, onTenantDeactivated, onMeta]);

  useEffect(() => {
    void loadAlerts();
    const t = window.setInterval(() => void loadAlerts(), 60_000);
    return () => window.clearInterval(t);
  }, [loadAlerts]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void loadAlerts();
    }
    window.addEventListener("online", loadAlerts);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", loadAlerts);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadAlerts]);

  const unreadCount = useMemo(() => alerts.filter((a) => !a.isRead).length, [alerts]);

  async function markRead(alert: DeveloperAlert) {
    if (!accessToken || markingId) return;
    setMarkingId(alert.id);
    try {
      const url = new URL(apiUrl("/api/tenant-alerts"));
      url.searchParams.set("tenantSlug", tenantSlug);
      appendTenantAlertsClientParams(url);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          announcementId: alert.id,
          source: alert.source === "global" ? "global" : "tenant",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || `Could not mark message as read (${res.status})`);
        return;
      }
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, isRead: true } : a)));
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="relative inline-flex h-9 items-center justify-center rounded-lg border border-foreground/20 bg-background px-2.5 text-sm font-medium text-foreground hover:bg-foreground/5"
        title="Messages from ISO Grid"
        aria-label="Developer messages inbox"
        onClick={() => {
          setOpen(true);
          void loadAlerts();
        }}
      >
        <Inbox className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--hse-copper)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      <CenteredOverlay open={open} onClose={() => setOpen(false)} maxWidthClass="max-w-lg" zIndexClass="z-[260]">
        <div className="rounded-xl border border-foreground/15 bg-background p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2 border-b border-foreground/10 pb-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Developer messages</div>
              <div className="text-xs text-foreground/60">Alerts for this brand and platform-wide broadcasts.</div>
            </div>
            <button
              type="button"
              className="rounded-md border border-foreground/15 px-2 py-1 text-xs hover:bg-foreground/5"
              onClick={() => void loadAlerts()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
            </button>
          </div>

          {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div> : null}

          <div className="mt-3 max-h-[min(60vh,420px)] space-y-2 overflow-y-auto pr-1">
            {alerts.length === 0 && !loading ? (
              <div className="py-8 text-center text-sm text-foreground/60">No messages right now.</div>
            ) : null}
            {alerts.map((alert) => (
              <div
                key={`${alert.source}-${alert.id}`}
                className={
                  "rounded-lg border px-3 py-2 text-left " +
                  (alert.isRead ? "border-foreground/10 bg-foreground/[0.02]" : "border-[var(--hse-teal)]/30 bg-[color-mix(in_srgb,var(--hse-teal)_6%,white)]")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{alert.title}</span>
                      <span className="shrink-0 rounded border border-foreground/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/60">
                        {alert.source === "global" ? "All brands" : "This brand"}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-xs text-foreground/75">{alert.message}</div>
                    <div className="mt-1 text-[10px] text-foreground/45">
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : ""}
                    </div>
                  </div>
                  {!alert.isRead ? (
                    <button
                      type="button"
                      disabled={markingId === alert.id}
                      className="shrink-0 rounded-md border border-foreground/20 px-2 py-1 text-[11px] font-medium hover:bg-foreground/5 disabled:opacity-50"
                      onClick={() => void markRead(alert)}
                    >
                      {markingId === alert.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark read"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-foreground/45">Read</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" className="rounded-md border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/5" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </CenteredOverlay>
    </>
  );
}
