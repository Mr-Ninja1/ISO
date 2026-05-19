"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOptionalAuth } from "@/components/AuthProvider";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import { attachPushNotificationListeners, isPushNotificationsEnabled } from "@/lib/push/pushNotificationService";

/**
 * Prepares push notification listeners when enabled.
 * Registration is triggered from settings once FCM/APNs is configured (see docs/PUSH_NOTIFICATIONS.md).
 */
export function PushNotificationsBootstrap() {
  const router = useRouter();
  const auth = useOptionalAuth();
  const accessToken = getWorkspaceAccessToken(auth?.session);

  useEffect(() => {
    if (!isPushNotificationsEnabled()) return;

    let removeListeners: (() => void) | undefined;

    void attachPushNotificationListeners((deepLink) => {
      if (!deepLink) return;
      if (deepLink.startsWith("http")) {
        window.location.href = deepLink;
        return;
      }
      router.push(deepLink.startsWith("/") ? deepLink : `/${deepLink}`);
    }).then((remove) => {
      removeListeners = remove;
    });

    return () => {
      removeListeners?.();
    };
  }, [router]);

  useEffect(() => {
    if (!isPushNotificationsEnabled() || !accessToken) return;
    // Auto-register can be enabled later via settings UI + tenant preference.
  }, [accessToken]);

  return null;
}
