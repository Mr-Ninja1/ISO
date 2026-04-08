import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { mapAzureAnalyzeResultToSchema } from "@/lib/formOcrMapper";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function pollAnalyzeResult(operationLocation: string, key: string) {
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": key },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OCR poll failed (${res.status}): ${text || "Unknown error"}`);
    }

    const json = (await res.json()) as {
      status?: string;
      analyzeResult?: Record<string, unknown>;
      error?: { message?: string };
    };

    const status = (json.status || "").toLowerCase();
    if (status === "succeeded") return json.analyzeResult || {};
    if (status === "failed") {
      throw new Error(json.error?.message || "OCR analysis failed");
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  throw new Error("OCR analysis timeout. Please try with a clearer image.");
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const tenantSlug = String(formData.get("tenantSlug") || "").trim();
    const file = formData.get("file");

    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required" }, { status: 400 });

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "";
    const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "";

    if (!endpoint || !key) {
      return NextResponse.json(
        {
          error:
            "OCR provider not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY.",
        },
        { status: 500 }
      );
    }

    const bytes = await file.arrayBuffer();

    const base = endpoint.replace(/\/$/, "");
    const analyzeUrl = `${base}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-02-29-preview`;

    const analyzeRes = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: bytes,
    });

    if (!(analyzeRes.status === 202 || analyzeRes.ok)) {
      const text = await analyzeRes.text().catch(() => "");
      throw new Error(`OCR analyze request failed (${analyzeRes.status}): ${text || "Unknown error"}`);
    }

    const operationLocation = analyzeRes.headers.get("operation-location");
    if (!operationLocation) throw new Error("OCR operation location missing from provider response.");

    const analyzeResult = await pollAnalyzeResult(operationLocation, key);
    const schema = mapAzureAnalyzeResultToSchema(analyzeResult as any);

    return NextResponse.json({
      title: schema.title,
      schema,
      sections: schema.sections,
      provider: "azure-document-intelligence",
    });
  } catch (error: any) {
    console.error("/api/templates/ocr-import POST error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
