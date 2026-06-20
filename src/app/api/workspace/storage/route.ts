import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { getAiQuotaStatus, ensureTenantPlan, getCopilotAccessStatus } from "@/lib/tenantPlan";

function getBearerToken(req: Request) {
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

type StorageBreakdownRow = {
  component: string;
  bytes: number;
};

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenantSlug") || "";
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sb = createSupabaseWithBearer(token);
    const { data: tenant, error: tenantErr } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const { data: membership } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: plan } = await sb
      .from("tenant_storage_plans")
      .select(
        "plan_code,storage_limit_mb,activity_log_retention_days,ai_memory_retention_days,ai_monthly_quota,copilot_enabled",
      )
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    const { data: estimatedRows, error: estimateErr } = await sb.rpc(
      "iso_estimate_tenant_storage_bytes",
      { p_tenant_id: tenant.id },
    );

    if (estimateErr) {
      return NextResponse.json(
        { error: estimateErr.message || "Failed to estimate storage" },
        { status: 500 },
      );
    }

    const { data: latestSnapshot } = await sb
      .from("tenant_storage_usage_snapshots")
      .select("measured_at,storage_bytes,breakdown")
      .eq("tenant_id", tenant.id)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const breakdownRows = (estimatedRows || []) as StorageBreakdownRow[];
    const breakdown = breakdownRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.component] = Number(row.bytes || 0);
      return acc;
    }, {});

    const totalBytes = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
    const storageLimitMb = Number(plan?.storage_limit_mb || 512);
    const storageLimitBytes = storageLimitMb * 1024 * 1024;
    const usageRatio = storageLimitBytes > 0 ? totalBytes / storageLimitBytes : 0;

    const aiQuota = await getAiQuotaStatus(sb, tenant.id as string);
    const planRow = await ensureTenantPlan(sb, tenant.id as string);
    const copilotAccess = getCopilotAccessStatus(planRow);

    return NextResponse.json(
      {
        tenantId: tenant.id,
        plan: {
          code: plan?.plan_code || planRow.plan_code || "free",
          storageLimitMb,
          activityLogRetentionDays: Number(plan?.activity_log_retention_days || planRow.activity_log_retention_days || 30),
          aiMemoryRetentionDays: Number(plan?.ai_memory_retention_days || planRow.ai_memory_retention_days || 7),
          aiMonthlyQuota: Number(plan?.ai_monthly_quota ?? planRow.ai_monthly_quota ?? 4),
          copilotEnabled: plan?.copilot_enabled !== false && planRow.copilot_enabled !== false,
          copilotTrialDays: planRow.copilot_trial_days,
          copilotPaid: planRow.copilot_paid,
        },
        copilotAccess,
        usage: {
          totalBytes,
          totalMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
          limitBytes: storageLimitBytes,
          limitMb: storageLimitMb,
          usageRatio: Number(usageRatio.toFixed(4)),
          overLimit: usageRatio > 1,
          warning: usageRatio >= 0.85,
          breakdown,
        },
        aiQuota: {
          used: aiQuota.used,
          limit: aiQuota.limit,
          remaining: aiQuota.remaining,
          unlimited: aiQuota.unlimited,
          periodStart: aiQuota.periodStart,
          periodEnd: aiQuota.periodEnd,
        },
        latestSnapshot: latestSnapshot
          ? {
              measuredAt: latestSnapshot.measured_at,
              totalBytes: Number(latestSnapshot.storage_bytes || 0),
              breakdown: latestSnapshot.breakdown || {},
            }
          : null,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
