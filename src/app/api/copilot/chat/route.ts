import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { resolveCopilotIntentDetailed, screenContextLabel } from "@/lib/copilot/intents";
import { pickAutoNavigateHref, autoNavigateLabel } from "@/lib/copilot/autoNavigate";
import { generateGeminiCopilotAnswer, shouldUseGeminiCopilot } from "@/lib/ai/copilotGemini";
import { hasPermission, normalizeRole } from "@/lib/roleGate";
import { ensureTenantPlan, ensureTenantAiProfile, getCopilotAccessStatus, recordAiUsage } from "@/lib/tenantPlan";
import { DC_AI_NAME } from "@/lib/ai/deepControl";
import { getGeminiModelName } from "@/lib/ai/gemini";
import { fetchCopilotLiveSnapshot } from "@/lib/copilot/fetchLiveSnapshot";
import {
  formatRetrievedKnowledge,
  retrieveCopilotKnowledge,
} from "@/lib/copilot/retrieveKnowledge";

function getBearerToken(req: Request) {
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    tenantSlug?: string;
    pathname?: string;
  };

  const tenantSlug = String(body.tenantSlug || "").trim();
  const message = String(body.message || "").trim();
  const pathname = String(body.pathname || "/");

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
    const { data: tenant } = await sb.from("tenants").select("id,name").eq("slug", tenantSlug).maybeSingle();
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const plan = await ensureTenantPlan(sb, tenant.id as string);
    const aiProfile = await ensureTenantAiProfile(sb, tenant.id as string);
    const copilotAccess = getCopilotAccessStatus(plan);

    if (!plan.copilot_enabled) {
      return NextResponse.json({
        code: "copilot_disabled",
        message: `${DC_AI_NAME} is not enabled for this brand. Contact your platform developer to upgrade.`,
        actions: [],
        screen: screenContextLabel(pathname),
        assistantName: aiProfile.assistant_name || DC_AI_NAME,
        copilotAccess,
      }, { status: 403 });
    }

    if (!copilotAccess.allowed) {
      return NextResponse.json({
        code: "copilot_trial_expired",
        message: `Your ${copilotAccess.trialDays}-day ${DC_AI_NAME} trial has ended. Contact your platform developer to upgrade for unlimited help.`,
        actions: [],
        screen: screenContextLabel(pathname),
        assistantName: aiProfile.assistant_name || DC_AI_NAME,
        copilotAccess,
      }, { status: 402 });
    }

    const role = normalizeRole(membership.role);
    const caps = {
      canCreateForms: hasPermission(role, "forms.create"),
      canManageCategories: hasPermission(role, "categories.manage"),
      canManageStaff: hasPermission(role, "staff.manage"),
      canAccessSettings: hasPermission(role, "settings.view"),
    };

    const live = await fetchCopilotLiveSnapshot(sb, tenant.id as string, role, caps);

    const retrieved = retrieveCopilotKnowledge(message, { caps });
    const retrievedDocs = formatRetrievedKnowledge(retrieved);

    const knowledgeCtx = {
      tenantSlug,
      pathname,
      caps,
      brandName: tenant.name as string,
      role,
      live,
      brandDomainContext: aiProfile.domain_context,
      retrievedDocs,
      retrieved,
    };

    const { response: ruleResult, tier } = resolveCopilotIntentDetailed(message, knowledgeCtx);

    let result = ruleResult;
    if (shouldUseGeminiCopilot(tier)) {
      result = await generateGeminiCopilotAnswer(message, knowledgeCtx, ruleResult);
      await recordAiUsage(sb, {
        tenantId: tenant.id as string,
        userId: user.id,
        usageKind: "copilot_chat",
        metadata: { tier, model: getGeminiModelName() },
      });
    }

    const navigateTo = pickAutoNavigateHref(message, result.actions);

    // Chat context lives in browser localStorage — not DB (saves storage)
    return NextResponse.json({
      ...result,
      navigateTo,
      navigateLabel: navigateTo ? autoNavigateLabel(result.actions) : null,
      screen: screenContextLabel(pathname),
      brandName: tenant.name,
      assistantName: aiProfile.assistant_name || DC_AI_NAME,
      tenantId: tenant.id,
      copilotAccess,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
