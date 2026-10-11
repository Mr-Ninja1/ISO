import type {
  DisplayVariant,
  FieldDef,
  FormSchemaV1,
  FormSection,
  FormStyle,
  FormType,
  SimpleFieldDef,
} from "@/types/forms";
import { parseFormType } from "@/lib/formBuilderConfig";
import { normalizeFormSchema } from "@/lib/normalizeFormSchema";
import { fileToBase64, geminiGenerateContent } from "@/lib/ai/gemini";
import {
  FORM_CLARIFICATION_ASSESS_PROMPT,
  FORM_ENGINE_JSON_EXAMPLE,
  FORM_ENGINE_SYSTEM_PROMPT,
  FORM_REFINE_SYSTEM_PROMPT,
} from "@/lib/ai/formEnginePrompt";
import { applySmartLayout, listSmartLayoutActions } from "@/lib/ai/smartLayout";
import type {
  AiAssessResult,
  AiClarificationQuestion,
  AiDocumentAnalysis,
  AiExtractionSummary,
  AiSuggestedAction,
  GenerateFormSchemaResult,
  RefineFormSchemaResult,
} from "@/lib/ai/types";
import {
  CHECKBOX_COLUMN_WIDTH_PX,
  COLUMN_DEFAULT_WIDTH_PX,
  clampColumnWidthPx,
} from "@/lib/formFieldConstants";

const FIELD_TYPES = new Set([
  "text",
  "date",
  "number",
  "temp",
  "photo",
  "signature",
  "checkbox",
  "yesno",
  "time",
  "static",
  "display",
  "dynamic-table",
]);

const GRID_COLUMN_TYPES = new Set([
  "text",
  "date",
  "number",
  "temp",
  "photo",
  "signature",
  "checkbox",
  "yesno",
  "time",
  "static",
  "display",
]);

const STATIC_COLUMN_LABEL =
  /^(item|items|equipment|task|tasks|area|product|ingredient|description|uom|unit(?: of measure)?|unit of measure)$/i;

const DISPLAY_VARIANTS = new Set<DisplayVariant>(["title", "subtitle", "body", "caption", "code"]);
const FORM_TYPES = new Set<FormType>([
  "custom",
  "checklist",
  "questionnaire",
  "answer-sheet",
  "inspection",
  "handwritten",
]);
const FORM_STYLES = new Set<FormStyle>(["default", "compact", "report"]);

function makeId(prefix: string, index: number) {
  return `${prefix}_${index}_${Math.random().toString(16).slice(2, 8)}`;
}

function parseJsonResponse(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response was not valid JSON.");
    return JSON.parse(match[0]);
  }
}

function coerceFieldType(raw: unknown, gridColumn: boolean, labelText = ""): string {
  const typeRaw = String(raw || "text").trim().toLowerCase();
  const signLike = /(sign(?:ature)?|signed by|approved by|checked by|initials|sup sign|hseq sign|inspector|supervisor|manager(?: sign)?)/i.test(labelText);
  const dayLike = /(mon|tue|wed|thu|fri|sat|sun|day|week|month|year|shift|am|pm|time|date|frequency|qty|quantity|count|hours?|minutes?)/i.test(labelText);
  const tempLike = /(temp(?:erature)?|°\s*[cf]|deg(?:ree)?s?\s*[cf])/i.test(labelText);
  const passFailLike = /(pass\s*\/?\s*fail|compliant|compliance|satisfactory|yes\s*\/?\s*no|\by\/n\b)/i.test(labelText);
  const notesLike = /(note|notes|comment|comments|remark|corrective|observation|description|details|findings)/i.test(labelText);
  const initialsLike = /\b(initials?|init\.?)\b/i.test(labelText);

  // Non-grid "static" means display copy; grid "static" is a seeded column datatype.
  if (!gridColumn && (typeRaw === "label" || typeRaw === "static" || typeRaw === "instruction")) return "display";
  if (gridColumn && (typeRaw === "static" || typeRaw === "static-text" || typeRaw === "static_text")) return "static";
  if (gridColumn && typeRaw === "dynamic-table") return "text";
  if (tempLike && (typeRaw === "text" || typeRaw === "number" || !typeRaw || typeRaw === "temp")) return "temp";
  if (passFailLike && (typeRaw === "text" || typeRaw === "checkbox" || typeRaw === "yesno" || !typeRaw)) return "yesno";
  // Tight initial slots stay as text; wide sign/approval labels become signature.
  if (gridColumn && initialsLike && !/(signature|signed by|approved by)/i.test(labelText)) return "text";
  if (gridColumn && signLike && (typeRaw === "checkbox" || typeRaw === "yesno" || typeRaw === "text" || !typeRaw)) return "signature";
  if (gridColumn && typeRaw === "checkbox" && dayLike && !signLike) {
    // Day/interval columns that are clearly tick marks stay checkbox; otherwise text.
    if (/(mon|tue|wed|thu|fri|sat|sun|\d{1,2}:\d{2})/i.test(labelText)) return "checkbox";
    return "text";
  }
  if (notesLike && typeRaw === "text") return "text";
  if (!FIELD_TYPES.has(typeRaw)) return "text";
  if (gridColumn && !GRID_COLUMN_TYPES.has(typeRaw)) return "text";
  return typeRaw;
}

