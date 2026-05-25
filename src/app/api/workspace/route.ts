import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchWorkspaceViaSupabase } from "@/lib/data/fetchWorkspaceViaSupabase";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError) {
      console.warn("/api/workspace: supabase getUser error", userError.message);
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    const categoryId = url.searchParams.get("categoryId");

    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);
    const payload = await fetchWorkspaceViaSupabase(
      sb,
      tenantSlug,
      categoryId && categoryId.trim() ? categoryId.trim() : null
    );

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const err = error as Error & {
      status?: number;
      code?: string;
      deactivationReason?: string | null;
    };
    const status = typeof err.status === "number" && err.status >= 400 ? err.status : 500;
    return NextResponse.json(
      {
        error: err.message || "Server error",
        code: err.code,
        deactivationReason: err.deactivationReason ?? undefined,
      },
      { status }
    );
  }
}
