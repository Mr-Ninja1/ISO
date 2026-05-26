"use client";

import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import type { DevicePushRegistration, PushNotificationCategory } from "@/lib/push/types";

const ENABLED = process.env.NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED === "1";
const REGISTRATION_STORAGE_KEY = "iso-push-registration:v1";

type PushModule = typeof import("@capacitor/push-notifications");

let pushModule: PushModule | null = null;
let registrationListenerAttached = false;
let pendingAccessToken: string | null = null;
let pendingTenantSlug: string | null = null;

export function isPushNotificationsEnabled() {
  return ENABLED && isCapacitorNativeApp();
}

async function loadPushModule(): Promise<PushModule | null> {
  if (pushModule) return pushModule;
  if (!isPushNotificationsEnabled()) return null;
  try {
    pushModule = await import("@capacitor/push-notifications");
    return pushModule;
  } catch {
    return null;
  }
}

function resolveTenantSlugForPush(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("tenantSlug")?.trim();
    if (fromQuery) return fromQuery;

    const parts = window.location.pathname.split("/").filter(Boolean);
    const reserved = new Set([
      "workspace",
      "login",
      "signup",
      "onboarding",
      "offline",
      "admin",
      "developer-login",
      "_",
    ]);
    const first = parts[0];
    if (first && !reserved.has(first)) return first;
  } catch {
    // ignore
  }
  return null;
}

export async function savePushTokenOnServer(input: {
  accessToken: string;
  registration: Omit<DevicePushRegistration, "userId">;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(apiUrl("/api/push/register"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(input.registration),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || `Registration failed (${res.status})` };
  }

  try {
    localStorage.setItem(
      REGISTRATION_STORAGE_KEY,
      JSON.stringify({ token: input.registration.token, at: Date.now() })
    );
  } catch {
    // ignore
  }

  return { ok: true };
}

async function persistRegistrationToken(token: string, accessToken: string, tenantSlug: string | null) {
  const platform =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent)
      ? "ios"
      : "android";

  const categories: PushNotificationCategory[] = [
    "announcement",
    "reminder",
    "activity",
    "corrective_action",
    "system",
  ];

  return savePushTokenOnServer({
    accessToken,
    registration: {
      platform,
      token,
      tenantSlug,
      categories,
    },
  });
}

async function ensureRegistrationListener(mod: PushModule) {
  if (registrationListenerAttached) return;
  registrationListenerAttached = true;

  await mod.PushNotifications.addListener("registration", async (ev) => {
    const token = ev.value?.trim();
    if (!token || !pendingAccessToken) return;
    await persistRegistrationToken(token, pendingAccessToken, pendingTenantSlug);
  });

  await mod.PushNotifications.addListener("registrationError", (err) => {
    console.warn("[push] registration error", err);
  });
}

export async function registerDeviceForPush(input: {
  accessToken: string;
  tenantSlug?: string | null;
  categories?: PushNotificationCategory[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPushNotificationsEnabled()) {
    return { ok: false, error: "Push notifications are not enabled for this build." };
  }

  const mod = await loadPushModule();
  if (!mod) {
    return { ok: false, error: "Push Notifications plugin is not available in this build." };
  }

  pendingAccessToken = input.accessToken;
  pendingTenantSlug = input.tenantSlug ?? resolveTenantSlugForPush();

  await ensureRegistrationListener(mod);

  let perm = await mod.PushNotifications.checkPermissions();
  if (perm.receive !== "granted") {
    perm = await mod.PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") {
    return { ok: false, error: "Notification permission was denied." };
  }

  await mod.PushNotifications.register();
  return { ok: true };
}

export async function attachPushNotificationListeners(
  onOpen?: (deepLink?: string) => void
): Promise<() => void> {
  if (!isPushNotificationsEnabled()) return () => {};

  const mod = await loadPushModule();
  if (!mod) return () => {};

  const handles: Array<{ remove: () => Promise<void> }> = [];

  handles.push(
    await mod.PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action.notification?.data as Record<string, string> | undefined;
      const deepLink = data?.deepLink?.trim();
      if (deepLink) onOpen?.(deepLink);
    })
  );

  return () => {
    void Promise.all(handles.map((h) => h.remove()));
  };
}
