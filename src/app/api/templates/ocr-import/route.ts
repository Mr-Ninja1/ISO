import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { generateFormSchemaFromInput } from "@/lib/ai/generateFormSchema";
import { getGeminiModelName, isGeminiConfigured } from "@/lib/ai/gemini";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

/** Legacy alias — photo import now uses Gemini only (same as ai-generate). */
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const tenantSlug = String(formData.get("tenantSlug") || "").trim();
    const prompt = String(formData.get("prompt") || "").trim();
    const file = formData.get("file");

    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image/PDF must be 10 MB or smaller." }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);
    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (me || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const schema = await generateFormSchemaFromInput({ prompt: prompt || undefined, image: file });

    return NextResponse.json({
      title: schema.title,
      schema,
      sections: schema.sections,
      provider: "gemini",
      model: getGeminiModelName(),
    });
  } catch (error: unknown) {
    console.error("/api/templates/ocr-import POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
