import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

export async function GET(req: Request) {
  const svc = createServiceRoleSupabase();
  if (!svc)
    return NextResponse.json(
      { error: "Service role is not configured" },
      { status: 500 },
    );

  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") || "").trim();
  if (!token)
    return NextResponse.json({ error: "token is required" }, { status: 400 });

  const { data: link, error: linkErr } = await svc
    .from("shared_form_links")
    .select(
      "id, tenant_id, title, mode, is_live, live_scope, is_active, expires_at, created_at, tenants(name,slug,logo_url)",
    )
    .eq("token", token)
    .maybeSingle();

  if (linkErr || !link)
    return NextResponse.json(
      { error: "Shared link not found" },
      { status: 404 },
    );
  if (link.is_active === false)
    return NextResponse.json(
      { error: "This shared link has been disabled" },
      { status: 410 },
    );
  if (
    link.expires_at &&
    new Date(link.expires_at as string).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { error: "This shared link has expired" },
      { status: 410 },
    );
  }

  const tenant = Array.isArray(link.tenants) ? link.tenants[0] : link.tenants;

  let rowsSource: Array<Record<string, unknown>> = [];
  if (
    link.is_live === true &&
    (link.live_scope === "today" || link.live_scope === "all")
  ) {
    let query = svc
      .from("audit_logs")
      .select(
        "id, status, template_id, created_at, updated_at, submitted_at, form_templates(title)",
      )
      .eq("tenant_id", link.tenant_id)
      .eq("status", "SUBMITTED")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (link.live_scope === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      query = query.gte("updated_at", start.toISOString());
    }

    const { data: liveRows, error: liveErr } = await query;
    if (liveErr)
      return NextResponse.json({ error: liveErr.message }, { status: 500 });
    rowsSource = (liveRows || []) as Array<Record<string, unknown>>;
  } else {
    const { data: items, error: itemsErr } = await svc
      .from("shared_form_link_items")
      .select(
        "sort_order, audit_id, audit_logs(id, status, template_id, created_at, updated_at, submitted_at, form_templates(title))",
      )
      .eq("link_id", link.id)
      .order("sort_order", { ascending: true });

    if (itemsErr)
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    rowsSource = (items || []).flatMap((item) => {
      const row = Array.isArray(item.audit_logs)
        ? item.audit_logs[0]
        : item.audit_logs;
      return row ? [row as Record<string, unknown>] : [];
    });
  }

  const rows = rowsSource.flatMap((row) => {
    const tpl = Array.isArray(row.form_templates)
      ? row.form_templates[0]
      : row.form_templates;
    return [
      {
        id: row.id as string,
        status: row.status as string,
        templateId: row.template_id as string,
        createdAt: new Date(row.created_at as string).toISOString(),
        updatedAt: new Date(row.updated_at as string).toISOString(),
        submittedAt: row.submitted_at
          ? new Date(row.submitted_at as string).toISOString()
          : null,
        template: { title: tpl?.title ?? "Form" },
      },
    ];
  });

  return NextResponse.json({
    share: {
      title: link.title,
      mode: link.mode,
      createdAt: link.created_at,
      expiresAt: link.expires_at,
      tenant: {
        name: typeof tenant?.name === "string" ? tenant.name : "Brand",
        slug: typeof tenant?.slug === "string" ? tenant.slug : "",
        logoUrl: typeof tenant?.logo_url === "string" ? tenant.logo_url : null,
      },
      rows,
    },
  });
}
