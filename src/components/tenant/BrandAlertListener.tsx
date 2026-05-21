"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NotificationModal } from "@/components/NotificationModal";
import { useAuth } from "@/components/AuthProvider";
import { apiUrl } from "@/lib/client/apiBase";
import { appendTenantAlertsClientParams } from "@/lib/platformAudience";

type TenantAlert = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  /** Present when API merges global platform announcements. */
  source?: "tenant" | "global";
};

const ALERT_SEEN_PREFIX = "tenant-alert-seen:v1:";

function storageKey(tenantSlug: string) {
  return `${ALERT_SEEN_PREFIX}${tenantSlug}`;
}

export function BrandAlertListener({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const accessToken = session?.access_token || "";
  const [alerts, setAlerts] = useState<TenantAlert[]>([]);
  const [activeAlert, setActiveAlert] = useState<TenantAlert | null>(null);
  const [seenId, setSeenId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSeenId(localStorage.getItem(storageKey(tenantSlug)) || null);
    } catch {
      setSeenId(null);
    }
  }, [tenantSlug]);

  async function markSeen(alert: TenantAlert) {
    try {
      localStorage.setItem(storageKey(tenantSlug), alert.id);
    } catch {
      // ignore storage failures
    }
    setSeenId(alert.id);

    const src = alert.source ?? "tenant";
    const readPath =
      src === "global"
        ? `/api/global-announcements/${encodeURIComponent(alert.id)}/read`
        : `/api/tenant/${encodeURIComponent(tenantSlug)}/announcements/${encodeURIComponent(alert.id)}/read`;

    try {
      await fetch(apiUrl(readPath), {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // silent failure - local storage is the fallback
    }
  }

  const loadAlerts = useCallback(async () => {
    if (!tenantSlug || !accessToken) return;
    try {
      const url = new URL(apiUrl("/api/tenant-alerts"));
      url.searchParams.set("tenantSlug", tenantSlug);
      appendTenantAlertsClientParams(url);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const json = (await res.json().catch(() => ({}))) as { alerts?: TenantAlert[]; error?: string };
      if (!res.ok) return;

      const nextAlerts = Array.isArray(json.alerts) ? (json.alerts as TenantAlert[]) : [];
      setAlerts(nextAlerts);

      const nextUnread = nextAlerts.find((alert) => !alert.isRead && alert.id !== seenId) || null;
      setActiveAlert((current) =>
        current && nextAlerts.some((alert) => alert.id === current.id) ? current : nextUnread
      );
    } catch {
      // silent polling fallback
    }
  }, [accessToken, tenantSlug, seenId]);

  useEffect(() => {
    void loadAlerts();
    const timer = window.setInterval(() => void loadAlerts(), 15000);
    return () => window.clearInterval(timer);
  }, [loadAlerts]);

  useEffect(() => {
    function onTenantAlertsUpdated(ev: Event) {
      const detail = (ev as CustomEvent<{ tenantSlug?: string }>).detail;
      if (detail?.tenantSlug !== tenantSlug) return;
      void loadAlerts();
    }
    window.addEventListener("iso-tenant-alerts-updated", onTenantAlertsUpdated);
    return () => window.removeEventListener("iso-tenant-alerts-updated", onTenantAlertsUpdated);
  }, [tenantSlug, loadAlerts]);

  const unreadCount = useMemo(() => alerts.filter((alert) => !alert.isRead && alert.id !== seenId).length, [alerts, seenId]);

  if (!activeAlert) return null;

  return (
    <NotificationModal
      open={Boolean(activeAlert)}
      title={activeAlert.title}
      message={activeAlert.message}
      actionLabel={unreadCount > 1 ? `Acknowledge (${unreadCount})` : "Acknowledge"}
      cancelLabel="Later"
      onClose={() => {
        void markSeen(activeAlert);
        const remaining = alerts.find((alert) => alert.id !== activeAlert.id && alert.id !== seenId) || null;
        setActiveAlert(remaining);
      }}
      onAction={() => {
        void markSeen(activeAlert);
        const remaining = alerts.find((alert) => alert.id !== activeAlert.id && alert.id !== seenId) || null;
        setActiveAlert(remaining);
      }}
      onCancel={() => {
        void markSeen(activeAlert);
        const remaining = alerts.find((alert) => alert.id !== activeAlert.id && alert.id !== seenId) || null;
        setActiveAlert(remaining);
      }}
    />
  );
}
