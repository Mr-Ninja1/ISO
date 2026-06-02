"use client";

import { useEffect, useMemo, useState } from "react";
import { DueReminderPoller } from "@/components/DueReminderPoller";
import { NotificationModal } from "@/components/NotificationModal";
import { useAuth } from "@/components/AuthProvider";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import {
  DUE_REMINDER_EVENT,
  ensureNotificationPermission,
  type DueReminderDetail,
} from "@/lib/client/dueReminderNotify";
import { readWorkspaceCacheResolved } from "@/lib/client/workspaceCache";
import { templateToReminderTarget, type TemplateReminderTarget } from "@/lib/dueRules";

function templateMetaFromSettings(settings: Record<string, unknown> | undefined) {
  if (!settings) return null;
  return {
    dueRule: settings.dueRule,
    dueDays: settings.dueDays,
    dueReminderAt: settings.dueReminderAt,
    dueRuleSetAt: settings.dueRuleSetAt,
  };
}

/**
 * Runs due reminders on all tenant routes (audit form, settings, etc.), not only /workspace.
 * Reads template due periods from the local workspace cache.
 */
export function TenantDueReminderWatcher({ tenantSlug }: { tenantSlug: string }) {
  const { user, session } = useAuth();
  const userId = user?.id || session?.user?.id || null;
  const accessToken = getWorkspaceAccessToken(session);
  const [cacheTick, setCacheTick] = useState(0);
  const [notification, setNotification] = useState<{
    title: string;
    message: string;
    tone: "warning" | "default";
  } | null>(null);

  useEffect(() => {
    const onCache = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantSlug?: string }>).detail;
      if (detail?.tenantSlug === tenantSlug) setCacheTick((n) => n + 1);
    };
    window.addEventListener("workspace-cache-updated", onCache as EventListener);
    return () => window.removeEventListener("workspace-cache-updated", onCache as EventListener);
  }, [tenantSlug]);

  const reminderTargets = useMemo((): TemplateReminderTarget[] => {
    void cacheTick;
    const ws = readWorkspaceCacheResolved(userId, tenantSlug, null);
    if (!ws?.templates?.length) return [];
    return ws.templates
      .map((t) =>
        templateToReminderTarget(
          t.id,
          t.title,
          templateMetaFromSettings(t.settings as Record<string, unknown> | undefined)
        )
      )
      .filter((x): x is TemplateReminderTarget => Boolean(x));
  }, [userId, tenantSlug, cacheTick]);

  useEffect(() => {
    if (reminderTargets.length > 0) void ensureNotificationPermission();
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

  return (
    <>
      <DueReminderPoller tenantSlug={tenantSlug} reminders={reminderTargets} accessToken={accessToken} />
      <NotificationModal
        open={Boolean(notification)}
        title={notification?.title || ""}
        message={notification?.message || ""}
        tone={notification?.tone || "warning"}
        onClose={() => setNotification(null)}
      />
    </>
  );
}
