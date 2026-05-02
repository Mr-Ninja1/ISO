import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = createSupabaseWithBearer(token);

    const { data: rows, error } = await sb
      .from("template_library")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const templates = (rows || []).map((t) => ({
      id: t.id,
      title: t.title,
      updatedAt: t.updated_at,
    }));

    return NextResponse.json({ templates });
  } catch (error: unknown) {
    console.error("/api/template-library GET error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
