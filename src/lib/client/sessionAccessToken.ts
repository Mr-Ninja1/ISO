import type { Session } from "@supabase/supabase-js";
import { createClient, readPersistedSupabaseSession, writeBrowserSupabaseSession } from "@/lib/auth";

/** Session from React state, or the token persisted in localStorage (Capacitor resume). */
export function getWorkspaceAccessToken(session: Session | null | undefined): string {
  if (session?.access_token) return session.access_token;
  return readPersistedSupabaseSession()?.access_token || "";
}

export function hasWorkspaceAccessToken(session: Session | null | undefined): boolean {
  return Boolean(getWorkspaceAccessToken(session));
}

/**
 * Fresh access token for API routes — prefers Supabase client session (auto-refreshed)
 * over React state, which can lag behind localStorage after TOKEN_REFRESHED events.
 */
export async function resolveWorkspaceAccessToken(
  session: Session | null | undefined,
): Promise<string> {
  try {
    const supabase = createClient();
    const {
      data: { session: live },
    } = await supabase.auth.getSession();
    if (live?.access_token) return live.access_token;
  } catch {
    // fall through to persisted session
  }

  const persisted = readPersistedSupabaseSession();
  if (persisted?.access_token && persisted.refresh_token) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.setSession({
        access_token: persisted.access_token,
        refresh_token: persisted.refresh_token,
      });
      if (!error && data.session?.access_token) {
        writeBrowserSupabaseSession(data.session);
        return data.session.access_token;
      }
    } catch {
      // fall through
    }
  }

  return getWorkspaceAccessToken(session);
}
