import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import {
  getTemplateSchemaMeta,
  getTemplateSchemaVersion,
  normalizeTemplateSchema,
  withTemplateSchemaMeta,
} from "@/lib/templateVersioning";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
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
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, templateId, title, categoryId, schema } = parsed.data;
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
    if (!hasPermission(membership.role, "forms.edit")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    if (categoryId) {
      const { data: category } = await sb
        .from("categories")
        .select("id")
        .eq("id", categoryId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const { data: current, error: curErr } = await sb
      .from("form_templates")
      .select("id, title, category_id, schema")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (curErr || !current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    let normalized: Record<string, unknown>;
    try {
      normalized = normalizeTemplateSchema(schema, title) as Record<string, unknown>;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid schema";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { count: auditCount } = await sb
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("template_id", current.id)
      .eq("tenant_id", tenant.id);

    const hasAudits = (auditCount ?? 0) > 0;

    const currentMeta = getTemplateSchemaMeta(current.schema);
    const lineageId = currentMeta.lineageId || (current.id as string);
    const currentVersion = getTemplateSchemaVersion(current.schema);

    if (!hasAudits) {
      const schemaForUpdate = withTemplateSchemaMeta(
        normalized,
        {
          lineageId,
          templateVersion: currentVersion,
          isLive: true,
          previousTemplateId: currentMeta.previousTemplateId,
        },
        title
      );

      const { error: upErr } = await sb
        .from("form_templates")
        .update({
          title,
          category_id: categoryId ?? null,
          schema: schemaForUpdate,
        })
        .eq("id", current.id as string);

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      await recordActivity(sb, {
        tenantId: tenant.id,
        userId: user.id,
        action: "template.update.overwrite",
        entityType: "FormTemplate",
        entityId: current.id as string,
        details: { title, categoryId: categoryId ?? null, version: currentVersion },
      });

      return NextResponse.json({
        mode: "overwrite",
        templateId: current.id,
        version: currentVersion,
      });
    }

    const nextVersion = currentVersion + 1;

    const oldSchemaInactive = withTemplateSchemaMeta(
      current.schema,
      {
        lineageId,
        templateVersion: currentVersion,
        isLive: false,
        previousTemplateId: currentMeta.previousTemplateId,
      },
      current.title as string
    );

    const { error: oldErr } = await sb.from("form_templates").update({ schema: oldSchemaInactive }).eq("id", current.id as string);

    if (oldErr) return NextResponse.json({ error: oldErr.message }, { status: 500 });

    const nextSchema = withTemplateSchemaMeta(
      normalized,
      {
        lineageId,
        templateVersion: nextVersion,
        isLive: true,
        previousTemplateId: current.id as string,
      },
      title
    );

    const { data: created, error: crErr } = await sb
      .from("form_templates")
      .insert({
        tenant_id: tenant.id,
        title,
        category_id: categoryId ?? null,
        is_standard: false,
        schema: nextSchema,
      })
      .select("id")
      .single();

    if (crErr || !created) {
      return NextResponse.json({ error: crErr?.message || "Version create failed" }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "template.update.versioned",
      entityType: "FormTemplate",
      entityId: created.id as string,
      details: {
        previousTemplateId: current.id,
        title,
        categoryId: categoryId ?? null,
        version: nextVersion,
      },
    });

    return NextResponse.json({
      mode: "versioned",
      templateId: created.id,
      previousTemplateId: current.id,
      version: nextVersion,
    });
  } catch (error: unknown) {
    console.error("/api/templates/save-changes POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
