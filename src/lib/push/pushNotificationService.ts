import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import type { DevicePushRegistration, PushNotificationCategory } from "@/lib/push/types";

const ENABLED = process.env.NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED === "1";
const REGISTRATION_STORAGE_KEY = "iso-push-registration:v1";

export function isPushNotificationsEnabled() {
  return ENABLED && isCapacitorNativeApp();
}

/**
 * Registers the device token with our API after Capacitor PushNotifications fires `registration`.
 * Wire this from settings once `@capacitor/push-notifications` and FCM are configured.
 */
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

export async function registerDeviceForPush(_input: {
  accessToken: string;
  tenantSlug?: string | null;
  categories?: PushNotificationCategory[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPushNotificationsEnabled()) {
    return { ok: false, error: "Push notifications are not enabled for this build." };
  }

  return {
    ok: false,
    error:
      "Install @capacitor/push-notifications, add google-services.json, then connect listeners in PushNotificationsBootstrap. See docs/PUSH_NOTIFICATIONS.md.",
  };
}

export async function attachPushNotificationListeners(
  _onOpen?: (deepLink?: string) => void
): Promise<() => void> {
  if (!isPushNotificationsEnabled()) return () => {};
  return () => {};
}
