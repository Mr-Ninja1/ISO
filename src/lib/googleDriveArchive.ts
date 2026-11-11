import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

function encryptionKey() {
  const raw = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY || "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key");
  return key;
}

export function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptRefreshToken(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Stored Google Drive credential is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google Drive OAuth is not configured");
  return { clientId, clientSecret, redirectUri };
}

export function googleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = googleOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

export async function exchangeGoogleCode(code: string) {
  const config = googleOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!response.ok || !data.access_token || !data.refresh_token) throw new Error(data.error_description || "Google did not return a refresh token. Reconnect and grant access.");
  const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${data.access_token}` } });
  const user = profile.ok ? await profile.json() as { email?: string } : {};
  return { refreshToken: data.refresh_token, email: user.email || null };
}

export function signOAuthState(payload: { tenantId: string; userId: string }) {
  const secret = process.env.GOOGLE_DRIVE_STATE_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new Error("GOOGLE_DRIVE_STATE_SECRET is not configured");
  const body = Buffer.from(JSON.stringify({ ...payload, issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOAuthState(value: string) {
  const [body, signature] = value.split(".");
  const secret = process.env.GOOGLE_DRIVE_STATE_SECRET || process.env.CRON_SECRET;
  if (!body || !signature || !secret) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { tenantId: string; userId: string; issuedAt: number };
    if (Date.now() - parsed.issuedAt > 10 * 60_000 || !parsed.tenantId || !parsed.userId) return null;
    return parsed;
  } catch { return null; }
}

async function driveAccessToken(refreshToken: string) {
  const config = googleOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Google Drive authorization expired");
  return data.access_token;
}

async function authorizedDriveFetch(refreshToken: string, url: string, init?: RequestInit) {
  const token = await driveAccessToken(refreshToken);
  return fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
}

export type ArchivedAudit = { id: string; tenant_id: string; template_id: string; status: string; created_at: string; updated_at: string; submitted_at: string | null; payload: unknown; template_title: string; template_schema?: unknown };

export async function archiveAudit(supabase: SupabaseClient, tenantId: string, refreshToken: string, row: ArchivedAudit) {
  const checksum = createHash("sha256").update(JSON.stringify(row)).digest("hex");
  const boundary = `iso_${randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({ name: `iso-form-${row.id}.json`, mimeType: "application/json", description: `ISO Grid archived submission ${row.id}` });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ format: "iso-grid-audit-v1", checksum, audit: row })}\r\n--${boundary}--`;
  const upload = await authorizedDriveFetch(refreshToken, `${DRIVE_API}/files?fields=id,size,md5Checksum`, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  const file = await upload.json() as { id?: string; size?: string; md5Checksum?: string; error?: { message?: string } };
  if (!upload.ok || !file.id || Number(file.size || 0) === 0) throw new Error(file.error?.message || "Drive archive upload could not be verified");

  const { error: manifestError } = await supabase.from("audit_archives").upsert({
    id: row.id, tenant_id: tenantId, template_id: row.template_id, status: row.status,
    created_at: row.created_at, updated_at: row.updated_at, submitted_at: row.submitted_at,
    template_title: row.template_title, drive_file_id: file.id, checksum_sha256: checksum, archived_at: new Date().toISOString(),
  });
  if (manifestError) {
    await authorizedDriveFetch(refreshToken, `${DRIVE_API}/files/${file.id}`, { method: "DELETE" });
    throw new Error(`Could not save archive manifest: ${manifestError.message}`);
  }

  const { error: deleteError } = await supabase.from("audit_logs").delete().eq("id", row.id).eq("tenant_id", tenantId);
  if (deleteError) {
    await supabase.from("audit_archives").delete().eq("id", row.id);
    await authorizedDriveFetch(refreshToken, `${DRIVE_API}/files/${file.id}`, { method: "DELETE" });
    throw new Error(`Could not remove archived database row: ${deleteError.message}`);
  }
  return { id: row.id, checksum };
}

export async function loadArchivedAudit(refreshToken: string, fileId: string, expectedChecksum: string) {
  const response = await authorizedDriveFetch(refreshToken, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  if (!response.ok) throw new Error(response.status === 404 ? "Archived form is missing from Google Drive" : "Could not retrieve archived form from Google Drive");
  const archive = await response.json() as { format?: string; checksum?: string; audit?: ArchivedAudit };
  if (archive.format !== "iso-grid-audit-v1" || !archive.audit) throw new Error("Google Drive file is not a valid ISO Grid archive");
  const checksum = createHash("sha256").update(JSON.stringify(archive.audit)).digest("hex");
  if (checksum !== expectedChecksum || archive.checksum !== expectedChecksum) throw new Error("Archived form failed its integrity check");
  return archive.audit;
}

export async function deleteDriveArchiveFile(refreshToken: string, fileId: string) {
  const response = await authorizedDriveFetch(refreshToken, `${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "Could not delete the archived form from Google Drive");
  }
}

export function decryptArchiveCredential(value: string) { return decryptRefreshToken(value); }
