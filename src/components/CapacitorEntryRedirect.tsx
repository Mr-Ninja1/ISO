"use client";

import { useEffect } from "react";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import {
  hardNavigate,
  isAppRootPath,
  isWorkspaceEntryWithoutTenant,
  normalizeAppPathname,
  resolvePostAuthDestination,
} from "@/lib/client/appEntryNavigation";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { isNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";

function redirectFromEntryIfNeeded() {
  if (!isCapacitorNativeApp()) return;
  if (isNativeUpdateBlocked() || isNativeUpdateRequiredFromCache(parseNativeBuild())) return;

  const path = normalizeAppPathname(window.location.pathname);
  const search = window.location.search;

  if (isAppRootPath(path) || isWorkspaceEntryWithoutTenant(path, search)) {
    hardNavigate(resolvePostAuthDestination());
  }
}

/** Static Capacitor bundle: avoid an empty `/` shell before client routing runs. */
export function CapacitorEntryRedirect() {
  useEffect(() => {
    redirectFromEntryIfNeeded();

    let removeAppListener: (() => void) | undefined;

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) redirectFromEntryIfNeeded();
        })
      )
      .then((handle) => {
        removeAppListener = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        // plugin unavailable
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") redirectFromEntryIfNeeded();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) redirectFromEntryIfNeeded();
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, []);

  return null;
}
