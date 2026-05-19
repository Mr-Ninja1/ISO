import type { FieldDef, FieldType, FormSection, FormType, SimpleFieldDef } from "@/types/forms";
import { COLUMN_HEADER_PLACEHOLDER } from "@/lib/formFieldConstants";

export type FormCanvasMode = "flexible" | "questions" | "checklist" | "inspection" | "handwritten";

export type FormBuilderConfig = {
  formType: FormType;
  label: string;
  description: string;
  tagline: string;
  cardIcon: string;
  canvasMode: FormCanvasMode;
  paletteTypes: Array<FieldType | "table">;
  sections: {
    header: boolean;
    table: boolean;
    footer: boolean;
  };
  sectionLabels: {
    header: string;
    table: string;
    footer: string;
  };
  headerColumnsDefault: 1 | 2 | 3 | 4;
  showQuestionTools: boolean;
  showPlacementToggle: boolean;
  showMetadataStarter: boolean;
  defaultQuestionFieldType: FieldType;
  /** Shown inline in Quick add; remaining palette types go under More tools */
  quickPaletteTypes?: Array<FieldType | "table">;
  /** Optional starter grid when user clicks "Add starter table" */
  starterGrid?: { rows: number; columns: SimpleFieldDef[] };
};

const PALETTE_QUICK_PRIORITY: Array<FieldType | "table"> = [
  "text",
  "yesno",
  "date",
  "table",
  "signature",
  "photo",
  "checkbox",
  "number",
  "display",
  "time",
  "temp",
];

export function resolvePaletteSplit(formType: FormType): {
  quickTypes: Array<FieldType | "table">;
  moreTypes: Array<FieldType | "table">;
} {
  const config = getFormBuilderConfig(formType);
  const all = config.paletteTypes;
  const quick =
    config.quickPaletteTypes ??
    PALETTE_QUICK_PRIORITY.filter((t) => all.includes(t)).slice(0, 6);
  const quickSet = new Set(quick);
  const more = all.filter((t) => !quickSet.has(t));
  return { quickTypes: quick, moreTypes: more };
}

