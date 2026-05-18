"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserSupabaseAuthStorageKey, createClient, ISO_MOBILE_SHELL_LS_KEY, readPersistedSupabaseSession } from "@/lib/auth";
import { apiUrl } from "@/lib/client/apiBase";

const LAST_AUTH_USER_KEY = "iso-last-auth-user:v1";

type CachedAuthUser = {
  id: string;
  email: string;
};

function readCachedAuthUser(): CachedAuthUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(LAST_AUTH_USER_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as Partial<CachedAuthUser>;
    if (typeof candidate.id !== "string" || !candidate.id) return null;

    return {
      id: candidate.id,
      email: typeof candidate.email === "string" ? candidate.email : "",
    };
  } catch {
    return null;
  }
}

function writeCachedAuthUser(user: CachedAuthUser | null) {
  if (typeof window === "undefined") return;

  try {
    if (!user) {
      localStorage.removeItem(LAST_AUTH_USER_KEY);
      return;
    }

    localStorage.setItem(LAST_AUTH_USER_KEY, JSON.stringify(user));
  } catch {
    // ignore storage failures
  }
}

type AuthContextType = {
  session: Session | null;
  user: { id: string; email: string } | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    options?: { emailRedirectTo?: string }
  ) => Promise<{ userId: string | null }>;
  signIn: (email: string, password: string) => Promise<{ session: Session; user: { id: string; email: string } }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
function persistNativeSession(session: Session) {
  if (typeof window === "undefined") return;

  try {
    const payload = JSON.stringify({ currentSession: session });
    localStorage.setItem(browserSupabaseAuthStorageKey(), payload);
    localStorage.setItem(ISO_MOBILE_SHELL_LS_KEY, "1");
  } catch {
    // ignore storage failures
  }
}


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readPersistedSupabaseSession());
  const [user, setUser] = useState<{ id: string; email: string } | null>(() => {
    const cached = readCachedAuthUser();
    if (cached) return cached;
    const persisted = readPersistedSupabaseSession();
    if (persisted?.user?.id) {
      return { id: persisted.user.id, email: persisted.user.email || "" };
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
    }, 3000);

    // Check current session
    const getSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;
        const resolved = session ?? readPersistedSupabaseSession();
        setSession(resolved);
        if (resolved?.user) {
          const nextUser = { id: resolved.user.id, email: resolved.user.email || "" };
          setUser(nextUser);
          writeCachedAuthUser(nextUser);
        }
      } catch {
        if (cancelled) return;
        const fallback = readPersistedSupabaseSession();
        if (fallback) {
          setSession(fallback);
          if (fallback.user?.id) {
            const nextUser = { id: fallback.user.id, email: fallback.user.email || "" };
            setUser(nextUser);
            writeCachedAuthUser(nextUser);
          }
        }
      } finally {
        if (cancelled) return;
        setLoading(false);
        window.clearTimeout(timeoutId);
      }
    };

    getSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setSession(session);
      if (session?.user) {
        const nextUser = { id: session.user.id, email: session.user.email || "" };
        setUser(nextUser);
        writeCachedAuthUser(nextUser);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        try {
          localStorage.removeItem("lastTenantSlug");
          localStorage.removeItem("active-staff-profile:v1");
        } catch {
          // ignore
        }
        writeCachedAuthUser(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signUp = async (email: string, password: string, options?: { emailRedirectTo?: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: options?.emailRedirectTo ? { emailRedirectTo: options.emailRedirectTo } : undefined,
    });
    if (error) throw error;
    return { userId: data.user?.id ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const res = await fetch(apiUrl("/api/auth/sign-in"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || "Sign in failed");
    }

    const session = payload?.session as Session | undefined;
    const user = payload?.user as { id?: string; email?: string } | undefined;
    if (!session || !user?.id) {
      throw new Error("Sign in failed");
    }

    setSession(session);
    const nextUser = { id: user.id, email: user.email || "" };
    setUser(nextUser);
    writeCachedAuthUser(nextUser);
    persistNativeSession(session);

    return { session, user: nextUser };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    try {
      localStorage.removeItem("lastTenantSlug");
      localStorage.removeItem("active-staff-profile:v1");
      localStorage.removeItem(ISO_MOBILE_SHELL_LS_KEY);
      localStorage.removeItem(LAST_AUTH_USER_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signUp, signIn, signOut }}>
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
