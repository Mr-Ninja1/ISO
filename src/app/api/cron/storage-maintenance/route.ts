import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

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

    const summary = Array.isArray(purgeRows) && purgeRows[0] ? purgeRows[0] : purgeRows;

    return NextResponse.json({
      ok: true,
      purge: summary,
      storageRefreshError: refreshErr?.message || null,
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
