import type { FieldDef, FormStyle } from "@/types/forms";
import { displayFieldText } from "@/lib/displayFieldStyles";

/** Types that should always span the full section row. */
export function fieldSpansFullWidth(field: FieldDef): boolean {
  if (field.type === "signature" || field.type === "photo" || field.type === "dynamic-table") {
    return true;
  }
  if (field.type === "text" && field.multiline) return true;
  if (field.type === "display") {
    const text = displayFieldText(field).trim();
    const variant = field.variant || "body";
    if (variant === "title" || variant === "subtitle") return true;
    // Long instruction banners stay full width; short metadata packs into columns.
    return text.length > 96 || text.includes("\n");
  }
  return false;
}

/** Short metadata-style display (Doc No:, Rev:, Version …). */
export function isCompactDisplayField(field: FieldDef): boolean {
  if (field.type !== "display") return false;
  if (fieldSpansFullWidth(field)) return false;
  const text = displayFieldText(field).trim();
  return text.length > 0 && text.length <= 96;
}

/**
 * Short scalar inputs (Item, Min, Max, Store, dates, yes/no) that should not
 * stretch into tall paper-like boxes.
 */
export function isDenseScalarField(field: FieldDef): boolean {
  if (fieldSpansFullWidth(field)) return false;
  if (field.type === "display") return isCompactDisplayField(field);
  if (
    field.type === "number" ||
    field.type === "temp" ||
    field.type === "date" ||
    field.type === "time" ||
    field.type === "checkbox" ||
    field.type === "yesno"
  ) {
    return true;
  }
  if (field.type === "text" && !field.multiline) {
    const labelLen = (field.label || "").trim().length;
    return labelLen > 0 && labelLen <= 28;
  }
  return false;
}

export function sectionFieldsGridClass(columns?: number): string {
  // Tighter gaps + denser auto-fit so short fields pack like Word/Excel headers.
  if (columns === 2) return "grid grid-cols-1 gap-2 sm:grid-cols-2";
  if (columns === 3) return "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3";
  if (columns === 4) return "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4";
  return "grid grid-cols-1 gap-2 sm:[grid-template-columns:repeat(auto-fit,minmax(148px,1fr))]";
}

export function reportSectionFieldsGridClass(columns?: number): string {
  if (columns === 2) return "report-field-grid report-field-grid--2";
  if (columns === 3) return "report-field-grid report-field-grid--3";
  if (columns === 4) return "report-field-grid report-field-grid--4";
  return "report-field-grid report-field-grid--auto";
}

export function formStyleTokens(style: FormStyle) {
  if (style === "compact") {
    return {
      section: "gap-1.5 p-2 sm:p-2.5",
      fieldCard: "rounded-md border border-foreground/15 bg-background px-2 py-1.5",
      fieldCardDense: "rounded-md border border-foreground/12 bg-background px-2 py-1",
    };
  }
  if (style === "report") {
    return {
      section: "gap-2 p-2.5 sm:p-3",
      fieldCard: "rounded-md border border-foreground/15 bg-background px-2.5 py-1.5",
      fieldCardDense: "rounded-md border border-foreground/12 bg-background px-2 py-1",
    };
  }
  return {
    section: "gap-2 p-2.5 sm:p-3",
    fieldCard: "rounded-md border border-foreground/15 bg-background px-2.5 py-1.5",
    fieldCardDense: "rounded-md border border-foreground/12 bg-background px-2 py-1",
  };
}

export function fieldCardShellClass(field: FieldDef, style: FormStyle): string {
  const tokens = formStyleTokens(style);
  if (fieldSpansFullWidth(field)) {
    return `sm:[grid-column:1/-1] ${tokens.fieldCard}`;
  }
  if (isDenseScalarField(field) || isCompactDisplayField(field)) {
    return tokens.fieldCardDense;
  }
  return tokens.fieldCard;
}

export function reportFieldCardClass(field: FieldDef, sectionColumns?: number): string {
  const parts = ["report-field-card"];
  if (fieldSpansFullWidth(field)) {
    if (sectionColumns && sectionColumns > 1) parts.push("report-field-card--full");
  } else if (isDenseScalarField(field) || isCompactDisplayField(field)) {
    parts.push("report-field-card--dense");
  }
  if (isCompactDisplayField(field)) {
    parts.push("report-field-card--display-meta");
  }
  return parts.join(" ");
}
