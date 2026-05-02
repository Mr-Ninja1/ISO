import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[,"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
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

  const sb = createSupabaseWithBearer(token);

  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get("tenantSlug") || "";
  const statusRaw = (searchParams.get("status") || "").toUpperCase();
  const q = (searchParams.get("q") || "").trim();

  if (!tenantSlug) {
    return NextResponse.json({ error: "Missing tenantSlug" }, { status: 400 });
  }

  const normalizedStatus = statusRaw === "DRAFT" || statusRaw === "SUBMITTED" ? statusRaw : undefined;

  const { data: tenant, error: te } = await sb.from("tenants").select("id, slug").eq("slug", tenantSlug).maybeSingle();

  if (te || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership || !hasPermission(membership.role, "audit.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let listQuery = sb
    .from("audit_logs")
    .select("id, status, template_id, created_at, updated_at, submitted_at, payload, form_templates(title)")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false })
    .limit(5000);

  if (normalizedStatus) {
    listQuery = listQuery.eq("status", normalizedStatus);
  }

  const { data: rawRows, error: listErr } = await listQuery;

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const qLower = q.toLowerCase();
  const rows = (rawRows || []).filter((row: Record<string, unknown>) => {
    if (!qLower) return true;
    const tpl = row.form_templates as { title?: string } | null | undefined;
    return (tpl?.title || "").toLowerCase().includes(qLower);
  });

  const header = [
    "auditId",
    "status",
    "templateId",
    "templateTitle",
    "createdAt",
    "updatedAt",
    "submittedAt",
    "submittedByName",
    "submittedByEmail",
    "payloadJson",
  ];

  const csvRows = rows.map((row: Record<string, unknown>) => {
    const tpl = row.form_templates as { title?: string } | null | undefined;
    const payloadRecord =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const auditMeta =
      payloadRecord.__auditMeta && typeof payloadRecord.__auditMeta === "object" && !Array.isArray(payloadRecord.__auditMeta)
        ? (payloadRecord.__auditMeta as Record<string, unknown>)
        : {};

    return [
      row.id,
      row.status,
      row.template_id,
      tpl?.title ?? "",
      new Date(row.created_at as string).toISOString(),
      new Date(row.updated_at as string).toISOString(),
      row.submitted_at ? new Date(row.submitted_at as string).toISOString() : "",
      typeof auditMeta.submittedByName === "string" ? auditMeta.submittedByName : "",
      typeof auditMeta.submittedByEmail === "string" ? auditMeta.submittedByEmail : "",
      JSON.stringify(payloadRecord),
    ];
  });

  const body = [header, ...csvRows].map((line) => line.map(escapeCsv).join(",")).join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=\"forms-export-${tenant.slug}.csv\"`,
      "cache-control": "no-store",
    },
  });
}
