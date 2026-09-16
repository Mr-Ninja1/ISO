import type { FieldDef, FormSchemaV1, FormSection, GridSection } from "@/types/forms";

/** Coerce stored template JSON into a safe schema for report rendering (avoids SSR 500s). */
export function normalizeFormSchema(raw: unknown): FormSchemaV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: 1, fields: [], sections: [] };
  }

  const s = raw as Record<string, unknown>;
  const fields = Array.isArray(s.fields) ? (s.fields as FormSchemaV1["fields"]) : [];
  const sections = Array.isArray(s.sections) ? normalizeSections(s.sections) : undefined;

  return {
    version: 1,
    title: typeof s.title === "string" ? s.title : undefined,
    fields,
    sections,
    meta:
      s.meta && typeof s.meta === "object" && !Array.isArray(s.meta)
        ? (s.meta as FormSchemaV1["meta"])
        : undefined,
  };
}

function normalizeGridRows(rowsRaw: unknown): GridSection["rows"] {
  if (rowsRaw === "dynamic") return "dynamic";
  if (typeof rowsRaw === "string") {
    const trimmed = rowsRaw.trim();
    if (trimmed === "dynamic") return "dynamic";
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
  }
  if (typeof rowsRaw === "number" && Number.isFinite(rowsRaw)) {
    return Math.max(1, Math.floor(rowsRaw));
  }
  return 10;
}

function normalizeSeedRows(
  raw: unknown,
  columns: GridSection["columns"],
): GridSection["seedRows"] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const columnIds = new Set(columns.map((col) => col.id));
  if (!columnIds.size) return undefined;

  const seedRows: Array<Record<string, string | number | boolean>> = [];
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const row: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!columnIds.has(key)) continue;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        row[key] = value;
      } else if (value == null) {
        continue;
      } else {
        row[key] = String(value);
      }
    }
    if (Object.keys(row).length) seedRows.push(row);
  }
  return seedRows.length ? seedRows : undefined;
}

function normalizeSections(sections: unknown[]): FormSection[] {
  const out: FormSection[] = [];

  for (const sec of sections) {
    if (!sec || typeof sec !== "object" || Array.isArray(sec)) continue;
    const row = sec as Record<string, unknown>;

    if (row.type === "grid") {
      const rows = normalizeGridRows(row.rows);
      const columns = Array.isArray(row.columns) ? (row.columns as GridSection["columns"]) : [];
      const seedRows = normalizeSeedRows(row.seedRows, columns);

      out.push({
        type: "grid",
        id: typeof row.id === "string" ? row.id : undefined,
        title: typeof row.title === "string" ? row.title : undefined,
        rows: seedRows?.length && rows !== "dynamic" ? "dynamic" : rows,
        columns,
        mergedCells: Array.isArray(row.mergedCells) ? (row.mergedCells as GridSection["mergedCells"]) : undefined,
        seedRows,
      });
      continue;
    }

    out.push({
      type: "fields",
      title: typeof row.title === "string" ? row.title : undefined,
      columns:
        row.columns === 1 || row.columns === 2 || row.columns === 3 || row.columns === 4
          ? row.columns
          : undefined,
      fields: Array.isArray(row.fields) ? (row.fields as FieldDef[]) : [],
    });
  }

  return out;
}

export function splitReportSections(schema: FormSchemaV1): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) {
    return schema.sections;
  }
  return [{ type: "fields", title: "Fields", fields: schema.fields ?? [] }];
}
