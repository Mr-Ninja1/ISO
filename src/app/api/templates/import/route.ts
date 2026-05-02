import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  libraryTemplateId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
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

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { tenantSlug, libraryTemplateId, categoryId } = parsed.data;
    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id, slug").eq("slug", tenantSlug).maybeSingle();

    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!hasPermission(membership.role, "forms.import")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    if (categoryId) {
      const { data: category } = await sb
        .from("categories")
        .select("id")
        .eq("id", categoryId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    const { data: libraryTemplate, error: le } = await sb
      .from("template_library")
      .select("id, title, schema")
      .eq("id", libraryTemplateId)
      .maybeSingle();

    if (le || !libraryTemplate) {
      return NextResponse.json({ error: "Library template not found" }, { status: 404 });
    }

    if (libraryTemplate.schema === null) {
      return NextResponse.json({ error: "Library template schema is missing" }, { status: 500 });
    }

    const { data: created, error: crErr } = await sb
      .from("form_templates")
      .insert({
        tenant_id: tenant.id,
        category_id: categoryId ?? null,
        title: libraryTemplate.title as string,
        is_standard: true,
        schema: libraryTemplate.schema,
      })
      .select("id")
      .single();

    if (crErr || !created) {
      return NextResponse.json({ error: crErr?.message || "Import failed" }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "template.import",
      entityType: "FormTemplate",
      entityId: created.id as string,
      details: {
        libraryTemplateId,
        title: libraryTemplate.title,
        categoryId: categoryId ?? null,
      },
    });

    return NextResponse.json({ templateId: created.id });
  } catch (error: unknown) {
    console.error("/api/templates/import POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
