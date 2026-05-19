"use client";

import { useEffect } from "react";
import {
  buildReminderBody,
  markReminderShown,
  reminderKey,
  showDueReminderNotification,
  wasReminderShown,
} from "@/lib/client/dueReminderNotify";
import { isPastDue, type TemplateReminderTarget } from "@/lib/dueRules";

const POLL_MS = 10_000;

type Props = {
  tenantSlug?: string | null;
  reminders: TemplateReminderTarget[];
};

/**
 * Watches template-level dueReminderAt (set when admin saves the period).
 * Shows system + in-app reminders when the time is reached.
 */
export function DueReminderPoller({ tenantSlug, reminders }: Props) {
  useEffect(() => {
    if (!tenantSlug || reminders.length === 0) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const now = new Date();

      for (const item of reminders) {
        const dueAt = new Date(item.dueReminderAt);
        if (!Number.isFinite(dueAt.getTime()) || !isPastDue(dueAt, now)) continue;

        const key = reminderKey(tenantSlug, item.templateId, item.dueReminderAt);
        if (wasReminderShown(key)) continue;

        const body = buildReminderBody(item.dueReminderAt);
        await showDueReminderNotification({
          tenantSlug,
          templateId: item.templateId,
          title: item.title,
          body,
          dueReminderAt: item.dueReminderAt,
        });
        markReminderShown(key);
      }
    };

    void tick();
    const intervalId = window.setInterval(() => void tick(), POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tenantSlug, reminders]);

  return null;
}