function inferWidthPxForField(type: string, label: string, multiline?: boolean): number | undefined {
  if (type === "checkbox") return CHECKBOX_COLUMN_WIDTH_PX;
  if (type === "yesno") return 88;
  if (type === "time") return 96;
  if (type === "date") return 118;
  if (type === "number" || type === "temp") return 96;
  if (type === "signature") return 160;
  if (type === "photo") return 120;
  if (type === "static") return 180;
  if (type === "display") return undefined;
  if (type === "text" && (multiline || /(note|comment|corrective|description|details|findings)/i.test(label))) {
    return 240;
  }
  if (type === "text" && label.trim().length <= 12) return 120;
  return COLUMN_DEFAULT_WIDTH_PX;
}

function sanitizeSimpleField(raw: unknown, index: number, gridColumn: boolean): SimpleFieldDef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const rawValue = obj.value ?? obj.staticValue ?? obj.textValue;
  const staticValueText =
    rawValue == null
      ? undefined
      : typeof rawValue === "string"
        ? rawValue.trim()
        : typeof rawValue === "number" || typeof rawValue === "boolean"
          ? String(rawValue)
          : String(rawValue).trim();

  const metadataKey = obj.name ?? obj.fieldName ?? obj.key ?? obj.title;
  const rawLabel = metadataKey ?? obj.label;
  const label = String(rawLabel || `Field ${index + 1}`).trim() || `Field ${index + 1}`;
  const labelText = typeof obj.label === "string" ? obj.label.trim() : typeof rawLabel === "string" ? rawLabel.trim() : "";
  const resolvedType = coerceFieldType(obj.type, gridColumn, labelText || label);
  const completeLabel =
    !staticValueText && !metadataKey && labelText.includes(":")
      ? labelText
      : "";

  const base = {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : makeId(resolvedType, index),
    type: resolvedType as SimpleFieldDef["type"],
    label,
    required: obj.required === true,
    readOnly: obj.readOnly === true && resolvedType !== "static" ? true : undefined,
  };

  const looksLikeCompleteStaticLabel =
    !gridColumn &&
    resolvedType === "text" &&
    label.includes(":") &&
    obj.required !== true &&
    typeof obj.placeholder !== "string";

  if ((staticValueText && (obj.name || obj.label) && !obj.content && resolvedType !== "display") || looksLikeCompleteStaticLabel) {
    const staticLabel = label.trim();
    return {
      ...base,
      type: "display",
      content: staticLabel && staticValueText && !staticLabel.includes(":")
        ? `${staticLabel}: ${staticValueText}`
        : staticLabel || staticValueText,
      variant: "body",
    } as SimpleFieldDef;
  }

  if (resolvedType === "static") {
    return {
      ...base,
      type: "static",
      widthPx: clampColumnWidthPx(
        typeof obj.widthPx === "number" ? obj.widthPx : inferWidthPxForField("static", label) || 180,
      ),
    } as SimpleFieldDef;
  }

  if (gridColumn && obj.readOnly === true && (resolvedType === "text" || resolvedType === "display")) {
    return {
      ...base,
      type: "static",
      widthPx: clampColumnWidthPx(inferWidthPxForField("static", label) || 180),
    } as SimpleFieldDef;
  }

  const widthPx =
    typeof obj.widthPx === "number" && Number.isFinite(obj.widthPx)
      ? clampColumnWidthPx(obj.widthPx)
      : inferWidthPxForField(resolvedType, label, obj.multiline === true);

  if (resolvedType === "temp") {
    return {
      ...base,
      type: "temp",
      unit: obj.unit === "F" ? "F" : "C",
      alertAbove: typeof obj.alertAbove === "number" ? obj.alertAbove : undefined,
      alertBelow: typeof obj.alertBelow === "number" ? obj.alertBelow : undefined,
      widthPx,
    } as SimpleFieldDef;
  }
  if (resolvedType === "number") {
    return {
      ...base,
      type: "number",
      step: typeof obj.step === "number" ? obj.step : 1,
      min: typeof obj.min === "number" ? obj.min : undefined,
      max: typeof obj.max === "number" ? obj.max : undefined,
      widthPx,
    } as SimpleFieldDef;
  }
  if (resolvedType === "text") {
    const multiline =
      obj.multiline === true ||
      /(note|notes|comment|comments|corrective|description|details|findings|remark)/i.test(label);
    return {
      ...base,
      type: "text",
      multiline,
      placeholder: typeof obj.placeholder === "string" ? obj.placeholder : undefined,
      widthPx: widthPx ?? inferWidthPxForField("text", label, multiline),
    } as SimpleFieldDef;
  }
  if (resolvedType === "display") {
    const variantRaw = String(obj.variant || "body").trim().toLowerCase();
    const explicitContent = typeof obj.content === "string" ? obj.content.trim() : "";
    const displayContent =
      explicitContent ||
      completeLabel ||
      (staticValueText && metadataKey && label && staticValueText !== label
        ? `${label}: ${staticValueText}`
        : staticValueText || label);
    return {
      ...base,
      type: "display",
      content: displayContent,
      variant: DISPLAY_VARIANTS.has(variantRaw as DisplayVariant) ? (variantRaw as DisplayVariant) : "body",
    } as SimpleFieldDef;
  }

  return { ...base, widthPx } as SimpleFieldDef;
}

