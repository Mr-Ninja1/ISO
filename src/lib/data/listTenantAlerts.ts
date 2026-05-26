import type { SupabaseClient } from "@supabase/supabase-js";
import {
  announcementAudienceMatches,
  type PlatformClientKind,
} from "@/lib/platformAudience";

export type TenantAlertRow = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  source: "tenant" | "global";
  delivery: string;
};

export async function listTenantAlertsForUser(
  sb: SupabaseClient,
  userId: string,
  tenantSlug: string,
  clientKind: PlatformClientKind
): Promise<{ alerts: TenantAlertRow[]; tenantId: string }> {
  const { data: tenant, error: tenantErr } = await sb
    .from("tenants")
    .select("id,is_active")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr) throw Object.assign(new Error(tenantErr.message), { status: 500 });
  if (!tenant) throw Object.assign(new Error("Tenant not found"), { status: 404 });

  const tenantId = String((tenant as { id: string }).id);
  if ((tenant as { is_active?: boolean }).is_active === false) {
    throw Object.assign(new Error("This brand has been deactivated"), {
      status: 403,
      code: "TENANT_DEACTIVATED",
    });
  }

  const [tenantAnnouncements, globalAnnouncements, tenantReads, globalReads] = await Promise.all([
    sb
      .from("tenant_announcements")
      .select("id,title,message,created_at,delivery")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("global_announcements")
      .select("id,title,message,created_at,delivery,audience")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("tenant_announcement_reads").select("announcement_id").eq("user_id", userId),
    sb.from("global_announcement_reads").select("announcement_id").eq("user_id", userId),
  ]);

  if (tenantAnnouncements.error) {
    throw Object.assign(new Error(tenantAnnouncements.error.message), { status: 500 });
  }
  if (globalAnnouncements.error) {
    throw Object.assign(new Error(globalAnnouncements.error.message), { status: 500 });
  }

  const tenantReadIds = new Set(
    (tenantReads.data || []).map((r) => String((r as { announcement_id: string }).announcement_id))
  );
  const globalReadIds = new Set(
    (globalReads.data || []).map((r) => String((r as { announcement_id: string }).announcement_id))
  );

  const alerts: TenantAlertRow[] = [];

  for (const row of tenantAnnouncements.data || []) {
    const r = row as {
      id: string;
      title: string;
      message: string;
      created_at: string;
      delivery?: string;
    };
    alerts.push({
      id: r.id,
      title: r.title,
      message: r.message,
      createdAt: r.created_at,
      isRead: tenantReadIds.has(r.id),
      source: "tenant",
      delivery: r.delivery || "modal",
    });
  }

  for (const row of globalAnnouncements.data || []) {
    const r = row as {
      id: string;
      title: string;
      message: string;
      created_at: string;
      delivery?: string;
      audience?: string;
    };
    if (!announcementAudienceMatches(r.audience, clientKind)) continue;
    alerts.push({
      id: r.id,
      title: r.title,
      message: r.message,
      createdAt: r.created_at,
      isRead: globalReadIds.has(r.id),
      source: "global",
      delivery: r.delivery || "modal",
    });
  }

  alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { alerts, tenantId };
}
