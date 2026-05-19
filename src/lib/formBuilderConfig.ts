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
  /** Optional starter grid when user clicks "Add starter table" */
  starterGrid?: { rows: number; columns: SimpleFieldDef[] };
};

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

/** Blank canvas for a form type — countdown of structure, zero fields until the user adds them. */
export function blankCanvasForType(formType: FormType): FormSection[] {
  const config = getFormBuilderConfig(formType);
  const sections: FormSection[] = [];

  if (config.sections.header) {
    sections.push({
      type: "fields",
      title: config.sectionLabels.header,
      columns: config.headerColumnsDefault,
      fields: [],
    });
  }

  if (config.sections.table) {
    sections.push({
      type: "grid",
      id: "form_data",
      title: config.sectionLabels.table,
      rows: 10,
      columns: [],
    });
  }

  if (config.sections.footer) {
    sections.push({
      type: "fields",
      title: config.sectionLabels.footer,
      columns: 1,
      fields: [],
    });
  }

  return sections;
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

  if (config.sections.header) {
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
