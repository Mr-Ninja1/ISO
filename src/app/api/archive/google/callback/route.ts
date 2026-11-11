import { NextResponse } from "next/server";
import { exchangeGoogleCode, encryptRefreshToken, verifyOAuthState } from "@/lib/googleDriveArchive";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = verifyOAuthState(url.searchParams.get("state") || "");
  if (!state) return NextResponse.json({ error: "Google Drive connection expired. Start again from Settings." }, { status: 400 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const svc = createServiceRoleSupabase();
  if (!svc) return NextResponse.json({ error: "Server storage is not configured" }, { status: 500 });
  const redirect = (result: string) => NextResponse.redirect(`${origin}/api/archive/google/complete?result=${result}&tenant=${encodeURIComponent(state.tenantId)}`);
  const oauthError = url.searchParams.get("error");
  if (oauthError) return redirect("denied");
  const code = url.searchParams.get("code");
  if (!code) return redirect("failed");
  try {
    const { data: membership } = await svc.from("tenant_members").select("role").eq("tenant_id", state.tenantId).eq("user_id", state.userId).maybeSingle();
    if (!membership || membership.role !== "ADMIN") return redirect("denied");
    const result = await exchangeGoogleCode(code);
    const { error } = await svc.from("tenant_google_drive_archives").upsert({
      tenant_id: state.tenantId,
      google_email: result.email,
      refresh_token_encrypted: encryptRefreshToken(result.refreshToken),
      connected_at: new Date().toISOString(),
      last_error: null,
    });
    if (error) throw new Error(error.message);
    return redirect("connected");
  } catch (error) {
    console.error("Google Drive OAuth callback failed", error);
    return redirect("failed");
  }
}
