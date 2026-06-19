import type { CachedAuditRow } from "@/lib/client/auditsListCache";

export type SharedFormsMode =
  | "selected"
  | "all"
  | "today"
  | "live_today"
  | "live_all";

export type SharedFormsLinkPayload = {
  version: 1;
  tenantSlug: string;
  tenantName?: string;
  title: string;
  mode: SharedFormsMode;
  createdAt: string;
  auditIds: string[];
};

const SHARED_FORMS_KEY = "iso-shared-forms:v1";

function toBase64Url(input: string) {
  if (typeof window === "undefined") return "";
  const encoded = window.btoa(unescape(encodeURIComponent(input)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  if (typeof window === "undefined") return "";
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  return decodeURIComponent(escape(window.atob(padded)));
}

export function buildShareTitle(
  mode: SharedFormsMode,
  tenantNameOrSlug: string,
  count: number,
) {
  if (mode === "today") return `Today's forms snapshot • ${tenantNameOrSlug}`;
  if (mode === "all") return `Shared forms snapshot • ${tenantNameOrSlug}`;
  if (mode === "live_today") return `Live today's forms • ${tenantNameOrSlug}`;
  if (mode === "live_all") return `Live saved forms • ${tenantNameOrSlug}`;
  return count === 1
    ? `Shared form • ${tenantNameOrSlug}`
    : `Selected forms • ${tenantNameOrSlug}`;
}

export function createSharedFormsLinkPayload(input: {
  tenantSlug: string;
  tenantName?: string;
  title: string;
  mode: SharedFormsMode;
  auditIds: string[];
}): SharedFormsLinkPayload {
  return {
    version: 1,
    tenantSlug: input.tenantSlug,
    tenantName: input.tenantName,
    title: input.title,
    mode: input.mode,
    createdAt: new Date().toISOString(),
    auditIds: Array.from(new Set(input.auditIds.filter(Boolean))),
  };
}

export function encodeSharedFormsPayload(payload: SharedFormsLinkPayload) {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeSharedFormsPayload(
  encoded: string,
): SharedFormsLinkPayload | null {
  try {
    const raw = fromBase64Url(encoded);
    const parsed = JSON.parse(raw) as SharedFormsLinkPayload;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.auditIds))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSharedFormsRows(
  tenantSlug: string,
  rows: CachedAuditRow[],
) {
  if (typeof window === "undefined" || !tenantSlug) return;
  try {
    localStorage.setItem(
      `${SHARED_FORMS_KEY}:${tenantSlug}`,
      JSON.stringify(rows),
    );
  } catch {
    // ignore
  }
}

export function readSharedFormsRows(tenantSlug: string): CachedAuditRow[] {
  if (typeof window === "undefined" || !tenantSlug) return [];
  try {
    const raw = localStorage.getItem(`${SHARED_FORMS_KEY}:${tenantSlug}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedAuditRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function todayAuditRows(rows: CachedAuditRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return rows.filter((row) => {
    const submittedAt = row.submittedAt || row.updatedAt || row.createdAt;
    const date = new Date(submittedAt);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  });
}

export function buildSharedFormsHref(encoded: string) {
  return `/shared/forms?d=${encodeURIComponent(encoded)}`;
}
