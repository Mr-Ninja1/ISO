import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

function createAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
}

export async function isPlatformDeveloperEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() || "";
  if (!normalized) return false;

  const svc = createServiceRoleSupabase();
  if (!svc) return false;

  const { data, error } = await svc
    .from("platform_developers")
    .select("email,is_active")
    .eq("email", normalized)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_active !== false;
}

export async function requirePlatformDeveloper(token: string) {
  const supabase = createAuthClient();
  if (!supabase) {
    const err = new Error("Supabase environment variables are not configured.") as Error & { status?: number };
    err.status = 500;
    throw err;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    const err = new Error("Session expired. Please sign in again.") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const email = data.user?.email || null;
  const allowed = await isPlatformDeveloperEmail(email);
  if (!allowed) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  return data.user;
}