import type { FieldDef, FormSchemaV1 } from "@/types/forms";
import { normalizeFormSchema, splitReportSections } from "@/lib/normalizeFormSchema";

export const DEFAULT_EVIDENCE_FIELD_ID = "__default_photo_evidence";

export type ReportEvidencePhoto = {
  src: string;
  label: string;
};

function isImageSource(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.startsWith("data:image")) return true;
  return /^https?:\/\//i.test(value);
}

function photoList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isImageSource);
  if (isImageSource(value)) return [value];
  return [];
}

/** All photo evidence in a submitted form (default bucket + photo fields + grid photos). */
export function collectReportEvidencePhotos(
  schemaRaw: unknown,
  payload: Record<string, unknown>
): ReportEvidencePhoto[] {
  const out: ReportEvidencePhoto[] = [];
  const seen = new Set<string>();

  function push(src: string, label: string) {
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push({ src, label: label.trim() || "Photo evidence" });
  }

  for (const src of photoList(payload[DEFAULT_EVIDENCE_FIELD_ID])) {
    push(src, "Photo evidence");
  }

  const schema = schemaRaw ? normalizeFormSchema(schemaRaw) : null;
  if (!schema) return out;

  for (const section of splitReportSections(schema)) {
    if (section.type === "fields") {
      for (const field of section.fields) {
        if (field.isActive === false || field.type !== "photo") continue;
        for (const src of photoList(payload[field.id])) {
          push(src, field.label || "Photo");
        }
      }
      continue;
    }

    const key = section.id || "form_data";
    const rows = Array.isArray(payload[key]) ? (payload[key] as Array<Record<string, unknown>>) : [];
    for (const row of rows) {
      for (const col of section.columns) {
        if (col.type !== "photo") continue;
        for (const src of photoList(row[col.id])) {
          push(src, `${section.title || "Log sheet"} — ${col.label || "Photo"}`);
        }
      }
    }
  }

  return out;
}

export function reportFieldSpansFullWidth(field: FieldDef): boolean {
  return field.type === "signature" || field.type === "photo" || field.type === "dynamic-table";
}

export function reportFieldCellClass(field: FieldDef, sectionColumns?: number): string {
  if (!reportFieldSpansFullWidth(field)) return "";
  if (!sectionColumns || sectionColumns <= 1) return "col-span-1";
  return "col-span-full";
}
