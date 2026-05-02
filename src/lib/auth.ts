import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Set by iso-mobile WebView before load — session lives in localStorage (`sb-*-auth-token`). */
export const ISO_MOBILE_SHELL_LS_KEY = "__ISO_MOBILE_SHELL__";

/** Same rule as mobile `getSupabaseAuthStorageKey()` so injected tokens are read by the web client. */
function browserSupabaseAuthStorageKey(): string {
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
      if (window.localStorage.getItem(ISO_MOBILE_SHELL_LS_KEY) === "1") {
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
