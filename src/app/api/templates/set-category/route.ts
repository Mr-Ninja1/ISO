import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";
import { getBearerToken } from "@/lib/supabase/routeAuth";
import { createClient } from "@supabase/supabase-js";

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
});

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { tenantSlug, templateId, categoryId } = parsed.data;
    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership || !hasPermission(membership.role, "categories.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (categoryId) {
      const { data: cat, error: ce } = await sb
        .from("categories")
        .select("id")
        .eq("id", categoryId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();
      if (ce || !cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const { data: template, error: tplErr } = await sb
      .from("form_templates")
      .select("id, title, category_id")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (tplErr || !template) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    const { error: upErr } = await sb
      .from("form_templates")
      .update({ category_id: categoryId, updated_at: new Date().toISOString() })
      .eq("id", templateId);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "template.move_category",
      entityType: "FormTemplate",
      entityId: templateId,
      details: { categoryId, title: template.title },
    });

    return NextResponse.json({ success: true, templateId, categoryId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
