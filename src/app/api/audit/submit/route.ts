import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { collectTemperatureAlerts } from "@/lib/temperatureMonitoring";
import { recordActivity } from "@/lib/activityTracker";
import { persistPhotoEvidenceToBucket } from "@/lib/photoEvidenceStorage";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
  payload: z.record(z.string(), z.any()),
  mode: z.enum(["submit", "draft"]).optional(),
  auditId: z.string().uuid().optional(),
});

function draftUserIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const meta = (payload as Record<string, unknown>).__draftMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const userId = (meta as Record<string, unknown>).userId;
  return typeof userId === "string" && userId ? userId : null;
}

async function clearOtherUserDrafts(
  sb: ReturnType<typeof createSupabaseWithBearer>,
  params: { tenantId: string; templateId: string; userId: string; keepAuditId: string }
) {
  const { data: rows } = await sb
    .from("audit_logs")
    .select("id,payload")
    .eq("tenant_id", params.tenantId)
    .eq("template_id", params.templateId)
    .eq("status", "DRAFT")
    .neq("id", params.keepAuditId);

  for (const row of rows || []) {
    if (draftUserIdFromPayload(row.payload) === params.userId) {
      await sb.from("audit_logs").delete().eq("id", row.id as string);
    }
  }
}

export async function POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  let user: { id: string; email?: string | null; user_metadata?: unknown } | null = null;
  try {
    const {
      data: { user: authUser },
    } = await supabaseAuth.auth.getUser(token);
    user = authUser;
  } catch {
    return NextResponse.json(
      {
        error: "Authentication service is temporarily unavailable. You can continue offline and sync later.",
        code: "AUTH_SERVICE_UNAVAILABLE",
      },
      { status: 503 }
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { tenantSlug, templateId, payload, mode, auditId } = parsed.data;
  const isDraft = mode === "draft";
  const sb = createSupabaseWithBearer(token);

  try {
    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();

    if (te || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!hasPermission(membership.role, "audit.submit")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const { data: template, error: tplErr } = await sb
      .from("form_templates")
      .select("id, schema")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (tplErr || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let payloadRecord = payload as Record<string, unknown>;
    const existingTempMeta =
      payloadRecord.__temperatureMeta && typeof payloadRecord.__temperatureMeta === "object"
        ? (payloadRecord.__temperatureMeta as Record<string, unknown>)
        : {};
    const temperatureAlerts = !isDraft ? collectTemperatureAlerts((template as { schema?: unknown }).schema as any, payloadRecord) : [];
    const temperatureMeta = {
      ...existingTempMeta,
      alerts: temperatureAlerts,
      capturedAt: new Date().toISOString(),
    };

    const { data: staffProfile } = await sb
      .from("tenant_staff_pins")
      .select("full_name, email")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const actorName =
      (staffProfile as { full_name?: string } | null)?.full_name ||
      (user.user_metadata as any)?.full_name ||
      user.email ||
      "Staff";
    const actorEmail = (staffProfile as { email?: string } | null)?.email || user.email || "";

    if (isDraft) {
      let targetDraftId: string | null = null;

      if (auditId) {
        const { data: existing } = await sb
          .from("audit_logs")
          .select("id")
          .eq("id", auditId)
          .eq("tenant_id", tenant.id)
          .eq("template_id", template.id)
          .eq("status", "DRAFT")
          .maybeSingle();
        if (existing) targetDraftId = existing.id as string;
      }

      if (!targetDraftId) {
        const { data: candidates } = await sb
          .from("audit_logs")
          .select("id, payload")
          .eq("tenant_id", tenant.id)
          .eq("template_id", template.id)
          .eq("status", "DRAFT")
          .order("updated_at", { ascending: false })
          .limit(50);

        const mine = (candidates || []).find((d) => draftUserIdFromPayload(d.payload) === user.id);
        if (mine?.id) targetDraftId = mine.id as string;
      }

      const draftEvidenceAuditId = targetDraftId || auditId || `pending_${template.id}_${Date.now()}`;
      payloadRecord = await persistPhotoEvidenceToBucket(payloadRecord, tenantSlug, draftEvidenceAuditId);

      const draftPayload = {
        ...payloadRecord,
        __temperatureMeta: temperatureMeta,
        __draftMeta: {
          userId: user.id,
          userName: actorName,
          userEmail: actorEmail,
        },
        __auditMeta: {
          submittedByUserId: user.id,
          submittedByName: actorName,
          submittedByEmail: actorEmail,
        },
      };

      let auditRow: { id: string };
      if (targetDraftId) {
        const { data: updated, error: upErr } = await sb
          .from("audit_logs")
          .update({
            payload: draftPayload,
            status: "DRAFT",
            submitted_at: null,
          })
          .eq("id", targetDraftId)
          .select("id")
          .single();
        if (upErr || !updated) {
          return NextResponse.json({ error: upErr?.message || "Draft update failed" }, { status: 500 });
        }
        auditRow = updated as { id: string };
      } else {
        const { data: created, error: crErr } = await sb
          .from("audit_logs")
          .insert({
            tenant_id: tenant.id,
            template_id: template.id,
            status: "DRAFT",
            payload: draftPayload,
            submitted_at: null,
          })
          .select("id")
          .single();
        if (crErr || !created) {
          return NextResponse.json({ error: crErr?.message || "Draft create failed" }, { status: 500 });
        }
        auditRow = created as { id: string };
      }

      await recordActivity(sb, {
        tenantId: tenant.id,
        userId: user.id,
        action: "audit.saveDraft",
        entityType: "AuditLog",
        entityId: auditRow.id,
        details: { templateId: template.id, hasTemperatureAlerts: temperatureAlerts.length > 0 },
      });

      return NextResponse.json({ auditId: auditRow.id, status: "DRAFT" });
    }

    const targetAuditId = auditId || `pending_${template.id}_${Date.now()}`;
    payloadRecord = await persistPhotoEvidenceToBucket(payloadRecord, tenantSlug, targetAuditId);

    const submitPayload = {
      ...payload,
      __temperatureMeta: temperatureMeta,
      __auditMeta: {
        submittedByUserId: user.id,
        submittedByName: actorName,
        submittedByEmail: actorEmail,
      },
    };

    if (auditId) {
      const { data: existing } = await sb
        .from("audit_logs")
        .select("id")
        .eq("id", auditId)
        .eq("tenant_id", tenant.id)
        .eq("template_id", template.id)
        .maybeSingle();

      if (existing) {
        const { data: audit, error: upErr } = await sb
          .from("audit_logs")
          .update({
            payload: submitPayload,
            status: "SUBMITTED",
            submitted_at: new Date().toISOString(),
          })
          .eq("id", existing.id as string)
          .select("id")
          .single();

        if (upErr || !audit) {
          return NextResponse.json({ error: upErr?.message || "Submit failed" }, { status: 500 });
        }

        await recordActivity(sb, {
          tenantId: tenant.id,
          userId: user.id,
          action: "audit.submit",
          entityType: "AuditLog",
          entityId: audit.id as string,
          details: { templateId: template.id, mode: "update", hasTemperatureAlerts: temperatureAlerts.length > 0 },
        });

        await clearOtherUserDrafts(sb, {
          tenantId: tenant.id as string,
          templateId: template.id as string,
          userId: user.id,
          keepAuditId: audit.id as string,
        });

        return NextResponse.json({ auditId: audit.id, status: "SUBMITTED" });
      }
    }

    const { data: audit, error: crErr } = await sb
      .from("audit_logs")
      .insert({
        tenant_id: tenant.id,
        template_id: template.id,
        status: "SUBMITTED",
        payload: submitPayload,
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (crErr || !audit) {
      return NextResponse.json({ error: crErr?.message || "Submit failed" }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "audit.submit",
      entityType: "AuditLog",
      entityId: audit.id as string,
      details: { templateId: template.id, mode: "create", hasTemperatureAlerts: temperatureAlerts.length > 0 },
    });

    await clearOtherUserDrafts(sb, {
      tenantId: tenant.id as string,
      templateId: template.id as string,
      userId: user.id,
      keepAuditId: audit.id as string,
    });

    return NextResponse.json({ auditId: audit.id, status: "SUBMITTED" });
  } catch {
    return NextResponse.json({ error: "Failed to process audit submission" }, { status: 500 });
  }
}
