import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type Session } from "@supabase/supabase-js";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";

/** Set by iso-mobile WebView before load — session lives in localStorage (`sb-*-auth-token`). */
export const ISO_MOBILE_SHELL_LS_KEY = "__ISO_MOBILE_SHELL__";

export const LAST_AUTH_USER_KEY = "iso-last-auth-user:v1";

const AUTH_STORAGE_PREFIX = "sb-";
const QUOTA_PRUNE_PREFIXES = [
  "workspace-cache:v2:",
  "dc-ai-context:v1:",
  "activity-cache:v1:",
  "audits-list-cache:v1:",
  "audit-template-cache:v1:",
  "audit-report-snapshot:v1:",
  "audit-report-last:v1:",
  "tenant-messages:v1:",
  "tenant-alert-seen:v1:",
  "recent-templates:v1:",
  "template-sync-queue:v1",
  "background-mutation-queue:v1",
];

export type CachedAuthUser = {
  id: string;
  email: string;
};

function isQuotaExceededError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("quota") || message.includes("storage");
}

function localStorageKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

function pruneKeysByPrefix(prefix: string) {
  if (typeof window === "undefined") return 0;
  let removed = 0;
  for (const key of localStorageKeys()) {
    if (!key.startsWith(prefix)) continue;
    try {
      window.localStorage.removeItem(key);
      removed += 1;
    } catch {
      // ignore
    }
  }
  return removed;
}

function reclaimStorageForAuth() {
  if (typeof window === "undefined") return false;
  let removed = 0;
  for (const prefix of QUOTA_PRUNE_PREFIXES) {
    removed += pruneKeysByPrefix(prefix);
  }

  // Last resort: remove lightweight per-device UI hints, but never auth keys.
  if (removed === 0) {
    for (const key of localStorageKeys()) {
      if (key === LAST_AUTH_USER_KEY || key === ISO_MOBILE_SHELL_LS_KEY) continue;
      if (key.startsWith(AUTH_STORAGE_PREFIX)) continue;
      if (
        key === "lastTenantSlug" ||
        key === "active-staff-profile:v1" ||
        key === "offlineModeEnabled" ||
        key === "offlinePreparedAt" ||
        key.startsWith("iso-native-build-dismissed:v1:")
      ) {
        try {
          window.localStorage.removeItem(key);
          removed += 1;
        } catch {
          // ignore
        }
      }
    }
  }

  return removed > 0;
}

function safeLocalStorageSetItem(key: string, value: string) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error) || !reclaimStorageForAuth()) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

function authStorageAdapter(storageKey: string): Storage {
  return {
    get length() {
      return window.localStorage.length;
    },
    clear() {
      window.localStorage.clear();
    },
    getItem(key) {
      return window.localStorage.getItem(key);
    },
    key(index) {
      return window.localStorage.key(index);
    },
    removeItem(key) {
      window.localStorage.removeItem(key);
    },
    setItem(key, value) {
      const ok = safeLocalStorageSetItem(key, value);
      if (!ok && key === storageKey) {
        throw new Error("Local storage is full. Clear site data and try again.");
      }
    },
  };
}

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

    safeLocalStorageSetItem(LAST_AUTH_USER_KEY, JSON.stringify(user));
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
    markCapacitorShell();
    safeLocalStorageSetItem(browserSupabaseAuthStorageKey(), JSON.stringify(session));
    safeLocalStorageSetItem(ISO_MOBILE_SHELL_LS_KEY, "1");
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
      if (shell === "1" || shell === "capacitor") {
        const storageKey = browserSupabaseAuthStorageKey();
        return createSupabaseClient(url, anon, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: authStorageAdapter(storageKey),
            storageKey,
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
