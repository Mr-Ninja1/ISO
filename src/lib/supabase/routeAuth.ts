import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function resolveSupabasePublicEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { supabaseUrl, supabaseAnonKey };
}

/** Route handlers: Supabase as the logged-in user (RLS applies), matching /api/workspace. */
export function createAuthenticatedRouteClient(accessToken: string): SupabaseClient | null {
  const { supabaseUrl, supabaseAnonKey } = resolveSupabasePublicEnv();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function getRouteUser(accessToken: string): Promise<{ user: User | null; supabase: SupabaseClient | null }> {
  const supabase = createAuthenticatedRouteClient(accessToken);
  if (!supabase) return { user: null, supabase: null };

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { user: null, supabase: null };
  return { user, supabase };
}
