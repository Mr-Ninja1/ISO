import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import { ensureTenantPlan, normalizePlanPatch, getCopilotAccessStatus } from "@/lib/tenantPlan";
import { resetTenantFormAiUsageThisMonth } from "@/lib/admin/aiReset";
import { PLAN_PRESETS, type PlanCode } from "@/lib/tenantPlanDefaults";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const plan = await ensureTenantPlan(svc, tenantId);
    const copilotAccess = getCopilotAccessStatus(plan);

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const { count: aiUsed } = await svc
      .from("tenant_ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("usage_kind", "form_ai_generate")
      .gte("created_at", monthStart.toISOString());

    const { data: usageRows } = await svc.rpc("iso_estimate_tenant_storage_bytes", {
      p_tenant_id: tenantId,
    });

    const breakdown = ((usageRows || []) as Array<{ component: string; bytes: number }>).reduce<
      Record<string, number>
    >((acc, row) => {
      acc[row.component] = Number(row.bytes || 0);
      return acc;
    }, {});

    const totalBytes = Object.values(breakdown).reduce((s, n) => s + n, 0);

    return NextResponse.json({
      plan: {
        planCode: plan.plan_code,
        storageLimitMb: plan.storage_limit_mb,
        aiMonthlyQuota: plan.ai_monthly_quota,
        copilotEnabled: plan.copilot_enabled,
        copilotTrialDays: plan.copilot_trial_days,
        copilotTrialStartedAt: plan.copilot_trial_started_at,
        copilotPaid: plan.copilot_paid,
        activityLogRetentionDays: plan.activity_log_retention_days,
        aiMemoryRetentionDays: plan.ai_memory_retention_days,
      },
      copilotAccess,
      usage: {
        storageBytes: totalBytes,
        storageMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
        aiGenerationsThisMonth: aiUsed ?? 0,
        breakdown,
      },
      presets: PLAN_PRESETS,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status =
      typeof (error as { status?: number }).status === "number"
        ? (error as { status?: number }).status!
        : 500;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    let aiUsageRowsDeleted = 0;
    if (body.resetAiFormUsageThisMonth === true) {
      aiUsageRowsDeleted = await resetTenantFormAiUsageThisMonth(svc, tenantId);
    }

    let patch = normalizePlanPatch(body);

    if (typeof body.applyPreset === "string") {
      const preset = PLAN_PRESETS[body.applyPreset as PlanCode];
      if (preset) {
        patch = {
          ...patch,
          plan_code: body.applyPreset,
          storage_limit_mb: preset.storageLimitMb,
          ai_monthly_quota: preset.aiMonthlyQuota,
          activity_log_retention_days: preset.activityLogRetentionDays,
          ai_memory_retention_days: preset.aiMemoryRetentionDays,
          copilot_paid: body.applyPreset === "pro" || body.applyPreset === "enterprise",
        };
      }
    }

    if (!Object.keys(patch).length && body.resetAiFormUsageThisMonth !== true) {
      return NextResponse.json({ error: "No valid plan fields provided" }, { status: 400 });
    }

    await ensureTenantPlan(svc, tenantId);

    let updated = await ensureTenantPlan(svc, tenantId);

    if (Object.keys(patch).length) {
      const { data: patched, error } = await svc
        .from("tenant_storage_plans")
        .update(patch)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();

      if (error || !patched) {
        return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
      }
      updated = patched as typeof updated;
    }

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const { count: aiUsed } = await svc
      .from("tenant_ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("usage_kind", "form_ai_generate")
      .gte("created_at", monthStart.toISOString());

    return NextResponse.json({
      plan: {
        planCode: updated.plan_code,
        storageLimitMb: updated.storage_limit_mb,
        aiMonthlyQuota: updated.ai_monthly_quota,
        copilotEnabled: updated.copilot_enabled,
        copilotTrialDays: updated.copilot_trial_days,
        copilotTrialStartedAt: updated.copilot_trial_started_at,
        copilotPaid: updated.copilot_paid,
        activityLogRetentionDays: updated.activity_log_retention_days,
        aiMemoryRetentionDays: updated.ai_memory_retention_days,
      },
      copilotAccess: getCopilotAccessStatus(updated),
      aiUsageRowsDeleted,
      usage: { aiGenerationsThisMonth: aiUsed ?? 0 },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status =
      typeof (error as { status?: number }).status === "number"
        ? (error as { status?: number }).status!
        : 500;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
