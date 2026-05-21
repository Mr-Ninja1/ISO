"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { readPersistedSupabaseSession } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { isPlatformDeveloperSession } from "@/lib/client/platformDeveloperSession";
import { readPlatformDeveloperFlag } from "@/lib/client/platformDeveloperFlag";

/**
 * Keeps platform developers out of tenant workspace / onboarding flows.
 * Uses a local flag for instant redirect on cold start, then re-verifies online.
 */
export function usePlatformDeveloperRedirect() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    const accessToken =
      session?.access_token || readPersistedSupabaseSession()?.access_token || "";

    if (readPlatformDeveloperFlag()) {
      router.replace("/admin");
      return;
    }

    if (!accessToken || checkedRef.current) return;
    checkedRef.current = true;

    void (async () => {
      if (await isPlatformDeveloperSession(accessToken)) {
        router.replace("/admin");
      }
    })();
  }, [authLoading, session?.access_token, router]);
}