const MAX_SEED_ROWS = 200;

function sanitizeSeedRows(
  raw: unknown,
  columns: SimpleFieldDef[],
): Array<Record<string, string | number | boolean>> | undefined {
  if (!Array.isArray(raw) || !raw.length || !columns.length) return undefined;
  const columnIds = new Set(columns.map((col) => col.id));
  const seedRows: Array<Record<string, string | number | boolean>> = [];

  for (const item of raw.slice(0, MAX_SEED_ROWS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const row: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!columnIds.has(key)) continue;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        row[key] = value;
      } else if (value != null) {
        row[key] = String(value);
      }
    }
    if (Object.keys(row).length) seedRows.push(row);
  }

  return seedRows.length ? seedRows : undefined;
}

function sanitizePrintedRows(
  raw: unknown,
  _columns: SimpleFieldDef[],
): Array<Record<string, string | number | boolean>> | undefined {
  // Ignore table cell values / printed item lists entirely. The AI should create the
  // structure and leave the actual content for the user to paste into the builder later.
  void raw;
  return undefined;
}

function dynamicTableToGrid(raw: Record<string, unknown>, index: number): FormSection | null {
  const columnsRaw = Array.isArray(raw.columns) ? raw.columns : [];
  const columns = columnsRaw
    .map((col, i) => sanitizeSimpleField(col, index * 100 + i, true))
    .filter((col): col is SimpleFieldDef => Boolean(col));
  if (!columns.length) return null;

  return {
    type: "grid",
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "form_data",
    title: typeof raw.label === "string" ? raw.label : typeof raw.title === "string" ? raw.title : "Data table",
    rows: "dynamic",
    columns,
  };
}

function sanitizeField(raw: unknown, index: number): FieldDef | FormSection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const typeRaw = String(obj.type || "text").trim().toLowerCase();

  if (typeRaw === "dynamic-table") {
    return dynamicTableToGrid(obj, index);
  }

  const simple = sanitizeSimpleField(raw, index, false);
  return simple as FieldDef;
}

function isFooterSignatureColumn(label: string): boolean {
  const text = label.trim();
  // Per-row initial slots stay in the grid as text — only move approval/sign pads out.
  if (
    /^\s*initials?\s*$/i.test(text) ||
    (/\b(initials?|init\.?)\b/i.test(text) && !/(sign|approv|checked by)/i.test(text))
  ) {
    return false;
  }
  return /(sign(?:ature)?|signed by|approved by|checked by|sup sign|hseq sign|inspector|supervisor|manager(?: sign)?)/i.test(
    text,
  );
}

function splitSignatureFooterColumns(section: FormSection): FormSection[] {
  if (section.type !== "grid") return [section];
  const signatureColumns = section.columns.filter((column) => isFooterSignatureColumn(column.label));
  if (!signatureColumns.length) return [section];

  const remainingColumns = section.columns.filter((column) => !isFooterSignatureColumn(column.label));
  if (remainingColumns.length === section.columns.length) return [section];

  const footerFields = signatureColumns.map((column) => ({
    ...column,
    type: "signature" as const,
    required: false,
  }));

  const gridSection: FormSection = {
    ...section,
    columns: remainingColumns,
    seedRows: section.seedRows,
  };

  const footerSection: FormSection = {
    type: "fields",
    title: "Sign-off",
    columns: Math.min(2, Math.max(1, footerFields.length)) as 1 | 2 | 3 | 4,
    fields: footerFields,
  };

  return [gridSection, footerSection];
}

