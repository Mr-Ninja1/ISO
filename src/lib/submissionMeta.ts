export function createClientSubmissionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sub_${crypto.randomUUID()}`;
  }
  return `sub_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function readClientSubmissionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const meta = (payload as Record<string, unknown>).__submissionMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const id = (meta as Record<string, unknown>).clientSubmissionId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function withClientSubmissionId<T extends Record<string, unknown>>(
  payload: T,
  clientSubmissionId: string
): T & { __submissionMeta: Record<string, unknown> } {
  const existingMeta =
    payload.__submissionMeta && typeof payload.__submissionMeta === "object" && !Array.isArray(payload.__submissionMeta)
      ? (payload.__submissionMeta as Record<string, unknown>)
      : {};

  return {
    ...payload,
    __submissionMeta: {
      ...existingMeta,
      clientSubmissionId,
    },
  };
}

const ATTEMPT_KEY_PREFIX = "iso-submit-attempt:v1:";

function attemptStorageKey(tenantSlug: string, templateId: string, draftAuditId?: string | null) {
  return `${ATTEMPT_KEY_PREFIX}${tenantSlug}:${templateId}:${draftAuditId || "new"}`;
}

/** Reuse one submission id for draft→submit→timeout→outbox retries of the same attempt. */
export function resolveClientSubmissionId(params: {
  tenantSlug: string;
  templateId: string;
  draftAuditId?: string | null;
  existingPayload?: unknown;
}): string {
  const fromPayload = readClientSubmissionId(params.existingPayload);
  if (fromPayload) {
    rememberClientSubmissionId(params.tenantSlug, params.templateId, params.draftAuditId, fromPayload);
    return fromPayload;
  }

  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(
        attemptStorageKey(params.tenantSlug, params.templateId, params.draftAuditId)
      );
      if (stored && stored.trim()) return stored.trim();
    } catch {
      // ignore
    }
  }

  const created = createClientSubmissionId();
  rememberClientSubmissionId(params.tenantSlug, params.templateId, params.draftAuditId, created);
  return created;
}

export function rememberClientSubmissionId(
  tenantSlug: string,
  templateId: string,
  draftAuditId: string | null | undefined,
  clientSubmissionId: string
) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(attemptStorageKey(tenantSlug, templateId, draftAuditId), clientSubmissionId);
  } catch {
    // ignore
  }
}

export function clearClientSubmissionAttempt(
  tenantSlug: string,
  templateId: string,
  draftAuditId?: string | null
) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(attemptStorageKey(tenantSlug, templateId, draftAuditId));
  } catch {
    // ignore
  }
}
