"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { isAppOffline } from "@/lib/client/appOffline";
import { showRequiresInternetDialog } from "@/components/RequiresInternetDialog";

export function useRequiresInternet() {
  const router = useRouter();

  const blockIfOffline = useCallback((feature: string, message?: string) => {
    if (!isAppOffline()) return false;
    showRequiresInternetDialog(feature, message);
    return true;
  }, []);

  const runIfOnline = useCallback(
    (feature: string, action: () => void, message?: string) => {
      if (blockIfOffline(feature, message)) return;
      action();
    },
    [blockIfOffline]
  );

  const pushIfOnline = useCallback(
    (feature: string, href: string, message?: string) => {
      if (blockIfOffline(feature, message)) return false;
      router.push(href);
      return true;
    },
    [blockIfOffline, router]
  );

  return { blockIfOffline, runIfOnline, pushIfOnline };
}
