import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import {
  resetAllBrandsDcTrial,
  resetAllBrandsFormAiUsageThisMonth,
  resetTenantDcTrial,
  resetTenantFormAiUsageThisMonth,
} from "@/lib/admin/aiReset";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

/**
 * Reset AI usage for one brand or all brands (developer console).
 * Body: { scope: "tenant" | "all", tenantId?: string, resetFormAiUsage?: boolean, resetDcTrial?: boolean }
 */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) {
      return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      scope?: string;
      tenantId?: string;
      resetFormAiUsage?: boolean;
      resetDcTrial?: boolean;
    };

    const scope = body.scope === "all" ? "all" : "tenant";
    const resetFormAiUsage = body.resetFormAiUsage === true;
    const resetDcTrial = body.resetDcTrial === true;

    if (!resetFormAiUsage && !resetDcTrial) {
      return NextResponse.json(
        { error: "Specify resetFormAiUsage and/or resetDcTrial" },
        { status: 400 },
      );
    }

    if (scope === "tenant") {
      const tenantId = String(body.tenantId || "").trim();
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId is required for scope=tenant" }, { status: 400 });
      }

      let formAiRowsDeleted = 0;
      if (resetFormAiUsage) {
        formAiRowsDeleted = await resetTenantFormAiUsageThisMonth(svc, tenantId);
      }
      if (resetDcTrial) {
        await resetTenantDcTrial(svc, tenantId);
      }

      return NextResponse.json({
        ok: true,
        scope: "tenant",
        tenantId,
        formAiRowsDeleted,
        dcTrialReset: resetDcTrial,
      });
    }

    let formAiRowsDeleted = 0;
    let brandsDcTrialReset = 0;
    if (resetFormAiUsage) {
      formAiRowsDeleted = await resetAllBrandsFormAiUsageThisMonth(svc);
    }
    if (resetDcTrial) {
      brandsDcTrialReset = await resetAllBrandsDcTrial(svc);
    }

    return NextResponse.json({
      ok: true,
      scope: "all",
      formAiRowsDeleted,
      brandsDcTrialReset,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