function sanitizeSections(raw: unknown): FormSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: FormSection[] = [];

  raw.forEach((item, sectionIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const obj = item as Record<string, unknown>;
    const type = String(obj.type || "").trim().toLowerCase();

    if (type === "grid") {
      const columnsRaw = Array.isArray(obj.columns) ? obj.columns : [];
      const columns = columnsRaw
        .map((col, i) => sanitizeSimpleField(col, sectionIndex * 100 + i, true))
        .filter((col): col is SimpleFieldDef => Boolean(col));
      if (!columns.length) return;

      // Only promote a column to static when there is clear evidence — never force the
      // first column of every table into a printed-item list.
      const staticColumnId =
        columns.find((column) => column.type === "static")?.id ||
        columns.find((column) => column.readOnly)?.id ||
        columns.find((column) => STATIC_COLUMN_LABEL.test(column.label.trim()))?.id ||
        columns.find((column) =>
          /^(item|items|equipment|task|tasks|area|product|ingredient|description|uom|unit(?: of measure)?)$/i.test(
            column.label.trim(),
          ),
        )?.id;

      const normalizedColumns = columns.map((column) =>
        (staticColumnId && column.id === staticColumnId) || column.type === "static" || column.readOnly
          ? ({ ...column, type: "static" } as SimpleFieldDef)
          : column,
      );

      const hasStaticColumn = normalizedColumns.some((column) => column.type === "static");
      const detectedPrinted = Array.isArray(obj.detectedPrinted) ? obj.detectedPrinted : [];
      const rowsRaw = obj.rows;
      const rows =
        hasStaticColumn || Boolean(detectedPrinted.length)
          ? "dynamic"
          : rowsRaw === "dynamic"
            ? "dynamic"
            : Math.max(5, Math.min(60, Number(rowsRaw) || 12));

      const gridSections = splitSignatureFooterColumns({
        type: "grid",
        id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "form_data",
        title: typeof obj.title === "string" ? obj.title : "Data table",
        rows,
        columns: normalizedColumns,
        // AI builds structure only — leave seedRows empty for the user to paste/edit.
        seedRows: undefined,
      });
      sections.push(...gridSections);
      return;
    }

    const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : [];
    const fieldSections: FormSection[] = [];
    const inlineFields: FieldDef[] = [];

    fieldsRaw.forEach((field, i) => {
      const parsed = sanitizeField(field, sectionIndex * 100 + i);
      if (!parsed) return;
      if ("type" in parsed && parsed.type === "grid") {
        fieldSections.push(parsed);
        return;
      }
      inlineFields.push(parsed as FieldDef);
    });

    if (inlineFields.length) {
      const columnsRaw = Number(obj.columns);
      let columns = (
        columnsRaw >= 2 && columnsRaw <= 4 ? columnsRaw : columnsRaw > 4 ? 4 : 1
      ) as 1 | 2 | 3 | 4;

      // Paper-style headers: short labels should pack into 2–4 columns, not one tall stack.
      if (columns === 1 && inlineFields.length >= 3) {
        const shortCount = inlineFields.filter((field) => {
          if (field.type === "photo" || field.type === "signature" || field.type === "dynamic-table") {
            return false;
          }
          if (field.type === "text" && field.multiline) return false;
          const labelLen = (field.label || "").trim().length;
          if (field.type === "display") {
            const content = `${(field as { content?: string }).content || field.label || ""}`.trim();
            return content.length > 0 && content.length <= 96;
          }
          return labelLen > 0 && labelLen <= 28;
        }).length;
        if (shortCount >= Math.ceil(inlineFields.length * 0.6)) {
          columns = inlineFields.length >= 5 ? 4 : 2;
        }
      }

      sections.push({
        type: "fields",
        title: typeof obj.title === "string" ? obj.title : "Fields",
        columns,
        fields: inlineFields,
      });
    }

    fieldSections.forEach((sec) => sections.push(sec));
  });

  return sections;
}

