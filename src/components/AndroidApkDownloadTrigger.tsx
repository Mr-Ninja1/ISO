"use client";

import { useState, type ReactNode } from "react";
import { AndroidApkInstallDialog } from "@/components/AndroidApkInstallDialog";

type Props = {
  apkUrl: string;
  onActivate?: () => void;
  className?: string;
  children: ReactNode;
};

/** Opens safety + install instructions before starting the APK download. */
export function AndroidApkDownloadTrigger({ apkUrl, onActivate, className, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          onActivate?.();
          setOpen(true);
        }}
      >
        {children}
      </button>
      <AndroidApkInstallDialog open={open} apkUrl={apkUrl} onClose={() => setOpen(false)} />
    </>
  );
}
