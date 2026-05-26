"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOptionalAuth } from "@/components/AuthProvider";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import {
  attachPushNotificationListeners,
  isPushNotificationsEnabled,
  registerDeviceForPush,
} from "@/lib/push/pushNotificationService";

/**
 * Native-only: registers FCM token and handles notification tap → in-app route.
 */
export function PushNotificationsBootstrap() {
  const router = useRouter();
  const auth = useOptionalAuth();
  const accessToken = getWorkspaceAccessToken(auth?.session);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPushNotificationsEnabled() || !accessToken) return;

    let cancelled = false;
    let removeListeners: (() => void) | undefined;

    void (async () => {
      removeListeners = await attachPushNotificationListeners((deepLink) => {
        if (!deepLink) return;
        if (deepLink.startsWith("http")) {
          window.location.href = deepLink;
          return;
        }
        router.push(deepLink.startsWith("/") ? deepLink : `/${deepLink}`);
      });

      if (cancelled) return;
      if (sessionRef.current === accessToken) return;
      sessionRef.current = accessToken;

      const result = await registerDeviceForPush({ accessToken });
      if (!result.ok && process.env.NODE_ENV !== "production") {
        console.info("[push] register:", result.error);
      }
    })();

    return () => {
      cancelled = true;
      removeListeners?.();
    };
  }, [accessToken, router]);

  return null;
}
