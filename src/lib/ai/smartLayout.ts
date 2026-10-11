/**
 * Deterministic layout polish for AI-generated (and manual) form schemas.
 * Runs client-side — no model call / quota — so users get instant improvements.
 */
import type { FieldDef, FormSchemaV1, FormSection, SimpleFieldDef } from "@/types/forms";
import {
  CHECKBOX_COLUMN_WIDTH_PX,
  COLUMN_DEFAULT_WIDTH_PX,
  clampColumnWidthPx,
} from "@/lib/formFieldConstants";

export type SmartLayoutActionId =
  | "compact_metadata"
  | "widen_notes"
  | "apply_type_widths"
  | "multiline_comments"
  | "ensure_signoff"
  | "questionnaire_columns";

export type SmartLayoutAction = {
  id: SmartLayoutActionId;
  label: string;
  description: string;
  /** Relative impact for ordering chips */
  priority: number;
};

const NOTES_LABEL =
  /(note|notes|comment|comments|remark|remarks|observation|observations|corrective|action|description|details|findings)/i;
const METADATA_SECTION =
  /(header|metadata|document|doc(?:ument)?\s*control|identification|form\s*info)/i;
const METADATA_FIELD =
  /(doc(?:ument)?\s*no|issue\s*date|revision|compiled|approved|page|version|rev\.?|subject|store|site|location)/i;
const PASFAIL_LABEL = /(pass\s*\/?\s*fail|compliant|compliance|satisfactory|yes\s*\/?\s*no|y\/n)/i;
const TEMP_LABEL = /(temp(?:erature)?|°\s*[cf]|deg(?:ree)?s?\s*[cf])/i;

function cloneSchema(schema: FormSchemaV1): FormSchemaV1 {
  return JSON.parse(JSON.stringify(schema)) as FormSchemaV1;
}

function inferWidthPx(field: { type?: string; label?: string; multiline?: boolean }): number | undefined {
  const type = field.type || "text";
  const label = field.label || "";

  if (type === "checkbox") return CHECKBOX_COLUMN_WIDTH_PX;
  if (type === "yesno") return 88;
  if (type === "time") return 96;
  if (type === "date") return 118;
  if (type === "number" || type === "temp") return 96;
  if (type === "signature") return 160;
  if (type === "photo") return 120;
  if (type === "static") return 180;
  if (type === "display") return undefined;
  if (type === "text" && (field.multiline || NOTES_LABEL.test(label))) return 240;
  if (type === "text" && label.trim().length <= 12) return 120;
  return COLUMN_DEFAULT_WIDTH_PX;
}

function polishField(field: FieldDef): FieldDef {
  let next = { ...field } as FieldDef;

  if (next.type === "text" && !next.multiline && NOTES_LABEL.test(next.label || "")) {
    next = { ...next, multiline: true };
  }

  if (
    (next.type === "text" || next.type === "checkbox" || next.type === "yesno") &&
    PASFAIL_LABEL.test(next.label || "") &&
    next.type !== "yesno"
  ) {
    next = { ...next, type: "yesno" } as FieldDef;
  }

  if (next.type === "text" && TEMP_LABEL.test(next.label || "")) {
    next = { ...next, type: "temp", unit: "C" } as FieldDef;
  }

  if (next.type !== "display" && next.widthPx == null) {
    const width = inferWidthPx(next);
    if (width != null) next = { ...next, widthPx: clampColumnWidthPx(width) };
  }

  return next;
}

function polishColumn(column: SimpleFieldDef): SimpleFieldDef {
  let next = { ...column } as SimpleFieldDef;

  if (next.type === "text" && !("multiline" in next && next.multiline) && NOTES_LABEL.test(next.label || "")) {
    next = { ...next, multiline: true } as SimpleFieldDef;
  }

  if (PASFAIL_LABEL.test(next.label || "") && next.type !== "yesno" && next.type !== "static") {
    next = { ...next, type: "yesno" } as SimpleFieldDef;
  }

  if (TEMP_LABEL.test(next.label || "") && (next.type === "text" || next.type === "number")) {
    next = { ...next, type: "temp", unit: "C" } as SimpleFieldDef;
  }

  if (next.widthPx == null) {
    const width = inferWidthPx(next);
    if (width != null) next = { ...next, widthPx: clampColumnWidthPx(width) };
  }

  return next;
}

