import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Route handlers: Supabase as the logged-in user (RLS applies). */
export function createSupabaseWithBearer(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
