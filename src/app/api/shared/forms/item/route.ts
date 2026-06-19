import { NextResponse } from "next/server";
import type { AuditReportData } from "@/types/auditReport";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

export async function GET(req: Request) {
  const svc = createServiceRoleSupabase();
  if (!svc) {
    return NextResponse.json(
      { error: "Service role is not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") || "").trim();
  const auditId = (searchParams.get("auditId") || "").trim();

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  if (!auditId) {
    return NextResponse.json({ error: "auditId is required" }, { status: 400 });
  }

  const { data: link, error: linkErr } = await svc
    .from("shared_form_links")
    .select(
      "id, tenant_id, title, mode, is_live, live_scope, is_active, expires_at, created_at, tenants(name,slug,logo_url)",
    )
    .eq("token", token)
    .maybeSingle();

  if (linkErr || !link) {
    return NextResponse.json({ error: "Shared link not found" }, { status: 404 });
  }
  if (link.is_active === false) {
    return NextResponse.json(
      { error: "This shared link has been disabled" },
      { status: 410 },
    );
  }
  if (
    link.expires_at &&
    new Date(link.expires_at as string).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { error: "This shared link has expired" },
      { status: 410 },
    );
  }

  if (link.is_live !== true) {
    const { data: item, error: itemErr } = await svc
      .from("shared_form_link_items")
      .select("audit_id")
      .eq("link_id", link.id)
      .eq("audit_id", auditId)
      .maybeSingle();

    if (itemErr || !item) {
      return NextResponse.json(
        { error: "This form is not available in the shared link" },
        { status: 404 },
      );
    }
  } else {
    let liveQuery = svc
      .from("audit_logs")
      .select("id")
      .eq("tenant_id", link.tenant_id)
      .eq("status", "SUBMITTED")
      .eq("id", auditId);

    if (link.live_scope === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      liveQuery = liveQuery.gte("updated_at", start.toISOString());
    }

    const { data: liveAudit, error: liveAuditErr } = await liveQuery.maybeSingle();
    if (liveAuditErr || !liveAudit) {
      return NextResponse.json(
        { error: "This form is not available in the shared link" },
        { status: 404 },
      );
    }
  }

  const { data: auditRow, error: auditErr } = await svc
    .from("audit_logs")
    .select(
      "id, status, created_at, updated_at, submitted_at, payload, template_id, tenants(name,slug,logo_url), form_templates(title,schema)",
    )
    .eq("tenant_id", link.tenant_id)
    .eq("id", auditId)
    .eq("status", "SUBMITTED")
    .maybeSingle();

  if (auditErr || !auditRow) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const tenant = Array.isArray(auditRow.tenants)
    ? auditRow.tenants[0]
    : auditRow.tenants;
  const template = Array.isArray(auditRow.form_templates)
    ? auditRow.form_templates[0]
    : auditRow.form_templates;

  const audit: AuditReportData = {
    id: auditRow.id as string,
    status: auditRow.status as string,
    createdAt: new Date(
      ((auditRow.submitted_at || auditRow.updated_at || auditRow.created_at) as string),
    ).toISOString(),
    payload:
      auditRow.payload &&
      typeof auditRow.payload === "object" &&
      !Array.isArray(auditRow.payload)
        ? (auditRow.payload as Record<string, unknown>)
        : {},
    tenant: {
      name: typeof tenant?.name === "string" ? tenant.name : "Brand",
      slug: typeof tenant?.slug === "string" ? tenant.slug : "",
      logoUrl: typeof tenant?.logo_url === "string" ? tenant.logo_url : null,
    },
    template: {
      title: typeof template?.title === "string" ? template.title : "Form",
      schema:
        template?.schema && typeof template.schema === "object"
          ? (template.schema as AuditReportData["template"]["schema"])
          : null,
    },
    templateId: auditRow.template_id as string,
  };

  return NextResponse.json({ audit });
}
