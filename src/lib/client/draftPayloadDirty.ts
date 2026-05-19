import type { FormSchemaV1 } from "@/types/forms";

function isMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return value.some((item) => isMeaningfulValue(item));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => isMeaningfulValue(v));
  }
  return false;
}

const META_KEYS = new Set(["__temperatureMeta", "__auditMeta", "__draftMeta"]);

/** True when the user has entered something worth saving as a draft. */
export function isDraftPayloadDirty(values: Record<string, unknown>, _schema?: FormSchemaV1 | null): boolean {
  for (const [key, value] of Object.entries(values)) {
    if (META_KEYS.has(key)) continue;
    if (isMeaningfulValue(value)) return true;
  }
  return false;
}