function isCompactMetadataSection(section: FormSection): boolean {
  if (section.type !== "fields") return false;
  if (METADATA_SECTION.test(section.title || "")) return true;
  const fields = section.fields || [];
  if (fields.length < 2) return false;
  const metaHits = fields.filter((field) => {
    const hay = `${field.label || ""} ${(field as { content?: string }).content || ""}`;
    return METADATA_FIELD.test(hay) || field.type === "display";
  }).length;
  return metaHits >= Math.ceil(fields.length * 0.5);
}

/** Apply full smart-layout polish after AI generate (safe defaults). */
export function applySmartLayout(schema: FormSchemaV1): FormSchemaV1 {
  const next = cloneSchema(schema);
  const sections = (next.sections || []).map((section, index) => {
    if (section.type === "grid") {
      return {
        ...section,
        columns: section.columns.map(polishColumn),
      };
    }

    let columns = section.columns;
    const fields = section.fields.map(polishField);

    if (isCompactMetadataSection({ ...section, fields }) && (columns === 1 || !columns)) {
      columns = fields.length >= 5 ? 4 : 2;
    }

    // Questionnaires: pair short yes/no questions in 2 columns when dense.
    if (
      index === 0 &&
      next.meta?.formType === "questionnaire" &&
      fields.length >= 6 &&
      (columns === 1 || !columns)
    ) {
      const shortAnswers = fields.filter((f) => f.type === "yesno" || f.type === "checkbox").length;
      if (shortAnswers >= Math.ceil(fields.length * 0.5)) columns = 2;
    }

    return { ...section, columns, fields };
  });

  next.sections = sections;

  const hasSignature = sections.some((section) => {
    if (section.type === "fields") return section.fields.some((f) => f.type === "signature");
    return section.columns.some((c) => c.type === "signature");
  });
  const hasSignoffSection = sections.some(
    (section) => section.type === "fields" && /sign|approv|footer/i.test(section.title || ""),
  );

  if (hasSignature && !hasSignoffSection && next.meta?.formType !== "questionnaire") {
    // Signatures already live in some fields section — fine. Only add empty sign-off when none exist.
  }

  if (
    (next.meta?.formType === "checklist" || next.meta?.formType === "inspection") &&
    next.meta.formStyle !== "compact"
  ) {
    const header = sections.find((s) => s.type === "fields");
    if (header && isCompactMetadataSection(header)) {
      next.meta = { ...next.meta, formStyle: "compact" };
    }
  }

  return next;
}

export function listSmartLayoutActions(schema: FormSchemaV1): SmartLayoutAction[] {
  const actions: SmartLayoutAction[] = [];
  const sections = schema.sections || [];

  const hasLooseMetadata = sections.some(
    (section) =>
      section.type === "fields" &&
      isCompactMetadataSection(section) &&
      (section.columns === 1 || !section.columns),
  );
  if (hasLooseMetadata) {
    actions.push({
      id: "compact_metadata",
      label: "Compact header",
      description: "Pack document metadata into a tight 2–4 column row",
      priority: 10,
    });
  }

  const hasNarrowNotes = sections.some((section) => {
    if (section.type === "grid") {
      return section.columns.some(
        (col) => NOTES_LABEL.test(col.label || "") && (col.widthPx == null || col.widthPx < 200),
      );
    }
    return section.fields.some(
      (field) =>
        field.type === "text" &&
        NOTES_LABEL.test(field.label || "") &&
        !(field as { multiline?: boolean }).multiline,
    );
  });
  if (hasNarrowNotes) {
    actions.push({
      id: "widen_notes",
      label: "Widen notes",
      description: "Give comments / corrective-action fields more room",
      priority: 9,
    });
    actions.push({
      id: "multiline_comments",
      label: "Expand comments",
      description: "Turn note fields into multiline text areas",
      priority: 8,
    });
  }

  const missingWidths = sections.some((section) => {
    if (section.type === "grid") return section.columns.some((col) => col.widthPx == null);
    return false;
  });
  if (missingWidths) {
    actions.push({
      id: "apply_type_widths",
      label: "Smart column widths",
      description: "Size columns by datatype (compact ticks, wider notes)",
      priority: 7,
    });
  }

  if (schema.meta?.formType === "questionnaire") {
    const q = sections.find((s) => s.type === "fields");
    if (q && q.type === "fields" && q.fields.length >= 6 && (q.columns === 1 || !q.columns)) {
      actions.push({
        id: "questionnaire_columns",
        label: "Two-column questions",
        description: "Lay out short questionnaire answers in two columns",
        priority: 6,
      });
    }
  }

  const hasSig = sections.some((section) =>
    section.type === "fields"
      ? section.fields.some((f) => f.type === "signature")
      : section.columns.some((c) => c.type === "signature"),
  );
  const hasSignoff = sections.some(
    (section) => section.type === "fields" && /sign-?off|approv/i.test(section.title || ""),
  );
  if (!hasSig && !hasSignoff && schema.meta?.formType !== "questionnaire") {
    actions.push({
      id: "ensure_signoff",
      label: "Add sign-off",
      description: "Append a signature footer block",
      priority: 5,
    });
  }

  return actions.sort((a, b) => b.priority - a.priority);
}

