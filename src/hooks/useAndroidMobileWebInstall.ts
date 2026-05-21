"use client";

import { useEffect, useState } from "react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { fetchPlatformClientConfig } from "@/lib/capacitor/platformClientConfig";
import { resolveAndroidApkDownloadUrl } from "@/lib/client/apkDownloadUrl";
import { isAndroidMobileWeb } from "@/lib/client/mobileAndroidWeb";

/** Android mobile browser only — not the installed Capacitor app. */
export function useAndroidMobileWebInstall() {
  const [visible, setVisible] = useState(false);
  const [apkUrl, setApkUrl] = useState(() => resolveAndroidApkDownloadUrl());

  useEffect(() => {
    if (isCapacitorNativeApp() || !isAndroidMobileWeb()) {
      setVisible(false);
      return;
    }

    setVisible(true);

    let cancelled = false;
    void fetchPlatformClientConfig().then(({ config }) => {
      if (cancelled) return;
      setApkUrl(resolveAndroidApkDownloadUrl(config));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { visible, apkUrl };
}