function ensureUniqueIds(sections: FormSection[]): FormSection[] {
  const used = new Set<string>();

  function nextId(preferred: string, fallbackPrefix: string) {
    let id = preferred.trim() || makeId(fallbackPrefix, used.size);
    let n = 1;
    while (used.has(id)) {
      id = `${preferred}_${n}`;
      n += 1;
    }
    used.add(id);
    return id;
  }

  return sections.map((section) => {
    if (section.type === "grid") {
      const idMap = new Map<string, string>();
      const columns = section.columns.map((col, i) => {
        const nextColId = nextId(col.id, col.type || `col_${i}`);
        if (col.id !== nextColId) idMap.set(col.id, nextColId);
        return {
          ...col,
          id: nextColId,
        };
      });

      const seedRows = section.seedRows?.map((row) => {
        if (!idMap.size) return row;
        const remapped: Record<string, string | number | boolean> = {};
        for (const [key, value] of Object.entries(row)) {
          remapped[idMap.get(key) || key] = value;
        }
        return remapped;
      });

      return {
        ...section,
        id: nextId(section.id || "form_data", "grid"),
        columns,
        seedRows,
      };
    }

    return {
      ...section,
      fields: section.fields.map((field, i) => ({
        ...field,
        id: nextId(field.id, field.type || `field_${i}`),
      })),
    };
  });
}

function parseMeta(raw: unknown): FormSchemaV1["meta"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { formType: "custom" };
  const obj = raw as Record<string, unknown>;
  const formTypeRaw = String(obj.formType || "custom").trim() as FormType;
  const formType = FORM_TYPES.has(formTypeRaw) ? formTypeRaw : "custom";
  const formStyleRaw = String(obj.formStyle || "default").trim() as FormStyle;
  const formStyle = FORM_STYLES.has(formStyleRaw) ? formStyleRaw : "default";

  return { formType, formStyle };
}

export function sanitizeAiFormSchema(raw: unknown, fallbackTitle = "Generated form"): FormSchemaV1 {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const title = String(obj.title || fallbackTitle).trim() || fallbackTitle;
  const meta = parseMeta(obj.meta);

  let sections = sanitizeSections(obj.sections);
  if (!sections.length && Array.isArray(obj.fields)) {
    sections = sanitizeSections([{ type: "fields", title: "Fields", columns: 1, fields: obj.fields }]);
  }

  if (!sections.length) {
    sections = [
      {
        type: "fields",
        title: "Fields",
        columns: 1,
        fields: [{ id: makeId("text", 1), type: "text", label: "Notes", required: false }],
      },
    ];
  }

  sections = ensureUniqueIds(sections);

  const schema = normalizeFormSchema({
    version: 1,
    title,
    sections,
    meta,
  });

  schema.meta = {
    ...schema.meta,
    formType: parseFormType(schema.meta?.formType ?? meta?.formType),
    formStyle: FORM_STYLES.has((schema.meta?.formStyle as FormStyle) || "default")
      ? (schema.meta?.formStyle as FormStyle)
      : "default",
  };

  return applySmartLayout(schema);
}

function buildSuggestedActions(
  schema: FormSchemaV1,
  extraction: AiExtractionSummary,
): AiSuggestedAction[] {
  const fromModel = Array.isArray((extraction as { suggestedActions?: unknown }).suggestedActions)
    ? ((extraction as { suggestedActions?: unknown[] }).suggestedActions || [])
        .map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const obj = item as Record<string, unknown>;
          const label = String(obj.label || "").trim();
          if (!label) return null;
          const id = String(obj.id || `action_${index + 1}`)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
          return {
            id: id || `action_${index + 1}`,
            label,
            description: typeof obj.description === "string" ? obj.description.trim() : undefined,
            refinePrompt: typeof obj.refinePrompt === "string" ? obj.refinePrompt.trim() : undefined,
          } as AiSuggestedAction;
        })
        .filter((item): item is AiSuggestedAction => Boolean(item))
        .slice(0, 4)
    : [];

  const local: AiSuggestedAction[] = listSmartLayoutActions(schema).slice(0, 4).map((action) => ({
    id: action.id,
    label: action.label,
    description: action.description,
    localAction: action.id,
  }));

  if (extraction.staticColumns?.length) {
    local.unshift({
      id: "paste_static_items",
      label: "Add printed items",
      description: `Open the builder and use Edit static items for “${extraction.staticColumns[0]}”`,
    });
  }

  const merged: AiSuggestedAction[] = [];
  const seen = new Set<string>();
  for (const action of [...local, ...fromModel]) {
    const key = action.id || action.label;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(action);
    if (merged.length >= 5) break;
  }
  return merged;
}

