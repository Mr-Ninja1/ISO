import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string; announcementId: string }> }
) {
  try {
    const { tenantSlug, announcementId } = await params;
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    // Verify the announcement belongs to the tenant
    const { data: tenant } = await svc.from("tenants").select("id").eq("slug", tenantSlug).single();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const { data: announcement } = await svc
      .from("tenant_announcements")
      .select("id, tenant_id")
      .eq("id", announcementId)
      .eq("tenant_id", tenant.id)
      .single();

    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    // Mark as read (upsert to handle duplicate calls)
    const { error: insertError } = await svc
      .from("tenant_announcement_reads")
      .upsert({
        announcement_id: announcementId,
        user_id: user.id,
        read_at: new Date().toISOString(),
      }, {
        onConflict: "announcement_id,user_id",
        ignoreDuplicates: false,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
