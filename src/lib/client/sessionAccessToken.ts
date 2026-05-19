import type { Session } from "@supabase/supabase-js";
import { readPersistedSupabaseSession } from "@/lib/auth";

/** Session from React state, or the token persisted in localStorage (Capacitor resume). */
export function getWorkspaceAccessToken(session: Session | null | undefined): string {
  if (session?.access_token) return session.access_token;
  return readPersistedSupabaseSession()?.access_token || "";
}

export function hasWorkspaceAccessToken(session: Session | null | undefined): boolean {
  return Boolean(getWorkspaceAccessToken(session));
}
