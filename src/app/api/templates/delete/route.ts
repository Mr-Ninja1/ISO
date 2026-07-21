import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { getTemplateSchemaMeta } from "@/lib/templateVersioning";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";
import { scheduleBrandSyncChange } from "@/lib/brandSync";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
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
    if (!hasPermission(membership.role, "forms.delete")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const { data: current, error: ce } = await sb
      .from("form_templates")
      .select("id, schema")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (ce || !current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const currentMeta = getTemplateSchemaMeta(current.schema);
    const lineageId = currentMeta.lineageId || (current.id as string);

    const { data: allTenantTemplates } = await sb.from("form_templates").select("id, schema").eq("tenant_id", tenant.id);

    const lineageTemplateIds = (allTenantTemplates || [])
      .filter((t) => {
        const meta = getTemplateSchemaMeta(t.schema);
        return (meta.lineageId || t.id) === lineageId;
      })
      .map((t) => t.id as string);

    let auditTotal = 0;
    for (const tid of lineageTemplateIds) {
      const { count } = await sb
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("template_id", tid);
      auditTotal += count ?? 0;
    }

    if (auditTotal > 0) {
      return NextResponse.json(
        { error: "Cannot delete this form because it has submissions. Archive/hide fields instead." },
        { status: 409 }
      );
    }

    for (const id of lineageTemplateIds) {
      scheduleBrandSyncChange({
        sourceTenantId: tenant.id as string,
        entityType: "form_template",
        entityId: id,
        changeType: "delete",
      });
    }

    for (const id of lineageTemplateIds) {
      await sb.from("form_templates").delete().eq("id", id);
    }

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "template.delete",
      entityType: "FormTemplateLineage",
      entityId: lineageId,
      details: { deletedTemplateIds: lineageTemplateIds },
    });

    return NextResponse.json({ deleted: lineageTemplateIds.length });
  } catch (error: unknown) {
    console.error("/api/templates/delete POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
