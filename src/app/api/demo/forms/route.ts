import { NextResponse } from "next/server";
import { generateFormSchemaFromInput, looksLikeMeaningfulFormRequest } from "@/lib/ai/generateFormSchema";
import { isGeminiConfigured, getGeminiModelName } from "@/lib/ai/gemini";
import { MAX_SOURCE_DOCUMENT_BYTES, validateSourceDocument } from "@/lib/ai/sourceDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const usageByAddress = new Map<string, { startedAt: number; count: number }>();

function requestAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

function consumeDemoQuota(address: string) {
  const now = Date.now();
  const current = usageByAddress.get(address);
  if (current && now - current.startedAt < WINDOW_MS && current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  if (!current || now - current.startedAt >= WINDOW_MS) {
    if (usageByAddress.size >= 2000) usageByAddress.delete(usageByAddress.keys().next().value as string);
    usageByAddress.set(address, { startedAt: now, count: 1 });
  }
  else usageByAddress.set(address, { ...current, count: current.count + 1 });
  return true;
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_SOURCE_DOCUMENT_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Upload must be 10 MB or smaller." }, { status: 413 });
    }
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(req.url).origin) {
      return NextResponse.json({ error: "This demo endpoint only accepts requests from this site." }, { status: 403 });
    }
    if (!isGeminiConfigured()) {
      return NextResponse.json({ error: "AI form creation is temporarily unavailable." }, { status: 503 });
    }
    if (!consumeDemoQuota(requestAddress(req))) {
      return NextResponse.json({ error: "Demo AI limit reached. Try again in an hour." }, { status: 429 });
    }

    let prompt = "";
    let file: File | null = null;
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const formData = await req.formData();
      prompt = String(formData.get("prompt") || "").trim();
      const uploaded = formData.get("file");
      file = uploaded instanceof File && uploaded.size > 0 ? uploaded : null;
    } else {
      const body = (await req.json().catch(() => null)) as { prompt?: unknown } | null;
      prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    }
    if (prompt.length > 1500 || (!prompt && !file) || (prompt && !looksLikeMeaningfulFormRequest(prompt))) {
      return NextResponse.json({ error: "Add a useful form description, a document, or both. Descriptions can be up to 1,500 characters." }, { status: 400 });
    }
    if (file) {
      const validation = validateSourceDocument(file);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = await generateFormSchemaFromInput({ prompt: prompt || undefined, image: file || undefined });
    return NextResponse.json({ schema: result.schema, extraction: result.extraction || null, model: getGeminiModelName() });
  } catch (error) {
    console.error("/api/demo/forms POST error", error);
    return NextResponse.json({ error: "Could not create that form. Please try again." }, { status: 500 });
  }
}
