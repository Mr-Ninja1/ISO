import type { FieldDef, FieldType, FormSection, GridSection, SimpleFieldDef } from "@/types/forms";

type AzureWord = { content?: string };
type AzureCell = { rowIndex?: number; columnIndex?: number; content?: string };
type AzureTable = { rowCount?: number; columnCount?: number; cells?: AzureCell[] };
type AzureParagraph = { content?: string };
type AzurePage = { words?: AzureWord[] };

type AzureAnalyzeResult = {
  paragraphs?: AzureParagraph[];
  pages?: AzurePage[];
  tables?: AzureTable[];
};

function makeId(prefix: string, index: number) {
  return `${prefix}_${index}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalize(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function inferFieldType(label: string): FieldType {
  const v = label.toLowerCase();
  if (/signature|signed by|approved by/.test(v)) return "signature";
  if (/date/.test(v)) return "date";
  if (/time/.test(v)) return "time";
  if (/temp|temperature|°c|°f/.test(v)) return "temp";
  if (/checkbox|check|tick|yes\/?no|\[\s*\]/.test(v)) return "checkbox";
  if (/count|qty|quantity|number|no\./.test(v)) return "number";
  return "text";
}

function asSimpleField(label: string, index: number): FieldDef {
  const type = inferFieldType(label);
  if (type === "temp") {
    return {
      id: makeId("temp", index),
      type: "temp",
      label,
      required: false,
      unit: /°f|fahrenheit/i.test(label) ? "F" : "C",
    };
  }
  if (type === "number") {
    return {
      id: makeId("num", index),
      type: "number",
      label,
      required: false,
      step: 1,
    };
  }
  return {
    id: makeId(type, index),
    type,
    label,
    required: false,
  } as FieldDef;
}

function extractLines(result: AzureAnalyzeResult): string[] {
  const linesFromParagraphs = (result.paragraphs || [])
    .map((p) => normalize(p.content || ""))
    .filter(Boolean);

  if (linesFromParagraphs.length) return Array.from(new Set(linesFromParagraphs));

  const words = (result.pages || [])
    .flatMap((p) => p.words || [])
    .map((w) => normalize(w.content || ""))
    .filter(Boolean);

  if (!words.length) return [];
  const sentence = normalize(words.join(" "));
  return sentence ? [sentence] : [];
}

function mapTable(result: AzureAnalyzeResult): GridSection | null {
  const table = (result.tables || [])[0];
  if (!table || !Array.isArray(table.cells) || table.cells.length === 0) return null;

  const headerCells = table.cells
    .filter((c) => (c.rowIndex ?? -1) === 0)
    .sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0));

  if (!headerCells.length) return null;

  const columns: SimpleFieldDef[] = headerCells.map((c, i) => {
    const label = normalize(c.content || `Column ${i + 1}`) || `Column ${i + 1}`;
    const type = inferFieldType(label);
    if (type === "temp") {
      return {
        id: makeId("col", i + 1),
        type: "temp",
        label,
        required: false,
        unit: /°f|fahrenheit/i.test(label) ? "F" : "C",
      } as SimpleFieldDef;
    }
    if (type === "number") {
      return {
        id: makeId("col", i + 1),
        type: "number",
        label,
        required: false,
        step: 1,
      } as SimpleFieldDef;
    }
    return {
      id: makeId("col", i + 1),
      type,
      label,
      required: false,
    } as SimpleFieldDef;
  });

  const rowCount = typeof table.rowCount === "number" ? table.rowCount : 0;
  const rows = Math.max(5, Math.min(60, rowCount > 1 ? rowCount - 1 : 12));

  return {
    type: "grid",
    id: "form_data",
    title: "Log Sheet",
    rows,
    columns,
  };
}

export function mapAzureAnalyzeResultToSchema(result: AzureAnalyzeResult) {
  const lines = extractLines(result);
  const title = lines[0] || "Imported Form";

  const table = mapTable(result);
  const tableLabels = new Set((table?.columns || []).map((c) => c.label.toLowerCase()));

  const rawLabels = lines
    .slice(1)
    .map((line) => normalize(line.replace(/[:.]+$/, "")))
    .filter((line) => line.length >= 2 && line.length <= 64)
    .filter((line) => !tableLabels.has(line.toLowerCase()));

  const uniqueLabels: string[] = [];
  const seen = new Set<string>();
  for (const label of rawLabels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueLabels.push(label);
  }

  const topFields: FieldDef[] = [];
  const footerFields: FieldDef[] = [];

  uniqueLabels.forEach((label, i) => {
    const field = asSimpleField(label, i + 1);
    if (field.type === "signature") footerFields.push(field);
    else topFields.push(field);
  });

  const sections: FormSection[] = [];
  if (topFields.length) sections.push({ type: "fields", title: "Fields", fields: topFields });
  if (table) sections.push(table);
  if (footerFields.length) sections.push({ type: "fields", title: "Footer", fields: footerFields });

  if (!sections.length) {
    sections.push({
      type: "fields",
      title: "Fields",
      fields: [
        { id: makeId("text", 1), type: "text", label: "Field 1", required: false },
        { id: makeId("text", 2), type: "text", label: "Field 2", required: false },
      ],
    });
  }

  return {
    version: 1 as const,
    title,
    sections,
  };
}
