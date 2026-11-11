import { NextResponse } from "next/server";
import { getBearerToken, getRouteUser } from "@/lib/supabase/routeAuth";
import { hasPermission } from "@/lib/roleGate";
import { googleAuthorizationUrl, signOAuthState } from "@/lib/googleDriveArchive";

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = await getRouteUser(token);
  if (!user || !supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantSlug = new URL(req.url).searchParams.get("tenantSlug")?.trim();
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
  const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  const { data: member } = await supabase.from("tenant_members").select("role").eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
  if (!member || !hasPermission(member.role, "brand.manage")) return NextResponse.json({ error: "Brand admins can connect archive storage" }, { status: 403 });
  try {
    return NextResponse.json({ authorizationUrl: googleAuthorizationUrl(signOAuthState({ tenantId: tenant.id, userId: user.id })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive is not configured";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