function makeId(prefix: string) {
  try {
    const cryptoAny = crypto as Crypto & { randomUUID?: () => string };
    if (cryptoAny?.randomUUID) return `${prefix}_${cryptoAny.randomUUID()}`;
  } catch {
    // ignore
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

const ALL_PALETTE: Array<FieldType | "table"> = [
  "display",
  "text",
  "date",
  "number",
  "yesno",
  "checkbox",
  "time",
  "temp",
  "photo",
  "signature",
  "table",
];

function starterColumn(type: SimpleFieldDef["type"], label = COLUMN_HEADER_PLACEHOLDER): SimpleFieldDef {
  return { id: makeId(type), type, label, required: false };
}

const FORM_BUILDER_CONFIGS: Record<FormType, FormBuilderConfig> = {
  custom: {
    formType: "custom",
    label: "Custom",
    description: "Build any layout — header fields, log tables, and footers in any combination.",
    tagline: "Full flexibility",
    cardIcon: "clipboard",
    canvasMode: "flexible",
    paletteTypes: ALL_PALETTE,
    sections: { header: true, table: true, footer: true },
    sectionLabels: { header: "Form fields", table: "Data table", footer: "Footer" },
    headerColumnsDefault: 2,
    showQuestionTools: false,
    showPlacementToggle: true,
    showMetadataStarter: true,
    defaultQuestionFieldType: "text",
    quickPaletteTypes: ["text", "yesno", "date", "signature", "table"],
    starterGrid: {
      rows: 12,
      columns: [
        starterColumn("text", "Item"),
        starterColumn("yesno", "Status"),
        starterColumn("text", "Notes"),
        starterColumn("signature", "Verified by"),
      ],
    },
  },
  checklist: {
    formType: "checklist",
    label: "Checklist",
    description: "Row-by-row checks — ideal for opening/closing, cleaning, and safety walkthroughs.",
    tagline: "Pass / fail rows",
    cardIcon: "checklist",
    canvasMode: "checklist",
    paletteTypes: ["display", "text", "yesno", "checkbox", "date", "time", "photo", "signature", "table"],
    sections: { header: true, table: true, footer: false },
    sectionLabels: { header: "Checklist header", table: "Checklist items", footer: "Footer" },
    headerColumnsDefault: 3,
    showQuestionTools: false,
    showPlacementToggle: false,
    showMetadataStarter: false,
    defaultQuestionFieldType: "yesno",
    quickPaletteTypes: ["text", "yesno", "checkbox", "photo", "table"],
    starterGrid: {
      rows: 15,
      columns: [
        starterColumn("text", "Task / area"),
        starterColumn("yesno", "OK?"),
        starterColumn("text", "Notes"),
        starterColumn("photo", "Photo"),
      ],
    },
  },
  questionnaire: {
    formType: "questionnaire",
    label: "Questionnaire",
    description: "A vertical list of questions with typed responses (yes/no, text, dates, photos).",
    tagline: "One question at a time",
    cardIcon: "clipboard",
    canvasMode: "questions",
    paletteTypes: ["display", "text", "yesno", "checkbox", "number", "date", "time", "photo", "signature"],
    sections: { header: true, table: false, footer: false },
    sectionLabels: { header: "Questions", table: "Table", footer: "Footer" },
    headerColumnsDefault: 1,
    showQuestionTools: true,
    showPlacementToggle: false,
    showMetadataStarter: false,
    defaultQuestionFieldType: "yesno",
    quickPaletteTypes: ["text", "yesno", "date", "photo"],
  },
  "answer-sheet": {
    formType: "answer-sheet",
    label: "Answer sheet",
    description: "Written responses — training quizzes, surveys, and open-ended feedback.",
    tagline: "Multiline answers",
    cardIcon: "clipboard",
    canvasMode: "questions",
    paletteTypes: ["display", "text", "number", "date", "time", "photo", "signature"],
    sections: { header: true, table: false, footer: false },
    sectionLabels: { header: "Questions", table: "Table", footer: "Footer" },
    headerColumnsDefault: 1,
    showQuestionTools: true,
    showPlacementToggle: false,
    showMetadataStarter: false,
    defaultQuestionFieldType: "text",
    quickPaletteTypes: ["text", "date", "photo"],
  },
  inspection: {
    formType: "inspection",
    label: "Inspection log",
    description: "Site metadata plus a structured inspection table (item, frequency, status, notes).",
    tagline: "Audit-ready table",
    cardIcon: "safety",
    canvasMode: "inspection",
    paletteTypes: ["display", "text", "date", "number", "yesno", "photo", "signature", "table"],
    sections: { header: true, table: true, footer: true },
    sectionLabels: { header: "Inspection header", table: "Inspection log", footer: "Sign-off" },
    headerColumnsDefault: 2,
    showQuestionTools: false,
    showPlacementToggle: true,
    showMetadataStarter: false,
    defaultQuestionFieldType: "text",
    quickPaletteTypes: ["text", "yesno", "date", "table", "signature"],
    starterGrid: {
      rows: 10,
      columns: [
        starterColumn("text", "Item"),
        starterColumn("text", "Frequency"),
        starterColumn("yesno", "Status"),
        starterColumn("text", "Notes"),
      ],
    },
  },
  handwritten: {
    formType: "handwritten",
    label: "Handwritten capture",
    description: "Signature-style fields for stylus or finger input on tablets.",
    tagline: "Sign everywhere",
    cardIcon: "clipboard",
    canvasMode: "handwritten",
    paletteTypes: ["display", "signature", "text", "table"],
    sections: { header: true, table: true, footer: false },
    sectionLabels: { header: "Capture header", table: "Handwritten log", footer: "Footer" },
    headerColumnsDefault: 2,
    showQuestionTools: false,
    showPlacementToggle: false,
    showMetadataStarter: false,
    defaultQuestionFieldType: "signature",
    quickPaletteTypes: ["signature", "text", "table"],
    starterGrid: {
      rows: 8,
      columns: [
        starterColumn("signature", "Item"),
        starterColumn("signature", "Notes"),
        starterColumn("signature", "Status"),
      ],
    },
  },
};

export const FORM_TYPE_OPTIONS: FormType[] = [
  "custom",
  "checklist",
  "questionnaire",
  "answer-sheet",
  "inspection",
  "handwritten",
];

export function getFormBuilderConfig(formType: FormType): FormBuilderConfig {
  return FORM_BUILDER_CONFIGS[formType] ?? FORM_BUILDER_CONFIGS.custom;
}

export function parseFormType(raw: unknown): FormType {
  if (typeof raw === "string" && raw in FORM_BUILDER_CONFIGS) return raw as FormType;
  return "custom";
}

export function isSchemaEmpty(sections: FormSection[]) {
  if (!sections.length) return true;
  return sections.every((section) => {
    if (section.type === "fields") return section.fields.length === 0;
    return section.columns.length === 0;
  });
}

/** Default table block with starter columns for types that use a log grid. */
export function defaultGridSectionForType(formType: FormType): FormSection {
  const config = getFormBuilderConfig(formType);
  const rows = config.starterGrid?.rows ?? 10;
  const starterCols = config.starterGrid?.columns;
  const columns =
    starterCols && starterCols.length > 0
      ? starterCols.map((col) => ({
          id: makeId(col.type),
          type: col.type,
          label: COLUMN_HEADER_PLACEHOLDER,
          required: false,
        }))
      : [starterColumn("text"), starterColumn("text"), starterColumn("text")];

  return {
    type: "grid",
    id: "form_data",
    title: config.sectionLabels.table,
    rows,
    columns,
  };
}

/** Blank canvas — only includes blocks the user will actually see (no empty header/footer shells). */
export function blankCanvasForType(formType: FormType): FormSection[] {
  const config = getFormBuilderConfig(formType);
  if (config.sections.table) {
    return [defaultGridSectionForType(formType) as FormSection];
  }
  return [];
}

/** Optional richer starter (user-triggered, not applied on type switch). */
export function starterCanvasForType(formType: FormType): FormSection[] {
  const config = getFormBuilderConfig(formType);
  const blank = blankCanvasForType(formType);

  if (!config.starterGrid) return blank;

  return blank.map((section) => {
    if (section.type !== "grid") return section;
    return {
      ...section,
      rows: config.starterGrid!.rows,
      columns: config.starterGrid!.columns.map((col) => ({ ...col, id: makeId(col.type) })),
    };
  });
}

export function convertSectionsToHandwritten(sections: FormSection[]): FormSection[] {
  return sections.map((section) => {
    if (section.type === "fields") {
      return {
        ...section,
        fields: section.fields.map((field) => {
          if (field.type === "dynamic-table") {
            return {
              ...field,
              columns: field.columns.map((col) => ({ ...col, type: "text" as const })),
            };
          }
          return { ...field, type: "signature" as const };
        }),
      };
    }
    return {
      ...section,
      columns: section.columns.map((col) => ({ ...col, type: "signature" as const })),
    };
  });
}

export function sectionTitleForBuilder(section: FormSection, formType: FormType): "top" | "bottom" | "grid" {
  const config = getFormBuilderConfig(formType);
  if (section.type === "grid") return "grid";
  const title = (section.title || "").toLowerCase();
  if (title.includes("footer") || title === config.sectionLabels.footer.toLowerCase()) return "bottom";
  return "top";
}

export function buildSectionsFromBuilderState(
  state: {
    topFields: FieldDef[];
    topFieldsColumns: 1 | 2 | 3 | 4;
    bottomFields: FieldDef[];
    bottomFieldsColumns: 1 | 2 | 3 | 4;
    grid: { type: "grid"; id?: string; title?: string; rows: number | "dynamic"; columns: SimpleFieldDef[] } | null;
  },
  formType: FormType
): FormSection[] {
  const config = getFormBuilderConfig(formType);
  const sections: FormSection[] = [];

  if (config.sections.header && state.topFields.length > 0) {
    sections.push({
      type: "fields",
      title: config.sectionLabels.header,
      columns: state.topFieldsColumns,
      fields: state.topFields,
    });
  }

  if (config.sections.table && state.grid) {
    sections.push({
      ...state.grid,
      title: state.grid.title || config.sectionLabels.table,
    });
  }

  if (config.sections.footer && state.bottomFields.length) {
    sections.push({
      type: "fields",
      title: config.sectionLabels.footer,
      columns: state.bottomFieldsColumns,
      fields: state.bottomFields,
    });
  }

  return sections;
}
