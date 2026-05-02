import type { SupabaseClient } from "@supabase/supabase-js";

type ActivityEvent = {
  tenantId?: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

/** Must use a Supabase client scoped to the acting user (Bearer) so RLS allows the insert. */
export async function recordActivity(supabase: SupabaseClient, event: ActivityEvent) {
  try {
    await supabase.from("activity_logs").insert({
      tenant_id: event.tenantId ?? null,
      user_id: event.userId,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      details: event.details ?? null,
    });
  } catch {
    // Activity logging should not block core workflows.
  }
}
