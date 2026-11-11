import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { archiveTenantSubmissions } from "@/lib/runGoogleDriveArchival";

function authorizeCron(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const querySecret = new URL(req.url).searchParams.get("secret")?.trim();
  return bearer === secret || querySecret === secret;
}

/** Daily maintenance: purge expired logs, AI memory, old snapshots. Call from Azure Logic App / cron. */
export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceRoleSupabase();
  if (!svc) {
    return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });
  }

  try {
    const { data: purgeRows, error: purgeErr } = await svc.rpc("iso_purge_expired_data", {
      p_tenant_id: null,
    });
    if (purgeErr) {
      return NextResponse.json({ error: purgeErr.message }, { status: 500 });
    }

    const { error: refreshErr } = await svc.rpc("iso_refresh_tenant_storage_usage", {
      p_tenant_id: null,
    });

    const { data: connectedTenants } = await svc.from("tenant_google_drive_archives")
      .select("tenant_id").order("connected_at", { ascending: true });
    const driveArchival: Array<{ tenantId: string; archived?: number; error?: string }> = [];
    for (const connected of connectedTenants || []) {
      const tenantId = connected.tenant_id as string;
      const { data: plan } = await svc.from("tenant_storage_plans").select("audit_archive_after_days").eq("tenant_id", tenantId).maybeSingle();
      try {
        const result = await archiveTenantSubmissions(svc, tenantId, Number(plan?.audit_archive_after_days || 365));
        driveArchival.push({ tenantId, archived: result.archived });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Google Drive archival failed";
        await svc.from("tenant_google_drive_archives").update({ last_error: message }).eq("tenant_id", tenantId);
        driveArchival.push({ tenantId, error: message });
      }
    }

    const summary = Array.isArray(purgeRows) && purgeRows[0] ? purgeRows[0] : purgeRows;

    return NextResponse.json({
      ok: true,
      purge: summary,
      storageRefreshError: refreshErr?.message || null,
      driveArchival,
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