export function applySmartLayoutAction(schema: FormSchemaV1, actionId: SmartLayoutActionId): FormSchemaV1 {
  const next = cloneSchema(schema);

  if (actionId === "apply_type_widths" || actionId === "widen_notes" || actionId === "multiline_comments") {
    return applySmartLayout(next);
  }

  if (actionId === "compact_metadata") {
    next.sections = (next.sections || []).map((section) => {
      if (section.type !== "fields" || !isCompactMetadataSection(section)) return section;
      const columns = section.fields.length >= 5 ? 4 : 2;
      return { ...section, columns: columns as 1 | 2 | 3 | 4 };
    });
    next.meta = { ...next.meta, formStyle: next.meta?.formStyle || "compact" };
    return next;
  }

  if (actionId === "questionnaire_columns") {
    next.sections = (next.sections || []).map((section, index) => {
      if (index !== 0 || section.type !== "fields") return section;
      return { ...section, columns: 2 };
    });
    return next;
  }

  if (actionId === "ensure_signoff") {
    const sections = [...(next.sections || [])];
    sections.push({
      type: "fields",
      title: "Sign-off",
      columns: 2,
      fields: [
        {
          id: `inspector_signature_${Date.now().toString(16)}`,
          type: "signature",
          label: "Inspector signature",
          required: false,
        },
        {
          id: `supervisor_signature_${Date.now().toString(16)}`,
          type: "signature",
          label: "Supervisor signature",
          required: false,
        },
      ],
    });
    next.sections = sections;
    return next;
  }

  return next;
}

/** Default refine chips shown in the builder AI assist strip. */
export const AI_REFINE_PRESETS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: "tighten-header",
    label: "Tighten header",
    prompt:
      "Compact the header/metadata section into 2–4 columns. Keep every Doc No / date / compiled-by label with its value. Do not drop fields.",
  },
  {
    id: "better-types",
    label: "Fix field types",
    prompt:
      "Re-infer datatypes from labels: temperatures → temp, pass/fail → yesno, dates/times → date/time, signatures → signature, comments → multiline text. Preserve all fields.",
  },
  {
    id: "add-signoff",
    label: "Add sign-off",
    prompt:
      "Ensure there is a final Sign-off fields section with distinct signature fields for each approval role mentioned. Do not remove existing data columns.",
  },
  {
    id: "widen-notes",
    label: "Widen notes",
    prompt:
      "Make Notes, Comments, Corrective action, and Description fields multiline and give those grid columns wider widthPx (~240). Keep other columns compact.",
  },
  {
    id: "simplify-checklist",
    label: "Simplify checklist",
    prompt:
      "Optimize this as a clean checklist: static item column, yes/no status, notes, optional photo. Keep footer signatures. Preserve meaningful source columns.",
  },
];