export function looksLikeMeaningfulFormRequest(prompt: string): boolean {
  const cleaned = prompt
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return false;

  const words = cleaned.split(/\s+/).filter((word) => word.length > 1);
  if (words.length < 2) return false;

  const weakPhrases = /(asdf|qwer|zxcv|lorem|ipsum|test test|blah|junk|random|garbage|xxxxx+)/i;
  if (weakPhrases.test(cleaned)) return false;

  const nonsenseWordCount = words.filter((word) => !/[aeiou]/i.test(word) && word.length <= 3).length;
  if (words.length >= 4 && nonsenseWordCount >= Math.max(2, Math.ceil(words.length * 0.6))) return false;

  return true;
}

function buildAssessPromptParts(options: { prompt?: string; hasImage?: boolean }) {
  const parts: string[] = [FORM_CLARIFICATION_ASSESS_PROMPT, ""];

  if (options.hasImage && options.prompt?.trim()) {
    parts.push("The user attached a reference image/PDF and a description.", `Description:\n${options.prompt.trim()}`);
  } else if (options.hasImage) {
    parts.push("The user attached a reference image/PDF only (no extra description).");
  } else if (options.prompt?.trim()) {
    parts.push(`User description (text only — ask clarifying questions if needed):\n${options.prompt.trim()}`);
  }

  parts.push("", "Respond with JSON only.");
  return parts.join("\n");
}

function buildUserPromptParts(options: {
  prompt?: string;
  hasImage?: boolean;
  clarifications?: Record<string, string>;
}) {
  const parts: string[] = [FORM_ENGINE_SYSTEM_PROMPT, "", `Example output:\n${FORM_ENGINE_JSON_EXAMPLE}`, ""];

  if (options.hasImage && options.prompt?.trim()) {
    parts.push(
      "The user attached a source PDF/image AND provided instructions. Preserve all meaningful information from the document and apply the instructions.",
      `Instructions:\n${options.prompt.trim()}`,
    );
  } else if (options.hasImage) {
    parts.push(
      "Extract an information-preserving digital form from the attached PDF/image. Prefer one primary grid for repeated rows/item lists. Preserve every meaningful data column and never silently drop a table column when simplifying. Only mark printed item/UOM columns as type \"static\". Do NOT fill seedRows with long item lists — the user adds those in the builder. Include an extraction summary with staticItemCount when a printed list was detected.",
    );
  } else if (options.prompt?.trim()) {
    parts.push(`User request:\n${options.prompt.trim()}`);
  }

  const clarificationEntries = Object.entries(options.clarifications || {}).filter(([, value]) => value.trim());
  if (clarificationEntries.length) {
    parts.push("", "Additional clarifications from the user:");
    clarificationEntries.forEach(([key, value]) => {
      parts.push(`- ${key}: ${value.trim()}`);
    });
  }

  parts.push("", "Respond with JSON only.");
  return parts.join("\n");
}

function sanitizeClarificationQuestions(raw: unknown): AiClarificationQuestion[] {
  if (!Array.isArray(raw)) return [];

  const questions: AiClarificationQuestion[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const question = String(obj.question || "").trim();
    if (!question) continue;

    const idRaw = String(obj.id || question).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const id = idRaw.replace(/^_|_$/g, "") || `question_${questions.length + 1}`;
    const inputTypeRaw = String(obj.inputType || "text").trim().toLowerCase();
    const inputType =
      inputTypeRaw === "number" || inputTypeRaw === "choice" ? inputTypeRaw : ("text" as const);

    const options = Array.isArray(obj.options)
      ? obj.options.map((opt) => String(opt).trim()).filter(Boolean).slice(0, 6)
      : undefined;

    questions.push({
      id,
      question,
      hint: typeof obj.hint === "string" ? obj.hint.trim() : undefined,
      inputType: inputType === "choice" && options?.length ? "choice" : inputType,
      options: inputType === "choice" && options?.length ? options : undefined,
      defaultValue: typeof obj.defaultValue === "string" ? obj.defaultValue.trim() : undefined,
    });
  }

  return questions;
}

function parseAssessResponse(raw: unknown): AiAssessResult {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const statusRaw = String(obj.status || "").trim().toLowerCase();
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : undefined;
  const questions = sanitizeClarificationQuestions(obj.questions);

  if (statusRaw === "rejected") {
    const rejectedSummary = summary || "This document does not appear to contain a readable data-capture form.";
    const suggestion = typeof obj.suggestion === "string" ? obj.suggestion.trim() : undefined;
    return { status: "rejected", summary: rejectedSummary, suggestion };
  }

  if (statusRaw === "needs_clarification" && questions.length) {
    return { status: "needs_clarification", summary, questions };
  }

  return { status: "ready", summary };
}

