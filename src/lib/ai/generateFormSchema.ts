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
import { MAX_GRID_COLUMNS } from "@/lib/formFieldConstants";
import { normalizeFormSchema } from "@/lib/normalizeFormSchema";
import { fileToBase64, geminiGenerateContent } from "@/lib/ai/gemini";
import {
  FORM_CLARIFICATION_ASSESS_PROMPT,
  FORM_ENGINE_JSON_EXAMPLE,
  FORM_ENGINE_SYSTEM_PROMPT,
} from "@/lib/ai/formEnginePrompt";
import type { AiAssessResult, AiClarificationQuestion } from "@/lib/ai/types";

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
  "display",
]);

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

function coerceFieldType(raw: unknown, gridColumn: boolean): string {
  const typeRaw = String(raw || "text").trim().toLowerCase();
  if (gridColumn && typeRaw === "dynamic-table") return "text";
  if (!FIELD_TYPES.has(typeRaw)) return "text";
  if (gridColumn && !GRID_COLUMN_TYPES.has(typeRaw)) return "text";
  return typeRaw;
}

function sanitizeSimpleField(raw: unknown, index: number, gridColumn: boolean): SimpleFieldDef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const resolvedType = coerceFieldType(obj.type, gridColumn);
  const label = String(obj.label || obj.name || `Field ${index + 1}`).trim() || `Field ${index + 1}`;

  const base = {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : makeId(resolvedType, index),
    type: resolvedType as SimpleFieldDef["type"],
    label,
    required: obj.required === true,
  };

  if (resolvedType === "temp") {
    return { ...base, type: "temp", unit: obj.unit === "F" ? "F" : "C" } as SimpleFieldDef;
  }
  if (resolvedType === "number") {
    return { ...base, type: "number", step: typeof obj.step === "number" ? obj.step : 1 } as SimpleFieldDef;
  }
  if (resolvedType === "text") {
    return {
      ...base,
      type: "text",
      multiline: obj.multiline === true,
      placeholder: typeof obj.placeholder === "string" ? obj.placeholder : undefined,
    } as SimpleFieldDef;
  }
  if (resolvedType === "display") {
    const variantRaw = String(obj.variant || "body").trim().toLowerCase();
    return {
      ...base,
      type: "display",
      content: typeof obj.content === "string" ? obj.content : label,
      variant: DISPLAY_VARIANTS.has(variantRaw as DisplayVariant) ? (variantRaw as DisplayVariant) : "body",
    } as SimpleFieldDef;
  }

  return base as SimpleFieldDef;
}

function capGridColumns(columns: SimpleFieldDef[]): SimpleFieldDef[] {
  return columns.slice(0, MAX_GRID_COLUMNS);
}

function dynamicTableToGrid(raw: Record<string, unknown>, index: number): FormSection | null {
  const columnsRaw = Array.isArray(raw.columns) ? raw.columns : [];
  const columns = capGridColumns(
    columnsRaw
      .map((col, i) => sanitizeSimpleField(col, index * 100 + i, true))
      .filter((col): col is SimpleFieldDef => Boolean(col)),
  );
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

function sanitizeSections(raw: unknown): FormSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: FormSection[] = [];

  raw.forEach((item, sectionIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const obj = item as Record<string, unknown>;
    const type = String(obj.type || "").trim().toLowerCase();

    if (type === "grid") {
      const columnsRaw = Array.isArray(obj.columns) ? obj.columns : [];
      const columns = capGridColumns(
        columnsRaw
          .map((col, i) => sanitizeSimpleField(col, sectionIndex * 100 + i, true))
          .filter((col): col is SimpleFieldDef => Boolean(col)),
      );
      if (!columns.length) return;

      const rowsRaw = obj.rows;
      const rows =
        rowsRaw === "dynamic"
          ? "dynamic"
          : Math.max(5, Math.min(60, Number(rowsRaw) || 12));

      sections.push({
        type: "grid",
        id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "form_data",
        title: typeof obj.title === "string" ? obj.title : "Data table",
        rows,
        columns,
      });
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
      const columns = (
        columnsRaw >= 2 && columnsRaw <= 4 ? columnsRaw : columnsRaw > 4 ? 4 : 1
      ) as 1 | 2 | 3 | 4;
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
      return {
        ...section,
        id: nextId(section.id || "form_data", "grid"),
        columns: section.columns.map((col, i) => ({
          ...col,
          id: nextId(col.id, col.type || `col_${i}`),
        })),
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

  return schema;
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
      "The user attached a form image AND provided instructions. Match the image structure and apply the instructions.",
      `Instructions:\n${options.prompt.trim()}`,
    );
  } else if (options.hasImage) {
    parts.push("Extract the form structure from the attached image. Match table headers, labels, and section layout.");
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
    throw new Error("Provide a description, an image, or both.");
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

export async function generateFormSchemaFromInput(input: GenerateFormSchemaInput) {
  const prompt = input.prompt?.trim() || "";
  const hasImage = Boolean(input.image);

  if (!prompt && !hasImage) {
    throw new Error("Provide a description, an image, or both.");
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

  const fallbackTitle = hasImage ? "Imported form" : "Generated form";
  return sanitizeAiFormSchema(parseJsonResponse(text), fallbackTitle);
}

/** @deprecated Use generateFormSchemaFromInput */
export async function generateFormSchemaFromPrompt(prompt: string) {
  return generateFormSchemaFromInput({ prompt });
}

/** @deprecated Use generateFormSchemaFromInput */
export async function generateFormSchemaFromImage(file: File | Blob, hint?: string) {
  return generateFormSchemaFromInput({ prompt: hint, image: file });
}
