import type { SupabaseClient } from "@supabase/supabase-js";

function monthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Clears form AI generation counters for the current calendar month (UTC). */
export async function resetTenantFormAiUsageThisMonth(
  sb: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const start = monthStartUtc().toISOString();
  const { data, error } = await sb
    .from("tenant_ai_usage_events")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("usage_kind", "form_ai_generate")
    .gte("created_at", start)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function resetAllBrandsFormAiUsageThisMonth(sb: SupabaseClient): Promise<number> {
  const start = monthStartUtc().toISOString();
  const { data, error } = await sb
    .from("tenant_ai_usage_events")
    .delete()
    .eq("usage_kind", "form_ai_generate")
    .gte("created_at", start)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Restarts ISO Grid AI trial clock for one brand. */
export async function resetTenantDcTrial(sb: SupabaseClient, tenantId: string) {
  const { error } = await sb
    .from("tenant_storage_plans")
    .update({ copilot_trial_started_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
}

export async function resetAllBrandsDcTrial(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb
    .from("tenant_storage_plans")
    .update({ copilot_trial_started_at: new Date().toISOString() })
    .eq("copilot_paid", false)
    .select("tenant_id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
