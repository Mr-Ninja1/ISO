import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { normalizeTemplateSchema, withTemplateSchemaMeta } from "@/lib/templateVersioning";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  title: z.string().min(1),
  categoryId: z.string().uuid().nullable().optional(),
  schema: z.any(),
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
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { tenantSlug, title, categoryId, schema } = parsed.data;
    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();

    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!hasPermission(membership.role, "forms.create")) {
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

    let normalized: Record<string, unknown>;
    try {
      normalized = normalizeTemplateSchema(schema, title) as Record<string, unknown>;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid schema";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { data: first, error: insErr } = await sb
      .from("form_templates")
      .insert({
        tenant_id: tenant.id,
        category_id: categoryId ?? null,
        title,
        is_standard: false,
        schema: normalized,
      })
      .select("id, schema")
      .single();

    if (insErr || !first) {
      return NextResponse.json({ error: insErr?.message || "Create failed" }, { status: 500 });
    }

    const schemaWithMeta = withTemplateSchemaMeta(
      first.schema,
      {
        lineageId: first.id as string,
        templateVersion: 1,
        isLive: true,
      },
      title
    );

    const { error: upErr } = await sb.from("form_templates").update({ schema: schemaWithMeta }).eq("id", first.id as string);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "template.create",
      entityType: "FormTemplate",
      entityId: first.id as string,
      details: { title, categoryId: categoryId ?? null },
    });

    return NextResponse.json({ templateId: first.id });
  } catch (error: unknown) {
    console.error("/api/templates/create POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
