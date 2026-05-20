import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import type { User } from "@supabase/supabase-js";

async function resolveActiveTenantId(sb: ReturnType<typeof createSupabaseWithBearer>, tenantSlug: string) {
  const { data: tenant, error: tenantErr } = await sb
    .from("tenants")
    .select("id,is_active")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr) throw Object.assign(new Error(tenantErr.message), { status: 500 });
  if (!tenant) throw Object.assign(new Error("Tenant not found"), { status: 404 });
  if ((tenant as Record<string, unknown>).is_active === false) {
    throw Object.assign(new Error("This brand has been deactivated"), { status: 403, code: "TENANT_DEACTIVATED" });
  }

  return String((tenant as Record<string, unknown>).id || "");
}

export async function markAnnouncementRead(args: {
  accessToken: string;
  user: User;
  tenantSlug: string;
  announcementId: string;
  source: "tenant" | "global";
}) {
  const sb = createSupabaseWithBearer(args.accessToken);
  const readAt = new Date().toISOString();

  if (args.source === "global") {
    const { data: announcement } = await sb
      .from("global_announcements")
      .select("id")
      .eq("id", args.announcementId)
      .eq("is_active", true)
      .maybeSingle();

    if (!announcement) throw Object.assign(new Error("Announcement not found"), { status: 404 });

    const { error } = await sb.from("global_announcement_reads").upsert(
      { announcement_id: args.announcementId, user_id: args.user.id, read_at: readAt },
      { onConflict: "announcement_id,user_id", ignoreDuplicates: false }
    );

    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    return;
  }

  const tenantId = await resolveActiveTenantId(sb, args.tenantSlug);

  const { data: announcement } = await sb
    .from("tenant_announcements")
    .select("id")
    .eq("id", args.announcementId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!announcement) throw Object.assign(new Error("Announcement not found"), { status: 404 });

  const { error } = await sb.from("tenant_announcement_reads").upsert(
    { announcement_id: args.announcementId, user_id: args.user.id, read_at: readAt },
    { onConflict: "announcement_id,user_id", ignoreDuplicates: false }
  );

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
}
