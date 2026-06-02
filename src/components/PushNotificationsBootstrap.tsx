"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useOptionalAuth } from "@/components/AuthProvider";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import {
  attachPushNotificationListeners,
  isPushNotificationsEnabled,
  registerDeviceForPush,
} from "@/lib/push/pushNotificationService";

/**
 * Prepares push notification listeners when enabled.
 * Auto-registers native devices once the user session is ready.
 */
export function PushNotificationsBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = useOptionalAuth();
  const accessToken = getWorkspaceAccessToken(auth?.session);
  const [listenersReady, setListenersReady] = useState(false);

  useEffect(() => {
    if (!isPushNotificationsEnabled()) return;

    let removeListeners: (() => void) | undefined;
    setListenersReady(false);

    void attachPushNotificationListeners((deepLink) => {
      if (!deepLink) return;
      if (deepLink.startsWith("http")) {
        window.location.href = deepLink;
        return;
      }
      router.push(deepLink.startsWith("/") ? deepLink : `/${deepLink}`);
    }).then((remove) => {
      removeListeners = remove;
      setListenersReady(true);
    });

    return () => {
      setListenersReady(false);
      removeListeners?.();
    };
  }, [router]);

  useEffect(() => {
    if (!isPushNotificationsEnabled() || !accessToken || !listenersReady) return;

    const tenantSlug =
      searchParams?.get("tenantSlug") ||
      (pathname?.startsWith("/")
        ? pathname.split("/").filter(Boolean)[0] || null
        : null);

    void registerDeviceForPush({
      accessToken,
      tenantSlug,
      categories: ["announcement", "system", "reminder"],
    });
  }, [accessToken, pathname, searchParams, listenersReady]);

  return null;
}