async function buildGeminiParts(input: {
  text: string;
  image?: File | Blob;
}): Promise<Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>> {
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [{ text: input.text }];
  if (input.image) {
    const { mimeType, data } = await fileToBase64(input.image);
    parts.push({ inline_data: { mime_type: mimeType, data } });
  }
  return parts;
}

export type GenerateFormSchemaInput = {
  prompt?: string;
  image?: File | Blob;
  clarifications?: Record<string, string>;
};

export async function assessFormSchemaContext(input: GenerateFormSchemaInput): Promise<AiAssessResult> {
  const prompt = input.prompt?.trim() || "";
  const hasImage = Boolean(input.image);

  if (!prompt && !hasImage) {
    throw new Error("Provide a description, a PDF/JPG/PNG document, or both.");
  }

  const text = await geminiGenerateContent({
    parts: await buildGeminiParts({
      text: buildAssessPromptParts({ prompt, hasImage }),
      image: input.image,
    }),
    json: true,
    temperature: 0.1,
  });

  return parseAssessResponse(parseJsonResponse(text));
}

function parseDocumentAnalysis(raw: unknown): AiDocumentAnalysis | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const coverageRaw = String(obj.coverage || "").trim().toLowerCase();
  const coverage =
    coverageRaw === "complete" || coverageRaw === "partial" || coverageRaw === "uncertain"
      ? coverageRaw
      : undefined;
  const numberValue = (value: unknown, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(max, Math.floor(value)))
      : undefined;
  const confidence =
    typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
      ? Math.max(0, Math.min(1, obj.confidence))
      : undefined;
  const omittedContent = Array.isArray(obj.omittedContent)
    ? obj.omittedContent.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
    : undefined;

  const analysis: AiDocumentAnalysis = {
    pagesInspected: numberValue(obj.pagesInspected, 200),
    tablesDetected: numberValue(obj.tablesDetected, 100),
    controlsDetected: numberValue(obj.controlsDetected, 500),
    confidence,
    coverage,
    omittedContent: omittedContent?.length ? omittedContent : undefined,
  };
  return Object.values(analysis).some((value) => value !== undefined) ? analysis : undefined;
}

function parseExtractionSummary(raw: unknown, schema: FormSchemaV1): AiExtractionSummary | undefined {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  const staticColumnLabels: string[] = [];
  for (const section of schema.sections || []) {
    if (section.type !== "grid") continue;
    for (const column of section.columns) {
      if (column.type === "static" || column.readOnly) {
        const label = (column.label || column.id || "Column").trim();
        if (label && !staticColumnLabels.includes(label)) staticColumnLabels.push(label);
      }
    }
  }
  const staticColumnCount = staticColumnLabels.length;

  const staticItemCountFromSchema = (schema.sections || []).reduce((sum, section) => {
    if (section.type !== "grid" || !section.seedRows?.length) return sum;
    return sum + section.seedRows.length;
  }, 0);

  const uncertainItems = Array.isArray(obj?.uncertainItems)
    ? obj!.uncertainItems.map((item) => String(item).trim()).filter(Boolean).slice(0, 30)
    : [];
  const adaptations = Array.isArray(obj?.adaptations)
    ? obj!.adaptations.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
    : [];
  const analysis = parseDocumentAnalysis(obj?.analysis);
  let prefilledContent = Array.isArray(obj?.prefilledContent)
    ? obj!.prefilledContent.map((item) => String(item).trim()).filter(Boolean).slice(0, 30)
    : [];

  const staticItemCount =
    typeof obj?.staticItemCount === "number" && Number.isFinite(obj.staticItemCount)
      ? Math.max(0, Math.floor(obj.staticItemCount))
      : staticItemCountFromSchema || undefined;

  const namedColumns =
    staticColumnLabels.length === 0
      ? ""
      : staticColumnLabels.length === 1
        ? `"${staticColumnLabels[0]}"`
        : staticColumnLabels.slice(0, -1).map((l) => `"${l}"`).join(", ") +
          ` and "${staticColumnLabels[staticColumnLabels.length - 1]}"`;

  if (staticColumnCount > 0) {
    const tip = namedColumns
      ? `Column ${namedColumns} looks like printed fixed text (items / labels that stay the same every time). I built the table structure but skipped copying those long lists — add them in the builder with “Edit static items”, or after you save the form.`
      : "Some table columns look like printed fixed text. Add those items in the builder with “Edit static items”, or after you save the form.";
    // Replace older generic tips so the named-column message is what users see.
    prefilledContent = [
      tip,
      ...prefilledContent.filter(
        (line) => !/static item list|paste printed|static text column/i.test(line),
      ),
    ].slice(0, 30);
  }

  const summary =
    typeof obj?.summary === "string" && obj.summary.trim()
      ? obj.summary.trim()
      : staticColumnCount
        ? namedColumns
          ? `Structure ready. Column ${namedColumns} is static text — add the printed items in the builder (or after saving).`
          : `Form structure created with ${staticColumnCount} static text column${staticColumnCount === 1 ? "" : "s"}. Add printed items in the builder before publishing.`
        : staticItemCountFromSchema
          ? `Form structure created with ${staticItemCountFromSchema} static item row${staticItemCountFromSchema === 1 ? "" : "s"}. Review the builder before saving.`
          : undefined;

  if (
    !summary &&
    !analysis &&
    !adaptations.length &&
    !uncertainItems.length &&
    !prefilledContent.length &&
    !staticItemCount &&
    !staticColumnCount
  ) {
    return undefined;
  }

  const baseSummary: AiExtractionSummary = {
    summary:
      summary ||
      "Form structure was created. Review fields, tables, and any setup notes before saving.",
    analysis,
    adaptations: adaptations.length ? adaptations : undefined,
    uncertainItems: uncertainItems.length ? uncertainItems : undefined,
    prefilledContent: prefilledContent.length ? prefilledContent : undefined,
    staticItemCount,
    staticColumns: staticColumnLabels.length ? staticColumnLabels : undefined,
  };

  const suggestedActions = buildSuggestedActions(schema, {
    ...baseSummary,
    suggestedActions: Array.isArray(obj?.suggestedActions)
      ? (obj!.suggestedActions as AiSuggestedAction[])
      : undefined,
  });

  return {
    ...baseSummary,
    suggestedActions: suggestedActions.length ? suggestedActions : undefined,
  };
}

