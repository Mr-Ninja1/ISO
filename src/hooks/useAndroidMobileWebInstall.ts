"use client";

import { useEffect, useState } from "react";
import { fetchPlatformClientConfig } from "@/lib/capacitor/platformClientConfig";
import { resolveAndroidApkDownloadUrl } from "@/lib/client/apkDownloadUrl";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { shouldShowApkInstallPromo } from "@/lib/client/mobileAndroidWeb";

/**
 * APK install promo for mobile web only.
 * Returns visible=false and empty apkUrl inside the installed native app.
 */
export function useAndroidMobileWebInstall() {
  const [visible, setVisible] = useState(false);
  const [apkUrl, setApkUrl] = useState("");

  useEffect(() => {
    const hide = () => {
      setVisible(false);
      setApkUrl("");
    };

    if (isCapacitorNativeApp() || !shouldShowApkInstallPromo()) {
      hide();
      return;
    }

    setVisible(true);

    let cancelled = false;
    void fetchPlatformClientConfig().then(({ config }) => {
      if (cancelled) return;
      setApkUrl(resolveAndroidApkDownloadUrl(config));
    });

    const recheck = () => {
      if (isCapacitorNativeApp()) hide();
    };
    recheck();
    const interval = window.setInterval(recheck, 400);
    window.setTimeout(() => window.clearInterval(interval), 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return { visible, apkUrl: visible ? apkUrl : "" };
}
