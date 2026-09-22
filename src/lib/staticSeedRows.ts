import type { FormSchemaV1, FormSection, GridSection } from "@/types/forms";
import { isStaticColumn } from "@/lib/formFieldConstants";

type SeedRow = Record<string, string | number | boolean>;

function getSections(schema: FormSchemaV1): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", fields: schema.fields ?? [] }];
}

function isActiveField(field: { isActive?: boolean }) {
  return field.isActive !== false;
}

function isEmptySeedValue(value: unknown) {
  return value == null || value === "";
}

function seedRowsEqual(
  a: GridSection["seedRows"] | undefined,
  b: GridSection["seedRows"] | undefined,
): boolean {
  const left = a || [];
  const right = b || [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    const l = left[i] || {};
    const r = right[i] || {};
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    for (const key of keys) {
      if (l[key] !== r[key]) return false;
    }
  }
  return true;
}

/** Build template-owned seedRows from current grid form values (static columns only). */
export function extractStaticSeedRows(
  grid: GridSection,
  rows: unknown,
): GridSection["seedRows"] | undefined {
  const staticCols = grid.columns.filter((col) => isActiveField(col) && isStaticColumn(col));
  if (!staticCols.length || !Array.isArray(rows)) return grid.seedRows;

  const seedRows: SeedRow[] = rows.map((row) => {
    const out: SeedRow = {};
    if (!row || typeof row !== "object" || Array.isArray(row)) return out;
    const record = row as Record<string, unknown>;
    for (const col of staticCols) {
      const value = record[col.id];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[col.id] = value;
      }
    }
    return out;
  });

  while (
    seedRows.length &&
    staticCols.every((col) => isEmptySeedValue(seedRows[seedRows.length - 1]?.[col.id]))
  ) {
    seedRows.pop();
  }

  return seedRows.length ? seedRows : undefined;
}

export function schemaHasStaticColumns(schema: FormSchemaV1): boolean {
  return getSections(schema).some(
    (section) =>
      section.type === "grid" &&
      section.columns.some((col) => isActiveField(col) && isStaticColumn(col)),
  );
}

/** Return a schema copy with grid seedRows replaced by static values from the fill payload. */
export function withUpdatedStaticSeedRows(
  schema: FormSchemaV1,
  values: Record<string, unknown>,
): { schema: FormSchemaV1; changed: boolean } {
  const sections = getSections(schema);
  let changed = false;

  const nextSections = sections.map((section) => {
    if (section.type !== "grid") return section;
    if (!section.columns.some((col) => isActiveField(col) && isStaticColumn(col))) return section;

    const key = section.id || "form_data";
    const seedRows = extractStaticSeedRows(section, values[key]);
    if (seedRowsEqual(section.seedRows, seedRows)) return section;

    changed = true;
    return {
      ...section,
      rows: seedRows?.length || section.columns.some((col) => isStaticColumn(col)) ? "dynamic" : section.rows,
      seedRows,
    } as GridSection;
  });

  if (!changed) return { schema, changed: false };

  return {
    changed: true,
    schema: {
      ...schema,
      sections: nextSections,
    },
  };
}

/** Grid section patches for the lightweight seed-rows API. */
export function buildStaticSeedRowPatches(
  schema: FormSchemaV1,
  values: Record<string, unknown>,
): Array<{ sectionId: string; seedRows: GridSection["seedRows"] }> {
  const patches: Array<{ sectionId: string; seedRows: GridSection["seedRows"] }> = [];

  for (const section of getSections(schema)) {
    if (section.type !== "grid") continue;
    if (!section.columns.some((col) => isActiveField(col) && isStaticColumn(col))) continue;

    const key = section.id || "form_data";
    const seedRows = extractStaticSeedRows(section, values[key]);
    if (seedRowsEqual(section.seedRows, seedRows)) continue;

    patches.push({ sectionId: key, seedRows });
  }

  return patches;
}
