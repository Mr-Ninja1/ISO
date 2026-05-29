import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import type {
  DevicePushRegistration,
  PushNotificationCategory,
} from "@/lib/push/types";

type PushPermissionState = "granted" | "denied" | "prompt";

type PushRegistrationEvent = { value?: string };
type PushActionPerformedEvent = {
  notification?: { data?: Record<string, string> };
};

type PushListener = {
  registration: (event: PushRegistrationEvent) => void | Promise<void>;
  registrationError: (event: unknown) => void;
  pushNotificationActionPerformed: (event: PushActionPerformedEvent) => void;
  pushNotificationReceived: (event: unknown) => void;
};

type PushPlugin = {
  requestPermissions: () => Promise<{
    receive?: PushPermissionState;
  }>;
  register: () => Promise<void>;
  addListener<E extends keyof PushListener>(
    eventName: E,
    listener: PushListener[E],
  ): Promise<{ remove: () => Promise<void> }>;
};

async function getPushPlugin(): Promise<PushPlugin | null> {
  try {
    const mod = await import("@capacitor/push-notifications");
    return mod.PushNotifications as unknown as PushPlugin;
  } catch {
    return null;
  }
}

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
      JSON.stringify({ token: input.registration.token, at: Date.now() }),
    );
  } catch {
    // ignore
  }

  return { ok: true };
}

export async function registerDeviceForPush(input: {
  accessToken: string;
  tenantSlug?: string | null;
  categories?: PushNotificationCategory[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPushNotificationsEnabled()) {
    return {
      ok: false,
      error: "Push notifications are not enabled for this build.",
    };
  }

  const PushNotifications = await getPushPlugin();
  if (!PushNotifications) {
    return {
      ok: false,
      error: "Push notifications plugin is not installed in this build.",
    };
  }

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") {
    return { ok: false, error: "Notification permission was not granted." };
  }

  try {
    localStorage.setItem(
      `${REGISTRATION_STORAGE_KEY}:pending`,
      JSON.stringify({
        accessToken: input.accessToken,
        tenantSlug: input.tenantSlug ?? null,
        categories: input.categories ?? ["announcement", "system", "reminder"],
      }),
    );
  } catch {
    // ignore
  }

  await PushNotifications.register();
  return { ok: true };
}

export async function attachPushNotificationListeners(
  onOpen?: (deepLink?: string) => void,
): Promise<() => void> {
  if (!isPushNotificationsEnabled()) return () => {};

  const PushNotifications = await getPushPlugin();
  if (!PushNotifications) return () => {};

  const listeners = await Promise.all([
    PushNotifications.addListener(
      "registration",
      async (tokenEvent: { value?: string }) => {
        const token =
          typeof tokenEvent?.value === "string" ? tokenEvent.value.trim() : "";
        if (!token) return;

        let pending: {
          accessToken?: string;
          tenantSlug?: string | null;
          categories?: PushNotificationCategory[];
        } | null = null;
        try {
          pending = JSON.parse(
            localStorage.getItem(`${REGISTRATION_STORAGE_KEY}:pending`) ||
              "null",
          );
        } catch {
          pending = null;
        }

        const accessToken = pending?.accessToken || "";
        if (!accessToken) return;

        await savePushTokenOnServer({
          accessToken,
          registration: {
            tenantSlug: pending?.tenantSlug ?? null,
            platform: "android",
            token,
            categories: pending?.categories ?? [
              "announcement",
              "system",
              "reminder",
            ],
          },
        });
      },
    ),
    PushNotifications.addListener("registrationError", (error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[push] registration error", error);
      }
    }),
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (event: { notification?: { data?: Record<string, string> } }) => {
        const deepLink = event?.notification?.data?.deepLink;
        onOpen?.(deepLink);
      },
    ),
    PushNotifications.addListener("pushNotificationReceived", () => {
      // Native OS UI handles background notifications; foreground handling can be enhanced later.
    }),
  ]);

  return () => {
    for (const listener of listeners) {
      void listener.remove();
    }
  };
}
