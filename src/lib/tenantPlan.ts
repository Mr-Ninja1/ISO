import type { SupabaseClient } from "@supabase/supabase-js";
import { DC_AI_PROFILE_NAME } from "@/lib/ai/deepControl";
import { DEFAULT_FREE_PLAN, type PlanCode } from "@/lib/tenantPlanDefaults";

export type TenantPlanRow = {
  tenant_id: string;
  plan_code: string;
  storage_limit_mb: number;
  activity_log_retention_days: number;
  ai_memory_retention_days: number;
  ai_monthly_quota: number;
  copilot_enabled: boolean;
  copilot_trial_days: number;
  copilot_trial_started_at: string | null;
  copilot_paid: boolean;
};

export type CopilotAccessStatus = {
  allowed: boolean;
  reason: "disabled" | "trial_active" | "paid" | "trial_expired";
  trialDays: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  daysRemaining: number;
  paid: boolean;
};

export type AiQuotaStatus = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  periodStart: string;
  periodEnd: string;
};

function monthBoundsUtc(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export type TenantAiProfileRow = {
  tenant_id: string;
  assistant_name: string;
  tone: string;
  domain_context: string | null;
  preferences: Record<string, unknown>;
};

export async function ensureTenantAiProfile(
  sb: SupabaseClient,
  tenantId: string,
): Promise<TenantAiProfileRow> {
  const { data: existing } = await sb
    .from("tenant_ai_profiles")
    .select("tenant_id,assistant_name,tone,domain_context,preferences")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) return existing as TenantAiProfileRow;

  const row = {
    tenant_id: tenantId,
    assistant_name: DC_AI_PROFILE_NAME,
    tone: "friendly",
    domain_context: null,
    preferences: {},
  };

  const { data: inserted, error } = await sb
    .from("tenant_ai_profiles")
    .insert(row)
    .select("tenant_id,assistant_name,tone,domain_context,preferences")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Failed to seed tenant AI profile");
  }

  return inserted as TenantAiProfileRow;
}

export async function ensureTenantPlan(
  sb: SupabaseClient,
  tenantId: string,
): Promise<TenantPlanRow> {
  const { data: existing } = await sb
    .from("tenant_storage_plans")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) return existing as TenantPlanRow;

  const row = {
    tenant_id: tenantId,
    plan_code: DEFAULT_FREE_PLAN.planCode,
    storage_limit_mb: DEFAULT_FREE_PLAN.storageLimitMb,
    activity_log_retention_days: DEFAULT_FREE_PLAN.activityLogRetentionDays,
    ai_memory_retention_days: DEFAULT_FREE_PLAN.aiMemoryRetentionDays,
    ai_monthly_quota: DEFAULT_FREE_PLAN.aiMonthlyQuota,
    copilot_enabled: DEFAULT_FREE_PLAN.copilotEnabled,
    copilot_trial_days: DEFAULT_FREE_PLAN.copilotTrialDays,
    copilot_trial_started_at: new Date().toISOString(),
    copilot_paid: false,
  };

  const { data: inserted, error } = await sb
    .from("tenant_storage_plans")
    .insert(row)
    .select("*")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Failed to seed tenant plan");
  }

  return inserted as TenantPlanRow;
}

export function getCopilotAccessStatus(plan: TenantPlanRow): CopilotAccessStatus {
  const trialDays = Math.max(0, plan.copilot_trial_days ?? DEFAULT_FREE_PLAN.copilotTrialDays);
  const startedAt = plan.copilot_trial_started_at
    ? new Date(plan.copilot_trial_started_at)
    : null;
  const trialEndsAt =
    startedAt && trialDays > 0
      ? new Date(startedAt.getTime() + trialDays * 86_400_000)
      : null;

  const paid =
    Boolean(plan.copilot_paid) ||
    plan.plan_code === "pro" ||
    plan.plan_code === "enterprise";

  if (!plan.copilot_enabled) {
    return {
      allowed: false,
      reason: "disabled",
      trialDays,
      trialStartedAt: plan.copilot_trial_started_at,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      daysRemaining: 0,
      paid,
    };
  }

  if (paid) {
    return {
      allowed: true,
      reason: "paid",
      trialDays,
      trialStartedAt: plan.copilot_trial_started_at,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      daysRemaining: -1,
      paid: true,
    };
  }

  const now = Date.now();
  if (trialEndsAt && now < trialEndsAt.getTime()) {
    const daysRemaining = Math.max(
      0,
      Math.ceil((trialEndsAt.getTime() - now) / 86_400_000),
    );
    return {
      allowed: true,
      reason: "trial_active",
      trialDays,
      trialStartedAt: plan.copilot_trial_started_at,
      trialEndsAt: trialEndsAt.toISOString(),
      daysRemaining,
      paid: false,
    };
  }

  return {
    allowed: false,
    reason: "trial_expired",
    trialDays,
    trialStartedAt: plan.copilot_trial_started_at,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    daysRemaining: 0,
    paid: false,
  };
}

export async function getAiQuotaStatus(
  sb: SupabaseClient,
  tenantId: string,
): Promise<AiQuotaStatus> {
  const plan = await ensureTenantPlan(sb, tenantId);
  const { start, end } = monthBoundsUtc();

  const { count, error } = await sb
    .from("tenant_ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("usage_kind", "form_ai_generate")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) {
    throw new Error(error.message);
  }

  const used = count ?? 0;
  const unlimited = plan.ai_monthly_quota < 0;
  const limit = unlimited ? -1 : plan.ai_monthly_quota;
  const remaining = unlimited ? -1 : Math.max(0, plan.ai_monthly_quota - used);

  return {
    allowed: unlimited || used < plan.ai_monthly_quota,
    used,
    limit,
    remaining,
    unlimited,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

export async function recordAiUsage(
  sb: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    usageKind?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await sb.from("tenant_ai_usage_events").insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    usage_kind: params.usageKind || "form_ai_generate",
    metadata: params.metadata || {},
  });
}

export function normalizePlanPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};

  if (typeof body.planCode === "string" && body.planCode.trim()) {
    patch.plan_code = body.planCode.trim().toLowerCase();
  }
  if (typeof body.storageLimitMb === "number" && Number.isFinite(body.storageLimitMb)) {
    patch.storage_limit_mb = Math.max(128, Math.round(body.storageLimitMb));
  }
  if (typeof body.aiMonthlyQuota === "number" && Number.isFinite(body.aiMonthlyQuota)) {
    patch.ai_monthly_quota = Math.round(body.aiMonthlyQuota);
  }
  if (typeof body.copilotEnabled === "boolean") {
    patch.copilot_enabled = body.copilotEnabled;
  }
  if (typeof body.copilotTrialDays === "number" && Number.isFinite(body.copilotTrialDays)) {
    patch.copilot_trial_days = Math.max(0, Math.min(365, Math.round(body.copilotTrialDays)));
  }
  if (typeof body.copilotPaid === "boolean") {
    patch.copilot_paid = body.copilotPaid;
  }
  if (body.resetCopilotTrial === true) {
    patch.copilot_trial_started_at = new Date().toISOString();
  }
  if (typeof body.activityLogRetentionDays === "number") {
    patch.activity_log_retention_days = Math.max(1, Math.round(body.activityLogRetentionDays));
  }
  if (typeof body.aiMemoryRetentionDays === "number") {
    patch.ai_memory_retention_days = Math.max(1, Math.round(body.aiMemoryRetentionDays));
  }

  return patch;
}

export function planCodeLabel(code: string): PlanCode {
  if (code === "pro" || code === "enterprise") return code;
  return "free";
}
