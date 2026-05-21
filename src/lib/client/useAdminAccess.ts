"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, hasPersistedAuthCredentials, readCachedAuthUser, readPersistedSupabaseSession } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { adminFetch } from "@/lib/client/adminFetch";
import { clearPlatformDeveloperFlag, writePlatformDeveloperFlag } from "@/lib/client/platformDeveloperFlag";

export type AdminAccessStatus =
  | "loading"
  | "offline"
  | "unauthenticated"
  | "denied"
  | "ready";

export function useAdminAccess() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const offline = useAppOffline();
  const [accessDenied, setAccessDenied] = useState(false);
  const [verified, setVerified] = useState(false);
  const [sessionHint, setSessionHint] = useState("");
  const [resolveTimedOut, setResolveTimedOut] = useState(false);
  const refreshAttempted = useRef(false);

  const persisted = readPersistedSupabaseSession();
  const accessToken = session?.access_token || persisted?.access_token || "";
  const userEmail = user?.email || readCachedAuthUser()?.email || persisted?.user?.email || "";

  const hasCredentials = hasPersistedAuthCredentials();
  const isResolving = authLoading || (hasCredentials && !accessToken && !accessDenied && !resolveTimedOut);

  useEffect(() => {
    if (!authLoading && hasCredentials && !accessToken) {
      const t = window.setTimeout(() => setResolveTimedOut(true), 8_000);
      return () => window.clearTimeout(t);
    }
    setResolveTimedOut(false);
  }, [authLoading, hasCredentials, accessToken]);

  const refreshSession = useCallback(async () => {
    const supabase = createClient();
    const stored = readPersistedSupabaseSession();
    if (!stored?.refresh_token) return false;
    const { data, error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error) {
      const refreshed = await supabase.auth.refreshSession();
      return Boolean(refreshed.data.session?.access_token);
    }
    return Boolean(data.session?.access_token);
  }, []);

  useEffect(() => {
    if (authLoading || accessToken || refreshAttempted.current) return;
    if (!hasCredentials) return;
    refreshAttempted.current = true;
    void refreshSession().then((ok) => {
      if (!ok) setSessionHint("Could not restore your session. Sign in again.");
    });
  }, [authLoading, accessToken, hasCredentials, refreshSession]);

  useEffect(() => {
    if (isResolving || offline || !accessToken) {
      if (!accessToken && !isResolving && !hasCredentials) setVerified(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await adminFetch("/api/admin/metrics", {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs: 20_000,
      });
      if (cancelled) return;
      if (result.ok) {
        setAccessDenied(false);
        setVerified(true);
        setSessionHint("");
        writePlatformDeveloperFlag(true);
      } else if (result.status === 403) {
        clearPlatformDeveloperFlag();
        setAccessDenied(true);
        setVerified(false);
      } else if (result.status === 401) {
        setSessionHint(result.error);
        setVerified(false);
        const refreshed = await refreshSession();
        if (!refreshed) setSessionHint("Your session expired. Sign out and sign in again.");
      } else {
        setVerified(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isResolving, offline, accessToken, refreshSession, hasCredentials]);

  const status: AdminAccessStatus = useMemo(() => {
    if (offline) return "offline";
    if (accessDenied) return "denied";
    if (!hasCredentials && !user) return "unauthenticated";
    if (!accessToken && (resolveTimedOut || sessionHint)) return "unauthenticated";
    if (isResolving || (!verified && accessToken && !accessDenied)) return "loading";
    if (!accessToken) return "unauthenticated";
    return "ready";
  }, [
    offline,
    isResolving,
    verified,
    accessDenied,
    user,
    hasCredentials,
    accessToken,
    resolveTimedOut,
    sessionHint,
  ]);

  const handleSignOut = useCallback(async () => {
    clearPlatformDeveloperFlag();
    try {
      await signOut();
    } catch {
      // still navigate away
    }
    router.replace("/developer-login");
  }, [signOut, router]);

  return {
    status,
    accessToken,
    userEmail,
    sessionHint,
    accessDenied,
    signOut: handleSignOut,
    refreshSession,
    clearSessionHint: () => setSessionHint(""),
  };
}
