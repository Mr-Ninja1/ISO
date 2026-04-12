import { createClient } from "@supabase/supabase-js";

const DATA_URL_RE = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/;

function getStorageClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extensionFromMimeSubtype(subtype: string) {
  const normalized = subtype.toLowerCase();
  if (normalized === "jpeg") return "jpg";
  if (normalized === "svg+xml") return "svg";
  return normalized;
}

function shouldUploadPhoto(path: string[]) {
  return path.some((segment) => /photo|evidence/i.test(segment));
}

async function uploadDataUrl(
  dataUrl: string,
  tenantSlug: string,
  auditId: string,
  path: string[]
) {
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) return dataUrl;

  if (!shouldUploadPhoto(path)) {
    return dataUrl;
  }

  const client = getStorageClient();
  if (!client) {
    return dataUrl;
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET_PHOTO_EVIDENCE || "photo_evidence";
  const subtype = match[1];
  const base64 = match[2];
  const contentType = `image/${subtype}`;
  const ext = extensionFromMimeSubtype(subtype);

  const bytes = Buffer.from(base64, "base64");
  const objectPath = `${tenantSlug}/${auditId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage.from(bucket).upload(objectPath, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    return dataUrl;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
  return data?.publicUrl || dataUrl;
}

async function walkAndUpload(node: unknown, tenantSlug: string, auditId: string, path: string[]): Promise<unknown> {
  if (typeof node === "string") {
    if (node.startsWith("data:image/")) {
      return uploadDataUrl(node, tenantSlug, auditId, path);
    }
    return node;
  }

  if (Array.isArray(node)) {
    const next: unknown[] = [];
    for (let i = 0; i < node.length; i += 1) {
      next.push(await walkAndUpload(node[i], tenantSlug, auditId, [...path, String(i)]));
    }
    return next;
  }

  if (node && typeof node === "object") {
    const source = node as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      next[key] = await walkAndUpload(value, tenantSlug, auditId, [...path, key]);
    }
    return next;
  }

  return node;
}

export async function persistPhotoEvidenceToBucket(
  payload: Record<string, unknown>,
  tenantSlug: string,
  auditId: string
) {
  const next = (await walkAndUpload(payload, tenantSlug, auditId, [])) as Record<string, unknown>;
  return next;
}
