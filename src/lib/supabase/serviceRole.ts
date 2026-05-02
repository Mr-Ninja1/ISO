import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function resolveServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_SERVICE_ROLE_KEY
  );
}

/** True when SSR/bootstrap code can use the service role (keys often mis-named in local .env). */
export function isSupabaseServiceRoleConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  return Boolean(url && resolveServiceRoleKey());
}

/** Server-only: bypasses RLS. Use for tenant bootstrap, SSR slug lookup, admin scripts. */
export function createServiceRoleSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = resolveServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
