import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant") || "";
  const result = url.searchParams.get("result") || "failed";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const { createServiceRoleSupabase } = await import("@/lib/supabase/serviceRole");
  const svc = createServiceRoleSupabase();
  const { data } = svc ? await svc.from("tenants").select("slug").eq("id", tenantId).maybeSingle() : { data: null };
  const slug = data?.slug;
  if (!slug) return NextResponse.redirect(`${appUrl}/workspace`);
  return NextResponse.redirect(`${appUrl}/${encodeURIComponent(slug)}/settings?drive=${encodeURIComponent(result)}`);
}
