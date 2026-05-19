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

/** Allow a fresh reminder after the due period is saved again. */
export function clearRemindersForTemplate(tenantSlug: string, templateId: string) {
  const prefix = `${tenantSlug}:${templateId}:`;
  try {
    const set = remindedKeys();
    let changed = false;
    for (const key of set) {
      if (key.startsWith(prefix)) {
        set.delete(key);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(REMINDED_LS_KEY, JSON.stringify([...set].slice(-400)));
    }
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
  // In-app modal always fires (works in Capacitor WebView where Notification API is missing).
  dispatchDueReminder(detail);

  const permission = await ensureNotificationPermission();
  if (permission !== "granted" || typeof window === "undefined" || !("Notification" in window)) {
    return;
  }

  const tag = reminderKey(detail.tenantSlug, detail.templateId, detail.dueReminderAt);
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(`Reminder: ${detail.title}`, { body: detail.body, tag });
      return;
    }
  } catch {
    // fall through to Notification constructor
  }

  try {
    new Notification(`Reminder: ${detail.title}`, { body: detail.body, tag });
  } catch {
    // in-app event already dispatched
  }
}

export function buildReminderBody(dueReminderAt: string) {
  const dueAt = new Date(dueReminderAt);
  return `Time to work on this form. ${formatDueAtLabel(dueAt)}`;
}
