"use client";

import { formatDueAtLabel } from "@/lib/dueRules";

const REMINDED_LS_KEY = "iso-due-reminded:v2";
export const DUE_REMINDER_EVENT = "iso-due-reminder";

export type DueReminderDetail = {
  tenantSlug: string;
  templateId: string;
  title: string;
  body: string;
  dueReminderAt: string;
};

function remindedKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(REMINDED_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function reminderKey(tenantSlug: string, templateId: string, dueReminderAt: string) {
  return `${tenantSlug}:${templateId}:${dueReminderAt}`;
}

export function wasReminderShown(key: string) {
  return remindedKeys().has(key);
}

export function markReminderShown(key: string) {
  try {
    const set = remindedKeys();
    set.add(key);
    localStorage.setItem(REMINDED_LS_KEY, JSON.stringify([...set].slice(-400)));
  } catch {
    // ignore
  }
}

export function dispatchDueReminder(detail: DueReminderDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DUE_REMINDER_EVENT, { detail }));
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function showDueReminderNotification(detail: DueReminderDetail) {
  const permission = await ensureNotificationPermission();

  if (permission === "granted" && typeof window !== "undefined" && "Notification" in window) {
    try {
      new Notification(`Reminder: ${detail.title}`, {
        body: detail.body,
        tag: reminderKey(detail.tenantSlug, detail.templateId, detail.dueReminderAt),
      });
    } catch {
      // fall through to in-app
    }
  }

  dispatchDueReminder(detail);
}

export function buildReminderBody(dueReminderAt: string) {
  const dueAt = new Date(dueReminderAt);
  return `Time to work on this form. ${formatDueAtLabel(dueAt)}`;
}
