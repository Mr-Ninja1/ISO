import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { getTemplateSchemaMeta, getTemplateSchemaVersion } from "@/lib/templateVersioning";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const querySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
});

export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      tenantSlug: url.searchParams.get("tenantSlug"),
      templateId: url.searchParams.get("templateId"),
    });

    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, templateId } = parsed.data;
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

    const { data: template, error: tplErr } = await sb
      .from("form_templates")
      .select("id, title, category_id, schema")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (tplErr || !template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const { count: auditCount } = await sb
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("template_id", template.id)
      .eq("tenant_id", tenant.id);

    const hasAudits = (auditCount ?? 0) > 0;

    const meta = getTemplateSchemaMeta(template.schema);

    return NextResponse.json({
      template: {
        id: template.id,
        title: template.title,
        categoryId: template.category_id,
        schema: template.schema,
        lineageId: meta.lineageId || template.id,
        version: getTemplateSchemaVersion(template.schema),
      },
      lock: {
        hasAudits,
        auditCount: auditCount ?? 0,
      },
    });
  } catch (error: unknown) {
    console.error("/api/templates/edit-info GET error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
