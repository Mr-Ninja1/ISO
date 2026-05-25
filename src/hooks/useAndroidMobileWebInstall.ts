"use client";

import { useEffect, useState } from "react";
import { fetchPlatformClientConfig, readCachedPlatformClientConfig } from "@/lib/capacitor/platformClientConfig";
import { isInstalledNativeShell } from "@/lib/capacitor/runtime";
import { resolveAndroidApkDownloadUrl } from "@/lib/client/apkDownloadUrl";
import { shouldShowApkInstallPromo } from "@/lib/client/mobileAndroidWeb";

/**
 * APK install promo on the public website (desktop and mobile browsers).
 * Hidden inside the installed native shell (runtime bridge / WebView — not a build flag alone).
 */
export function useAndroidMobileWebInstall() {
  const [visible, setVisible] = useState(false);
  const [apkUrl, setApkUrl] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isInstalledNativeShell() || !shouldShowApkInstallPromo()) {
      setVisible(false);
      setApkUrl("");
      return;
    }

    setVisible(true);
    setApkUrl(resolveAndroidApkDownloadUrl(readCachedPlatformClientConfig()));

    let cancelled = false;
    void fetchPlatformClientConfig().then(({ config }) => {
      if (cancelled || isInstalledNativeShell()) return;
      setApkUrl(resolveAndroidApkDownloadUrl(config));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { visible, apkUrl: visible ? apkUrl : "" };
}
