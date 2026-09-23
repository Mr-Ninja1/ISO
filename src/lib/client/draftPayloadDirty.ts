import type { FormSchemaV1, FormSection } from "@/types/forms";
import { isStaticColumn } from "@/lib/formFieldConstants";
import { buildDefaultValues } from "@/lib/schemaDrivenForm";

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

function getSections(schema: FormSchemaV1): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", fields: schema.fields ?? [] }];
}

function isActiveField(field: { isActive?: boolean }) {
  return field.isActive !== false;
}

function valuesDiffer(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) !== Boolean(b);
  const leftEmpty = a == null || a === "";
  const rightEmpty = b == null || b === "";
  if (leftEmpty && rightEmpty) return false;
  return String(a ?? "") !== String(b ?? "");
}

/**
 * True when the user has entered fill-time answers worth saving as a draft.
 * Template-owned static seed text does not count — that persists on the form schema.
 * Pass `defaults` to avoid rebuilding them on every keystroke.
 */
export function isDraftPayloadDirty(
  values: Record<string, unknown>,
  schema?: FormSchemaV1 | null,
  defaults?: Record<string, unknown> | null
): boolean {
  if (!schema) {
    for (const [key, value] of Object.entries(values)) {
      if (META_KEYS.has(key)) continue;
      if (isMeaningfulValue(value)) return true;
    }
    return false;
  }

  const baselineValues = defaults ?? buildDefaultValues(schema);

  for (const section of getSections(schema)) {
    if (section.type === "fields") {
      for (const field of section.fields.filter(isActiveField)) {
        if (field.type === "display") continue;
        const current = values[field.id];
        const baseline = baselineValues[field.id];
        if (field.type === "checkbox") {
          if (Boolean(current) !== Boolean(baseline)) return true;
          continue;
        }
        if (field.type === "photo" || field.type === "dynamic-table") {
          if (isMeaningfulValue(current) && JSON.stringify(current) !== JSON.stringify(baseline ?? [])) {
            return true;
          }
          continue;
        }
        if (valuesDiffer(current, baseline) && isMeaningfulValue(current)) return true;
      }
      continue;
    }

    if (section.type === "grid") {
      const key = section.id || "form_data";
      const currentRows = Array.isArray(values[key]) ? (values[key] as Array<Record<string, unknown>>) : [];
      const baselineRows = Array.isArray(baselineValues[key])
        ? (baselineValues[key] as Array<Record<string, unknown>>)
        : [];
      const activeColumns = section.columns.filter(isActiveField);
      const answerColumns = activeColumns.filter((col) => !isStaticColumn(col));
      const rowCount = Math.max(currentRows.length, baselineRows.length);

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const currentRow = currentRows[rowIndex] || {};
        const baselineRow = baselineRows[rowIndex] || {};
        for (const col of answerColumns) {
          const current = currentRow[col.id];
          const baseline = baselineRow[col.id];
          if (col.type === "checkbox") {
            if (Boolean(current) !== Boolean(baseline)) return true;
            continue;
          }
          if (valuesDiffer(current, baseline) && isMeaningfulValue(current)) return true;
        }
      }
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (META_KEYS.has(key)) continue;
    if (key in baselineValues) continue;
    if (isMeaningfulValue(value)) return true;
  }

  return false;
}
