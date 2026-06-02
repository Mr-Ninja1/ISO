import { NextResponse } from "next/server";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import { getPushDeliveryDiagnostics } from "@/lib/push/diagnostics";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

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

async function verifyFirebaseAuth() {
  const serviceAccount = readServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount.private_key) {
    return { ok: false, detail: "Firebase service account is missing" };
  }

  try {
    const issuedAt = Math.floor(Date.now() / 1000);
    const claimSet = {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
      iat: issuedAt,
      exp: issuedAt + 3600,
    };
    const header = { alg: "RS256", typ: "JWT" };
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
    const privateKey = serviceAccount.private_key.replace(/\\n/g, "\n");
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
      return { ok: false, detail: text || `Google token request failed (${tokenRes.status})` };
    }

    const json = (await tokenRes.json()) as { access_token?: string };
    if (!json.access_token) return { ok: false, detail: "Google access token missing from response" };
    return { ok: true, detail: "FCM auth token acquired successfully" };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "FCM auth failed";
    return { ok: false, detail: msg };
  }
}

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);

    const base = await getPushDeliveryDiagnostics();
    const fcmAuth = await verifyFirebaseAuth();

    const checks = [
      ...base.checks,
      {
        id: "fcm_auth",
        label: "FCM server auth",
        ok: fcmAuth.ok,
        detail: fcmAuth.detail,
      },
    ];

    const svc = createServiceRoleSupabase();
    let tokensWithoutTenant = 0;
    if (svc) {
      const { count } = await svc
        .from("device_push_tokens")
        .select("*", { count: "exact", head: true })
        .eq("platform", "android")
        .is("tenant_id", null);
      tokensWithoutTenant = count || 0;
    }

    if (tokensWithoutTenant > 0) {
      checks.push({
        id: "tenantless_tokens",
        label: "Tokens without tenant id",
        ok: true,
        detail: `${tokensWithoutTenant} token(s) registered before brand context — tenant pushes now match by membership too`,
      });
    }

    return NextResponse.json({
      ok: checks.every((check) => check.ok),
      checks,
      tokenCount: base.tokenCount,
      recentTokens: base.recentTokens,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status =
      typeof (error as { status?: number }).status === "number"
        ? (error as { status?: number }).status!
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
