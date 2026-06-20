import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { assessFormSchemaContext, generateFormSchemaFromInput } from "@/lib/ai/generateFormSchema";
import { getGeminiModelName, isGeminiConfigured } from "@/lib/ai/gemini";
import { ensureTenantPlan, getAiQuotaStatus, recordAiUsage } from "@/lib/tenantPlan";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function parseAnswers(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[String(key)] = String(value ?? "").trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function authorizeTenant(token: string, tenantSlug: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const sb = createSupabaseWithBearer(token);
  const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (te || !tenant) return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (me || !membership) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { user, tenantId: tenant.id as string, sb };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isGeminiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Gemini is not configured. Add GEMINI_API_KEY to your server environment (Google AI Studio → Create API key).",
        },
        { status: 500 },
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let tenantSlug = "";
    let prompt = "";
    let phase = "generate";
    let answersRaw = "";
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      tenantSlug = String(formData.get("tenantSlug") || "").trim();
      prompt = String(formData.get("prompt") || "").trim();
      phase = String(formData.get("phase") || "generate").trim().toLowerCase();
      answersRaw = String(formData.get("answers") || "").trim();
      const rawFile = formData.get("file");
      file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        tenantSlug?: string;
        prompt?: string;
        phase?: string;
        answers?: Record<string, string>;
      };
      tenantSlug = String(body.tenantSlug || "").trim();
      prompt = String(body.prompt || "").trim();
      phase = String(body.phase || "generate").trim().toLowerCase();
      answersRaw = body.answers ? JSON.stringify(body.answers) : "";
    }

    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    if (!prompt && !file) {
      return NextResponse.json(
        { error: "Provide a description, an image/PDF, or both." },
        { status: 400 },
      );
    }
    if (prompt.length > 4000) {
      return NextResponse.json({ error: "Description is too long (max 4000 characters)" }, { status: 400 });
    }
    if (file && file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image/PDF must be 10 MB or smaller." }, { status: 400 });
    }

    const auth = await authorizeTenant(token, tenantSlug);
    if ("error" in auth && auth.error) return auth.error;

    const plan = await ensureTenantPlan(auth.sb, auth.tenantId);
    const quota = await getAiQuotaStatus(auth.sb, auth.tenantId);

    if (phase === "generate" && !quota.allowed) {
      return NextResponse.json(
        {
          error: `AI form limit reached for this month (${quota.used}/${quota.limit}). Contact your platform developer to upgrade this brand.`,
          code: "AI_QUOTA_EXCEEDED",
          quota,
        },
        { status: 402 },
      );
    }

    const input = {
      prompt: prompt || undefined,
      image: file || undefined,
      clarifications: parseAnswers(answersRaw),
    };

    if (phase === "assess") {
      const assessment = await assessFormSchemaContext(input);
      return NextResponse.json({
        ...assessment,
        provider: "gemini",
        model: getGeminiModelName(),
        quota: {
          used: quota.used,
          limit: quota.limit,
          remaining: quota.remaining,
          unlimited: quota.unlimited,
        },
        copilotEnabled: plan.copilot_enabled,
      });
    }

    const schema = await generateFormSchemaFromInput(input);

    await recordAiUsage(auth.sb, {
      tenantId: auth.tenantId,
      userId: auth.user.id,
      usageKind: "form_ai_generate",
      metadata: { phase: "generate", model: getGeminiModelName() },
    });

    const quotaAfter = await getAiQuotaStatus(auth.sb, auth.tenantId);

    return NextResponse.json({
      title: schema.title,
      schema,
      sections: schema.sections,
      provider: "gemini",
      model: getGeminiModelName(),
      quota: {
        used: quotaAfter.used,
        limit: quotaAfter.limit,
        remaining: quotaAfter.remaining,
        unlimited: quotaAfter.unlimited,
      },
    });
  } catch (error: unknown) {
    console.error("/api/templates/ai-generate POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
