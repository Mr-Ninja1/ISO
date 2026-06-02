import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

export type PushDiagnosticCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

function readServiceAccountMeta() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
  } catch {
    return null;
  }
}

function getEmailConfigMeta() {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from =
    (process.env.ALERT_FROM_EMAIL || process.env.NOTIFY_FROM_EMAIL || process.env.EMAIL_FROM || "").trim();
  return { apiKey: Boolean(apiKey), from: Boolean(from) };
}

export async function getPushDeliveryDiagnostics(): Promise<{
  checks: PushDiagnosticCheck[];
  tokenCount: number;
  recentTokens: Array<{ platform: string; tenantId: string | null; lastSeenAt: string }>;
}> {
  const svc = createServiceRoleSupabase();
  const serviceAccount = readServiceAccountMeta();
  const emailConfig = getEmailConfigMeta();
  const clientFlag = process.env.NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED === "1";

  let tokenCount = 0;
  let recentTokens: Array<{ platform: string; tenantId: string | null; lastSeenAt: string }> = [];

  if (svc) {
    const { count } = await svc
      .from("device_push_tokens")
      .select("*", { count: "exact", head: true })
      .eq("platform", "android");
    tokenCount = count || 0;

    const { data } = await svc
      .from("device_push_tokens")
      .select("platform, tenant_id, last_seen_at")
      .eq("platform", "android")
      .order("last_seen_at", { ascending: false })
      .limit(5);

    recentTokens = (data || []).map((row) => ({
      platform: String((row as { platform?: string }).platform || "android"),
      tenantId: ((row as { tenant_id?: string | null }).tenant_id as string | null) ?? null,
      lastSeenAt: String((row as { last_seen_at?: string }).last_seen_at || ""),
    }));
  }

  const checks: PushDiagnosticCheck[] = [
    {
      id: "client_flag",
      label: "Client push flag",
      ok: clientFlag,
      detail: clientFlag
        ? "NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED=1"
        : "Set NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED=1 in the web build env",
    },
    {
      id: "service_role",
      label: "Supabase service role",
      ok: Boolean(svc),
      detail: svc ? "Configured" : "Missing SUPABASE_SERVICE_ROLE_KEY",
    },
    {
      id: "firebase_json",
      label: "Firebase service account",
      ok: Boolean(serviceAccount?.project_id && serviceAccount?.client_email && serviceAccount?.private_key),
      detail: serviceAccount?.project_id
        ? `Project ${serviceAccount.project_id}`
        : "Set FIREBASE_SERVICE_ACCOUNT_JSON on the server",
    },
    {
      id: "android_tokens",
      label: "Registered Android tokens",
      ok: tokenCount > 0,
      detail: tokenCount > 0 ? `${tokenCount} device token(s)` : "No tokens yet — open the APK, sign in, allow notifications",
    },
    {
      id: "email_provider",
      label: "Email alert provider",
      ok: emailConfig.apiKey && emailConfig.from,
      detail:
        emailConfig.apiKey && emailConfig.from
          ? "Resend configured"
          : "Set RESEND_API_KEY and ALERT_FROM_EMAIL for email alerts",
    },
  ];

  return { checks, tokenCount, recentTokens };
}
