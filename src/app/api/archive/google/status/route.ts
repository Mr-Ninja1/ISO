import { NextResponse } from "next/server";
import { getBearerToken, getRouteUser } from "@/lib/supabase/routeAuth";
import { hasPermission } from "@/lib/roleGate";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { archiveTenantSubmissions } from "@/lib/runGoogleDriveArchival";

async function context(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { user, supabase } = await getRouteUser(token);
  if (!user || !supabase) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const slug = new URL(req.url).searchParams.get("tenantSlug")?.trim();
  if (!slug) return { response: NextResponse.json({ error: "tenantSlug is required" }, { status: 400 }) };
  const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (!tenant) return { response: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
  const { data: member } = await supabase.from("tenant_members").select("role").eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
  if (!member) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const svc = createServiceRoleSupabase();
  if (!svc) return { response: NextResponse.json({ error: "Server storage is not configured" }, { status: 500 }) };
  return { user, tenantId: tenant.id as string, role: member.role, userClient: supabase, svc };
}

export async function GET(req: Request) {
  const ctx = await context(req);
  if ("response" in ctx) return ctx.response;
  const [{ data: integration }, { data: plan }, { count }] = await Promise.all([
    ctx.svc.from("tenant_google_drive_archives").select("google_email,connected_at,last_archived_at,last_error").eq("tenant_id", ctx.tenantId).maybeSingle(),
    ctx.userClient.from("tenant_storage_plans").select("audit_archive_after_days").eq("tenant_id", ctx.tenantId).maybeSingle(),
    ctx.svc.from("audit_archives").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId),
  ]);
  return NextResponse.json({ connected: Boolean(integration), canManage: hasPermission(ctx.role, "brand.manage"), email: integration?.google_email || null, connectedAt: integration?.connected_at || null, lastArchivedAt: integration?.last_archived_at || null, lastError: integration?.last_error || null, archiveAfterDays: Number(plan?.audit_archive_after_days || 365), archivedCount: count || 0 });
}

export async function PATCH(req: Request) {
  const ctx = await context(req);
  if ("response" in ctx) return ctx.response;
  if (!hasPermission(ctx.role, "brand.manage")) return NextResponse.json({ error: "Brand admin permission required" }, { status: 403 });
  const body = await req.json().catch(() => null) as { archiveAfterDays?: unknown } | null;
  const days = Number(body?.archiveAfterDays);
  if (!Number.isInteger(days) || days < 30 || days > 3650) return NextResponse.json({ error: "Archive age must be between 30 and 3650 days" }, { status: 400 });
  const { error } = await ctx.userClient.from("tenant_storage_plans").update({ audit_archive_after_days: days }).eq("tenant_id", ctx.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, archiveAfterDays: days });
}

export async function POST(req: Request) {
  const ctx = await context(req);
  if ("response" in ctx) return ctx.response;
  if (!hasPermission(ctx.role, "brand.manage")) return NextResponse.json({ error: "Brand admin permission required" }, { status: 403 });
  const { data: plan } = await ctx.svc.from("tenant_storage_plans").select("audit_archive_after_days").eq("tenant_id", ctx.tenantId).maybeSingle();
  try {
    const result = await archiveTenantSubmissions(ctx.svc, ctx.tenantId, Number(plan?.audit_archive_after_days || 365));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive archival failed";
    await ctx.svc.from("tenant_google_drive_archives").update({ last_error: message }).eq("tenant_id", ctx.tenantId);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const ctx = await context(req);
  if ("response" in ctx) return ctx.response;
  if (!hasPermission(ctx.role, "brand.manage")) return NextResponse.json({ error: "Brand admin permission required" }, { status: 403 });
  const { error } = await ctx.svc.from("tenant_google_drive_archives").delete().eq("tenant_id", ctx.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
