"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Download, Smartphone, X } from "lucide-react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { apiUrl } from "@/lib/client/apiBase";
import { MOBILE_APP_BANNER_DISMISS_KEY } from "@/lib/client/mobileAndroidWeb";

const ENV_APK_URL = (process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();

type Placement = "login" | "workspace";
type Variant = "banner" | "slim";

type Props = {
  placement?: Placement;
  variant?: Variant;
};

/**
 * Prompts users to install the Android sideload APK on web (any platform).
 * Never shown inside the Capacitor native app.
 */
export function MobileAppInstallBanner({ placement = "login", variant }: Props) {
  const resolvedVariant: Variant = variant ?? (placement === "login" ? "slim" : "banner");
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [apkUrl, setApkUrl] = useState(ENV_APK_URL);

  useEffect(() => {
    if (isCapacitorNativeApp()) {
      setEligible(false);
      return;
    }

    setEligible(true);
    try {
      setDismissed(localStorage.getItem(MOBILE_APP_BANNER_DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!eligible) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { latestApkUrl?: string | null };
        if (cancelled) return;
        const url = (json.latestApkUrl || ENV_APK_URL || "").trim();
        if (url) setApkUrl(url);
      } catch {
        // keep env fallback
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eligible]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(MOBILE_APP_BANNER_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }, []);

  if (!eligible || dismissed || !apkUrl) return null;

  const isLogin = placement === "login";

  if (resolvedVariant === "slim") {
    return (
      <div
        className={`mobile-app-install-link ${isLogin ? "mobile-app-install-link--login" : "mobile-app-install-link--workspace"}`}
        role="region"
        aria-label="Download ISO Grid Android app"
      >
        <a
          href={apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mobile-app-install-link__anchor"
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Download Android app
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="mobile-app-install-link__close"
          aria-label="Dismiss download app link"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`mobile-app-install-banner ${isLogin ? "mobile-app-install-banner--login" : "mobile-app-install-banner--workspace"}`}
      role="region"
      aria-label="Install ISO Grid app"
    >
      <div className="mobile-app-install-banner__inner">
        <div className="mobile-app-install-banner__logo" aria-hidden>
          <Image src="/icon.svg" alt="" width={44} height={44} className="h-11 w-11" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="mobile-app-install-banner__title">Get the ISO Grid app</p>
          <p className="mobile-app-install-banner__text">
            Install on Android for offline inspections and field work — faster than the browser.
          </p>
          <a
            href={apkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mobile-app-install-banner__cta"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Download app
          </a>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mobile-app-install-banner__close"
          aria-label="Dismiss install app banner"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