export async function generateFormSchemaFromInput(
  input: GenerateFormSchemaInput,
): Promise<GenerateFormSchemaResult> {
  const prompt = input.prompt?.trim() || "";
  const hasImage = Boolean(input.image);

  if (!prompt && !hasImage) {
    throw new Error("Provide a description, a PDF/JPG/PNG document, or both.");
  }

  const textPrompt = buildUserPromptParts({
    prompt,
    hasImage,
    clarifications: input.clarifications,
  });

  const text = await geminiGenerateContent({
    parts: await buildGeminiParts({ text: textPrompt, image: input.image }),
    json: true,
    temperature: hasImage ? 0.1 : 0.2,
  });

  const parsed = parseJsonResponse(text);
  const fallbackTitle = hasImage ? "Imported form" : "Generated form";
  const schema = sanitizeAiFormSchema(parsed, fallbackTitle);
  const rawObj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const extraction = parseExtractionSummary(rawObj.extraction, schema);

  return { schema, extraction };
}

export type RefineFormSchemaInput = {
  schema: FormSchemaV1;
  instruction: string;
};

export async function refineFormSchemaFromInput(
  input: RefineFormSchemaInput,
): Promise<RefineFormSchemaResult> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("Describe how to refine the form.");
  if (instruction.length > 2000) throw new Error("Refine instruction is too long (max 2000 characters).");

  const current = sanitizeAiFormSchema(input.schema, input.schema.title || "Form");
  const textPrompt = [
    FORM_REFINE_SYSTEM_PROMPT,
    "",
    "Current schema JSON:",
    JSON.stringify(current),
    "",
    `User instruction:\n${instruction}`,
    "",
    "Respond with JSON only.",
  ].join("\n");

  const text = await geminiGenerateContent({
    parts: [{ text: textPrompt }],
    json: true,
    temperature: 0.15,
  });

  const parsed = parseJsonResponse(text);
  const obj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const schemaRaw = obj.schema && typeof obj.schema === "object" ? obj.schema : parsed;
  const schema = sanitizeAiFormSchema(schemaRaw, current.title || "Form");
  // Preserve title if the model dropped it.
  if (!schema.title && current.title) schema.title = current.title;
  if (!schema.meta?.formType && current.meta?.formType) {
    schema.meta = { ...schema.meta, formType: current.meta.formType };
  }

  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim()
      : "Updated the form draft from your instruction.";

  return { schema, summary };
}

/** @deprecated Use generateFormSchemaFromInput */
export async function generateFormSchemaFromPrompt(prompt: string) {
  return generateFormSchemaFromInput({ prompt });
}

/** @deprecated Use generateFormSchemaFromInput */
export async function generateFormSchemaFromImage(file: File | Blob, hint?: string) {
  return generateFormSchemaFromInput({ prompt: hint, image: file });
}
