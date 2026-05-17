"use client";

import { useEffect, useMemo, useState } from "react";
import { NotificationModal } from "@/components/NotificationModal";
import { useAuth } from "@/components/AuthProvider";
import { apiUrl } from "@/lib/client/apiBase";

type TenantAlert = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
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

  async function markSeen(alertId: string) {
    try {
      localStorage.setItem(storageKey(tenantSlug), alertId);
    } catch {
      // ignore storage failures
    }
    setSeenId(alertId);

    // Also mark as read on the server
    try {
      const url = new URL(apiUrl(`/api/tenant/${tenantSlug}/announcements/${alertId}/read`));
      await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // silent failure - local storage is the fallback
    }
  }

  useEffect(() => {
    if (!tenantSlug || !accessToken) return;

    let cancelled = false;

    async function loadAlerts() {
      try {
        const url = new URL(apiUrl("/api/tenant-alerts"));
        url.searchParams.set("tenantSlug", tenantSlug);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const json = (await res.json().catch(() => ({}))) as { alerts?: TenantAlert[]; error?: string };
        if (!res.ok) return;
        if (cancelled) return;

        const nextAlerts = Array.isArray(json.alerts) ? (json.alerts as TenantAlert[]) : [];
        setAlerts(nextAlerts);

        // Use server-side read state if available, fall back to local storage
        const nextUnread = nextAlerts.find((alert) => !alert.isRead && alert.id !== seenId) || null;
        setActiveAlert((current) => current && nextAlerts.some((alert) => alert.id === current.id) ? current : nextUnread);
      } catch {
        // silent polling fallback
      }
    }

    void loadAlerts();
    const timer = window.setInterval(loadAlerts, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, tenantSlug, seenId]);

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
        markSeen(activeAlert.id);
        const remaining = alerts.find((alert) => alert.id !== activeAlert.id && alert.id !== seenId) || null;
        setActiveAlert(remaining);
      }}
      onAction={() => {
        markSeen(activeAlert.id);
        const remaining = alerts.find((alert) => alert.id !== activeAlert.id && alert.id !== seenId) || null;
        setActiveAlert(remaining);
      }}
      onCancel={() => {
        markSeen(activeAlert.id);
        const remaining = alerts.find((alert) => alert.id !== activeAlert.id && alert.id !== seenId) || null;
        setActiveAlert(remaining);
      }}
    />
  );
}