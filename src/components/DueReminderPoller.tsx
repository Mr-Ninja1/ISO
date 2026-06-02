"use client";

import { useEffect } from "react";
import {
  buildReminderBody,
  markReminderShown,
  reminderKey,
  showDueReminderNotification,
  wasReminderShown,
} from "@/lib/client/dueReminderNotify";
import { apiUrl } from "@/lib/client/apiBase";
import { isPastDue, resolveReminderDueInstants, type TemplateReminderTarget } from "@/lib/dueRules";

const POLL_MS = 10_000;

type Props = {
  tenantSlug?: string | null;
  reminders: TemplateReminderTarget[];
  accessToken?: string | null;
};

async function dispatchServerReminder(input: {
  accessToken: string;
  tenantSlug: string;
  templateId: string;
  title: string;
  body: string;
  dueReminderAt: string;
  dispatchKey: string;
}) {
  try {
    await fetch(apiUrl("/api/reminders/dispatch"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tenantSlug: input.tenantSlug,
        templateId: input.templateId,
        title: input.title,
        body: input.body,
        dueReminderAt: input.dueReminderAt,
        dispatchKey: input.dispatchKey,
      }),
    });
  } catch {
    // Local in-app reminder still shown even if server dispatch fails.
  }
}

/**
 * Watches template-level dueReminderAt (set when admin saves the period).
 * Shows system + in-app reminders when the time is reached.
 */
export function DueReminderPoller({ tenantSlug, reminders, accessToken }: Props) {
  useEffect(() => {
    if (!tenantSlug || reminders.length === 0) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const now = new Date();

      for (const item of reminders) {
        const dueInstants = resolveReminderDueInstants(item, now);
        for (const dueAt of dueInstants) {
          if (!isPastDue(dueAt, now)) continue;
          const dueIso = dueAt.toISOString();
          const key = reminderKey(tenantSlug, item.templateId, dueIso);
          if (wasReminderShown(key)) continue;

          const body = buildReminderBody(dueIso);
          await showDueReminderNotification({
            tenantSlug,
            templateId: item.templateId,
            title: item.title,
            body,
            dueReminderAt: dueIso,
          });
          if (accessToken) {
            await dispatchServerReminder({
              accessToken,
              tenantSlug,
              templateId: item.templateId,
              title: item.title,
              body,
              dueReminderAt: dueIso,
              dispatchKey: key,
            });
          }
          markReminderShown(key);
        }
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
  }, [tenantSlug, reminders, accessToken]);

  return null;
}
