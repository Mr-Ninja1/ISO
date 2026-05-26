import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushNotificationCategory, PushPlatform } from "@/lib/push/types";

export type StoredPushToken = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  platform: PushPlatform;
  token: string;
};

export async function upsertDevicePushToken(
  svc: SupabaseClient,
  input: {
    userId: string;
    tenantId: string | null;
    platform: PushPlatform;
    token: string;
    deviceId?: string | null;
    categories?: PushNotificationCategory[];
  }
) {
  const row = {
    user_id: input.userId,
    tenant_id: input.tenantId,
    platform: input.platform,
    token: input.token,
    device_id: input.deviceId?.trim() || null,
    categories: input.categories?.length ? input.categories : ["announcement", "reminder", "system"],
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await svc.from("device_push_tokens").upsert(row, { onConflict: "user_id,token" });
  if (error) throw new Error(error.message);
}

export async function deletePushTokens(svc: SupabaseClient, tokens: string[]) {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return;
  await svc.from("device_push_tokens").delete().in("token", unique);
}

export async function listPushTokensForUsers(
  svc: SupabaseClient,
  userIds: string[],
  options?: { platforms?: PushPlatform[]; tenantId?: string | null }
): Promise<StoredPushToken[]> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return [];

  let query = svc
    .from("device_push_tokens")
    .select("id,user_id,tenant_id,platform,token")
    .in("user_id", ids);

  if (options?.platforms?.length) {
    query = query.in("platform", options.platforms);
  }
  if (options?.tenantId) {
    query = query.or(`tenant_id.is.null,tenant_id.eq.${options.tenantId}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as StoredPushToken[];
}

/** Distinct user IDs with membership on an active tenant. */
export async function listActiveTenantMemberUserIds(
  svc: SupabaseClient,
  tenantId?: string | null
): Promise<string[]> {
  const { data: activeTenants, error: tenantErr } = await svc
    .from("tenants")
    .select("id")
    .eq("is_active", true);

  if (tenantErr) throw new Error(tenantErr.message);

  const activeIds = new Set((activeTenants || []).map((t) => String((t as { id: string }).id)));
  if (tenantId && !activeIds.has(tenantId)) return [];

  let memberQuery = svc.from("tenant_members").select("user_id, tenant_id");
  if (tenantId) memberQuery = memberQuery.eq("tenant_id", tenantId);

  const { data: members, error: memberErr } = await memberQuery;
  if (memberErr) throw new Error(memberErr.message);

  const ids = new Set<string>();
  for (const row of members || []) {
    const r = row as { user_id?: string; tenant_id?: string };
    if (!r.user_id || !r.tenant_id || !activeIds.has(r.tenant_id)) continue;
    ids.add(r.user_id);
  }
  return [...ids];
}
