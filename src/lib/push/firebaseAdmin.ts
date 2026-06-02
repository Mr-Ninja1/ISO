import type { PushPayload } from "@/lib/push/types";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { normalizeAnnouncementAudience } from "@/lib/platformAudience";

type SendPushOptions = {
  payload: PushPayload;
  tenantId?: string | null;
  audience?: "all" | "native" | "web" | null;
  userIds?: string[];
};

type TokenRow = {
  token: string;
  platform: string;
  tenant_id: string | null;
  user_id: string;
};

type FirebaseMessage = {
  token: string;
  notification: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
  android?: {
    priority?: "high" | "normal";
    notification?: {
      channelId?: string;
      clickAction?: string;
    };
  };
};

type FirebaseSendResult = {
  name?: string;
  error?: { message?: string };
};

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
      token_uri?: string;
    };
  } catch {
    return null;
  }
}

async function getGoogleAccessToken(serviceAccount: NonNullable<ReturnType<typeof readServiceAccount>>) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: expiresAt,
  };

  const encoder = new TextEncoder();
  const toBase64Url = (input: string | Uint8Array) => {
    const bytes = typeof input === "string" ? encoder.encode(input) : input;
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    }

    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const unsignedJwt = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claimSet))}`;
  const privateKey = serviceAccount.private_key?.replace(/\\n/g, "\n");
  if (!privateKey) throw new Error("Firebase private key is missing");

  const { createSign } = await import("crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
  const jwt = `${unsignedJwt}.${toBase64Url(signature)}`;

  const tokenRes = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(text || `Google token request failed (${tokenRes.status})`);
  }

  const json = (await tokenRes.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google access token missing from response");
  return json.access_token;
}

async function listTenantMemberUserIds(tenantId: string) {
  const svc = createServiceRoleSupabase();
  if (!svc) return new Set<string>();

  const { data, error } = await svc.from("tenant_members").select("user_id").eq("tenant_id", tenantId);
  if (error) return new Set<string>();
  return new Set(
    (data || [])
      .map((row) => (row as { user_id?: string }).user_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
}

function collectUniqueTokens(rows: TokenRow[]) {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const row of rows) {
    const token = typeof row.token === "string" ? row.token.trim() : "";
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

async function listTargetTokens(options: SendPushOptions) {
  const svc = createServiceRoleSupabase();
  if (!svc) throw new Error("Service role is not configured");

  const audience = normalizeAnnouncementAudience(options.audience);
  if (audience === "web") return [];

  const { data, error } = await svc
    .from("device_push_tokens")
    .select("token, platform, tenant_id, user_id")
    .eq("platform", "android");
  if (error) throw new Error(error.message || "Failed to load device tokens");

  let rows = (data || []) as TokenRow[];

  if (options.userIds?.length) {
    const allowed = new Set(options.userIds);
    rows = rows.filter((row) => allowed.has(row.user_id));
  } else if (options.tenantId) {
    const memberIds = await listTenantMemberUserIds(options.tenantId);
    rows = rows.filter(
      (row) => row.tenant_id === options.tenantId || memberIds.has(row.user_id),
    );
  }

  return collectUniqueTokens(rows);
}

function toFirebaseMessage(token: string, payload: PushPayload): FirebaseMessage {
  const data: Record<string, string> = {
    ...(payload.data || {}),
  };

  if (payload.deepLink) data.deepLink = payload.deepLink;
  if (payload.tenantSlug) data.tenantSlug = payload.tenantSlug;
  if (payload.category) data.category = payload.category;

  return {
    token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data,
    android: {
      priority: "high",
      notification: {
        channelId: "iso-general",
        clickAction: "FCM_PLUGIN_ACTIVITY",
      },
    },
  };
}

async function sendFirebaseMessage(projectId: string, accessToken: string, message: FirebaseMessage) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (res.ok) {
    return { ok: true, result: (await res.json().catch(() => ({}))) as FirebaseSendResult };
  }

  const text = await res.text();
  return { ok: false, error: text || `FCM send failed (${res.status})` };
}

export async function sendPushNotificationToUsers(options: {
  userIds: string[];
  payload: PushPayload;
  tenantId?: string | null;
}) {
  if (!options.userIds.length) {
    return { attempted: true, sent: 0, failed: 0, skipped: "No target users" };
  }
  return sendPushNotificationToDevices({
    payload: options.payload,
    tenantId: options.tenantId,
    userIds: options.userIds,
  });
}

export async function sendPushNotificationToDevices(options: SendPushOptions) {
  const serviceAccount = readServiceAccount();
  if (!serviceAccount?.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    return { attempted: false, sent: 0, failed: 0, skipped: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured" };
  }

  const tokens = await listTargetTokens(options);
  if (tokens.length === 0) {
    return { attempted: true, sent: 0, failed: 0, skipped: "No matching device tokens" };
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);
  let sent = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const token of tokens) {
    const result = await sendFirebaseMessage(
      serviceAccount.project_id,
      accessToken,
      toFirebaseMessage(token, options.payload)
    );

    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      if (failures.length < 5 && result.error) failures.push(result.error);
    }
  }

  return {
    attempted: true,
    sent,
    failed,
    failures,
  };
}
