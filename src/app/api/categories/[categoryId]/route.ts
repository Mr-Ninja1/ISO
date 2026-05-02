import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { categoryId } = await params;
    if (!categoryId) {
      return NextResponse.json({ error: "Missing category id" }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);

    const { data: category, error: ce } = await sb
      .from("categories")
      .select("id, tenant_id")
      .eq("id", categoryId)
      .maybeSingle();

    if (ce || !category) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", category.tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!hasPermission(membership.role, "categories.manage")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const { error: delErr } = await sb.from("categories").delete().eq("id", categoryId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: category.tenant_id as string,
      userId: user.id,
      action: "category.delete",
      entityType: "Category",
      entityId: categoryId,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
