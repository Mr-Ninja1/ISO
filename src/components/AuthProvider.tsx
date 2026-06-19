"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  browserSupabaseAuthStorageKey,
  createClient,
  hasPersistedAuthCredentials,
  ISO_MOBILE_SHELL_LS_KEY,
  readCachedAuthUser,
  readPersistedSupabaseSession,
  writeBrowserSupabaseSession,
  writeCachedAuthUser,
} from "@/lib/auth";
import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

type AuthContextType = {
  session: Session | null;
  user: { id: string; email: string } | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    options?: { emailRedirectTo?: string },
  ) => Promise<{ userId: string | null }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ session: Session; user: { id: string; email: string } }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function hydrateSupabaseSession(
  supabase: ReturnType<typeof createClient>,
): Promise<Session | null> {
  const {
    data: { session: supaSession },
  } = await supabase.auth.getSession();

  if (supaSession?.access_token) return supaSession;

  const fallback = readPersistedSupabaseSession();
  if (!fallback?.access_token || !fallback.refresh_token) {
    return fallback?.access_token ? fallback : null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: fallback.access_token,
    refresh_token: fallback.refresh_token,
  });

  if (error) {
    writeBrowserSupabaseSession(fallback);
    return fallback;
  }

  return data.session ?? fallback;
}

const SESSION_HYDRATE_TIMEOUT_MS = isCapacitorNativeApp() ? 2000 : 4000;

async function hydrateSupabaseSessionWithTimeout(
  supabase: ReturnType<typeof createClient>,
): Promise<Session | null> {
  const fallback = readPersistedSupabaseSession();
  try {
    const resolved = await Promise.race<Session | null>([
      hydrateSupabaseSession(supabase),
      new Promise((resolve) => {
        window.setTimeout(() => resolve(fallback), SESSION_HYDRATE_TIMEOUT_MS);
      }),
    ]);
    return resolved ?? fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() =>
    readPersistedSupabaseSession(),
  );
  const [user, setUser] = useState<{ id: string; email: string } | null>(() => {
    const cached = readCachedAuthUser();
    if (cached) return cached;
    const persisted = readPersistedSupabaseSession();
    if (persisted?.user?.id) {
      return { id: persisted.user.id, email: persisted.user.email || "" };
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return (
      !hasPersistedAuthCredentials() &&
      !readPersistedSupabaseSession()?.access_token
    );
  });
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
    }, SESSION_HYDRATE_TIMEOUT_MS + 500);

    const applySession = (resolved: Session | null) => {
      if (cancelled) return;
      setSession(resolved);
      if (resolved?.user?.id) {
        const nextUser = {
          id: resolved.user.id,
          email: resolved.user.email || "",
        };
        setUser(nextUser);
        writeCachedAuthUser(nextUser);
      }
    };

    const getSession = async () => {
      try {
        const resolved = await hydrateSupabaseSessionWithTimeout(supabase);
        applySession(resolved);
      } catch {
        if (cancelled) return;
        const fallback = readPersistedSupabaseSession();
        applySession(fallback);
      } finally {
        if (cancelled) return;
        setLoading(false);
        window.clearTimeout(timeoutId);
        try {
          const { dispatchAuthReady } =
            await import("@/lib/capacitor/otaEvents");
          dispatchAuthReady();
        } catch {
          // ignore on web-only builds
        }
      }
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      if (nextSession?.user) {
        setSession(nextSession);
        const nextUser = {
          id: nextSession.user.id,
          email: nextSession.user.email || "",
        };
        setUser(nextUser);
        writeCachedAuthUser(nextUser);
        writeBrowserSupabaseSession(nextSession);
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        try {
          localStorage.removeItem("lastTenantSlug");
          localStorage.removeItem("active-staff-profile:v1");
          localStorage.removeItem(browserSupabaseAuthStorageKey());
        } catch {
          // ignore
        }
        writeCachedAuthUser(null);
      } else {
        // INITIAL_SESSION / TOKEN_REFRESHED with null — do not wipe a session we just set via API sign-in.
        const fallback = readPersistedSupabaseSession();
        if (fallback?.access_token) {
          setSession((prev) => prev ?? fallback);
          if (fallback.user?.id) {
            setUser(
              (prev) =>
                prev ?? {
                  id: fallback.user!.id,
                  email: fallback.user!.email || "",
                },
            );
          }
        }
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signUp = async (
    email: string,
    password: string,
    options?: { emailRedirectTo?: string },
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: options?.emailRedirectTo
        ? { emailRedirectTo: options.emailRedirectTo }
        : undefined,
    });
    if (error) throw error;
    return { userId: data.user?.id ?? null };
  };

  const applySignedInSession = async (
    sessionPayload: Session,
    userPayload: { id: string; email: string },
  ) => {
    const { data, error } = await supabase.auth.setSession({
      access_token: sessionPayload.access_token,
      refresh_token: sessionPayload.refresh_token,
    });

    const activeSession = data.session ?? sessionPayload;
    if (error) {
      writeBrowserSupabaseSession(sessionPayload);
    } else if (activeSession) {
      writeBrowserSupabaseSession(activeSession);
    }

    setSession(activeSession);
    setUser(userPayload);
    writeCachedAuthUser(userPayload);

    return { session: activeSession, user: userPayload };
  };

  const signIn = async (email: string, password: string) => {
    let apiUnavailable = false;

    try {
      const res = await fetch(apiUrl("/api/auth/sign-in"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 404 || res.status === 405) {
        apiUnavailable = true;
      } else {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || "Sign in failed");
        }

        const sessionPayload = payload?.session as Session | undefined;
        const userPayload = payload?.user as
          | { id?: string; email?: string }
          | undefined;
        if (
          !sessionPayload?.access_token ||
          !sessionPayload.refresh_token ||
          !userPayload?.id
        ) {
          throw new Error("Sign in failed");
        }

        return applySignedInSession(sessionPayload, {
          id: userPayload.id,
          email: userPayload.email || email,
        });
      }
    } catch (error: unknown) {
      if (!apiUnavailable) {
        const message = error instanceof Error ? error.message : "";
        if (
          message &&
          !message.includes("fetch") &&
          !message.includes("network")
        ) {
          throw error;
        }
        apiUnavailable = true;
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session || !data.user) {
      throw new Error(error?.message || "Sign in failed");
    }

    return applySignedInSession(data.session, {
      id: data.user.id,
      email: data.user.email || email,
    });
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    try {
      localStorage.removeItem("lastTenantSlug");
      localStorage.removeItem("active-staff-profile:v1");
      localStorage.removeItem(ISO_MOBILE_SHELL_LS_KEY);
      localStorage.removeItem(browserSupabaseAuthStorageKey());
    } catch {
      // ignore
    }
    writeCachedAuthUser(null);
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, loading, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export { hasPersistedAuthCredentials } from "@/lib/auth";
