import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type Session } from "@supabase/supabase-js";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";

/** Set by iso-mobile WebView before load — session lives in localStorage (`sb-*-auth-token`). */
export const ISO_MOBILE_SHELL_LS_KEY = "__ISO_MOBILE_SHELL__";

export const LAST_AUTH_USER_KEY = "iso-last-auth-user:v1";

export type CachedAuthUser = {
  id: string;
  email: string;
};

export function readCachedAuthUser(): CachedAuthUser | null {
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

export function writeCachedAuthUser(user: CachedAuthUser | null) {
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

/** True when we still have a cached user or Supabase session in localStorage. */
export function hasPersistedAuthCredentials(): boolean {
  if (readPersistedSupabaseSession()?.access_token) return true;
  return Boolean(readCachedAuthUser()?.id);
}

/**
 * Persist session in the format Supabase Auth expects (flat session JSON, not `{ currentSession }`).
 */
export function writeBrowserSupabaseSession(session: Session) {
  if (typeof window === "undefined") return;

  try {
    if (isCapacitorNativeApp()) {
      markCapacitorShell();
    }
    localStorage.setItem(browserSupabaseAuthStorageKey(), JSON.stringify(session));
  } catch {
    // ignore storage failures
  }
}

/** Same rule as mobile `getSupabaseAuthStorageKey()` so injected tokens are read by the web client. */
export function browserSupabaseAuthStorageKey(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    const u = new URL(url);
    const first = u.hostname.split(".")[0] || "local";
    return `sb-${first}-auth-token`;
  } catch {
    return "sb-local-auth-token";
  }
}

/**
 * Browser client for the Next app.
 *
 * Default: `@supabase/ssr` cookie storage (PKCE) — normal desktop/mobile Safari/Chrome.
 *
 * Embedded Expo WebView: native login injects `sb-*-auth-token` into **localStorage** and sets
 * `__ISO_MOBILE_SHELL__`. Without this branch, the site keeps cookies-only auth and looks logged out.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (typeof window !== "undefined") {
    try {
      if (isCapacitorNativeApp()) {
        markCapacitorShell();
      }
      const shell = window.localStorage.getItem(ISO_MOBILE_SHELL_LS_KEY);
      if (isCapacitorNativeApp() || shell === "capacitor") {
        return createSupabaseClient(url, anon, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage,
            storageKey: browserSupabaseAuthStorageKey(),
            flowType: "pkce",
          },
        });
      }
    } catch {
      // ignore private mode / quota
    }
  }

  return createBrowserClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** Read Supabase session JSON persisted in localStorage (Capacitor / mobile shell). */
export function readPersistedSupabaseSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(browserSupabaseAuthStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      currentSession?: Session | null;
      session?: Session | null;
      access_token?: string;
      user?: Session["user"];
    };
    if (parsed?.currentSession?.access_token) return parsed.currentSession;
    if (parsed?.session?.access_token) return parsed.session;
    if (parsed?.access_token && parsed?.user) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
}
