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
