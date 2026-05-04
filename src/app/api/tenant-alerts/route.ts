import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const {
      data: { user },
    } = await authClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

    const sb = createSupabaseWithBearer(token);
    const { data: tenant, error: tenantErr } = await sb
      .from("tenants")
      .select("id,is_active")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if ((tenant as Record<string, unknown>).is_active === false) {
      return NextResponse.json({ error: "This brand has been deactivated" }, { status: 403 });
    }

    const tenantId = String((tenant as Record<string, unknown>).id || "");
    const { data: alerts, error } = await sb
      .from("tenant_announcements")
      .select("id,title,message,created_at")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch read state for the current user
    const alertIds = (alerts || []).map((row) => String((row as Record<string, unknown>).id || ""));
    const { data: readRecords } = await sb
      .from("tenant_announcement_reads")
      .select("announcement_id")
      .eq("user_id", user.id)
      .in("announcement_id", alertIds.length > 0 ? alertIds : ["00000000-0000-0000-0000-000000000000"]);

    const readIds = new Set((readRecords || []).map((r) => String((r as Record<string, unknown>).announcement_id || "")));

    return NextResponse.json({
      alerts: (alerts || []).map((row) => {
        const mapped = row as Record<string, unknown>;
        const id = String(mapped.id || "");
        return {
          id,
          title: String(mapped.title || ""),
          message: String(mapped.message || ""),
          createdAt: String(mapped.created_at || ""),
          isRead: readIds.has(id),
        };
      }),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}