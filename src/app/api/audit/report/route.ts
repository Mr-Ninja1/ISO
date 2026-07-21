import { NextResponse } from "next/server";
import {
  createAuthenticatedRouteClient,
  getBearerToken,
  getRouteUser,
  resolveSupabasePublicEnv,
} from "@/lib/supabase/routeAuth";
import { hasPermission } from "@/lib/roleGate";
import { tenantDeactivationReasonFromRow } from "@/lib/tenantDeactivation";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const env = resolveSupabasePublicEnv();
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const { user } = await getRouteUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    const auditId = (url.searchParams.get("auditId") || "").trim();

    if (!tenantSlug || !auditId) {
      return NextResponse.json({ error: "tenantSlug and auditId are required" }, { status: 400 });
    }

    const sb = createAuthenticatedRouteClient(token);
    if (!sb) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const { data: tenant, error: te } = await sb
      .from("tenants")
      .select("id, name, slug, logo_url, is_active, deactivation_reason")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (te) {
      console.error("/api/audit/report tenant lookup", te);
      return NextResponse.json({ error: te.message || "Failed to load brand" }, { status: 500 });
    }
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    if ((tenant as Record<string, unknown>).is_active === false) {
      return NextResponse.json(
        {
          error: "This brand has been deactivated",
          code: "TENANT_DEACTIVATED",
          deactivationReason: tenantDeactivationReasonFromRow(tenant as Record<string, unknown>),
        },
        { status: 403 }
      );
    }

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me) {
      console.error("/api/audit/report membership lookup", me);
      return NextResponse.json({ error: me.message || "Failed to verify access" }, { status: 500 });
    }
    if (!membership || !hasPermission(membership.role, "audit.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: row, error: rowErr } = await sb
      .from("audit_logs")
      .select("id, status, created_at, payload, template_id, form_templates(title, schema)")
      .eq("id", auditId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (rowErr) {
      console.error("/api/audit/report audit lookup", rowErr);
      return NextResponse.json({ error: rowErr.message || "Failed to load audit" }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const mapped = row as Record<string, unknown>;
    const templateId = String(mapped.template_id || "");
    const templateRaw = mapped.form_templates as
      | { title?: string; schema?: unknown }
      | { title?: string; schema?: unknown }[]
      | null;
    const templateRow = Array.isArray(templateRaw) ? templateRaw[0] : templateRaw;

    const templateTitle =
      typeof templateRow?.title === "string" && templateRow.title.trim() ? templateRow.title : "Form";
    const templateSchema = templateRow?.schema ?? null;

    return NextResponse.json({
      audit: {
        id: mapped.id as string,
        status: mapped.status as string,
        createdAt: mapped.created_at as string,
        payload: mapped.payload,
        templateId,
        tenant: {
          name: tenant.name as string,
          slug: tenant.slug as string,
          logoUrl: (tenant.logo_url as string | null) ?? null,
        },
        template: {
          title: templateTitle,
          schema: templateSchema,
        },
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    console.error("/api/audit/report GET error", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
