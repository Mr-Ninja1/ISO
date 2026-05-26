"use client";

import { Download } from "lucide-react";
import { AndroidApkDownloadTrigger } from "@/components/AndroidApkDownloadTrigger";
import { AndroidIcon } from "@/components/icons/AndroidIcon";
import { useAndroidMobileWebInstall } from "@/hooks/useAndroidMobileWebInstall";
import { useInstalledNativeShell } from "@/hooks/useInstalledNativeShell";
import { PRODUCT_NAME_ANDROID } from "@/lib/branding";

type Props = {
  onNavigate?: () => void;
};

/** Workspace ⋮ menu — APK download promo (website only; never in installed app). */
export function WorkspaceAndroidAppMenuItem({ onNavigate }: Props) {
  const installedShell = useInstalledNativeShell();
  const { visible, apkUrl } = useAndroidMobileWebInstall();

  if (installedShell || !visible) return null;

  return (
    <>
      <div className="my-1 border-t border-foreground/10" role="separator" />
      <AndroidApkDownloadTrigger
        apkUrl={apkUrl}
        onActivate={onNavigate}
        className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--hse-teal)_22%,transparent)] bg-[color-mix(in_srgb,var(--hse-sky)_45%,white)] px-3 py-2.5 text-left text-sm transition hover:bg-[color-mix(in_srgb,var(--hse-sky)_65%,white)]"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3DDC84] text-[#0d3d2a] shadow-sm">
          <AndroidIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[var(--hse-charcoal)]">{PRODUCT_NAME_ANDROID}</span>
          <span className="block text-[11px] text-[var(--hse-teal-mid)]">Download the app (APK)</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--hse-teal)] ring-1 ring-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)]">
          <Download className="h-3 w-3" aria-hidden />
          APK
        </span>
      </AndroidApkDownloadTrigger>
    </>
  );
}
