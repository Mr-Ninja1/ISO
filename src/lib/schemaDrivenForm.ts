import { z } from "zod";
import type { FieldDef, FormSchemaV1, FormSection, GridSection, SimpleFieldDef } from "@/types/forms";

function emptyStringToUndefined(value: unknown) {
  if (value === "") return undefined;
  return value;
}

function numberFromString(value: unknown) {
  if (value === "" || value == null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function fieldToZod(field: FieldDef | SimpleFieldDef) {
  switch (field.type) {
    case "text": {
      const requiredInner = z
        .string({ required_error: "Required", invalid_type_error: "Required" })
        .min(1, "Required");
      const optionalInner = z.string().optional();

      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "date": {
      const requiredInner = z
        .string({ required_error: "Required", invalid_type_error: "Required" })
        .min(1, "Required");
      const optionalInner = z.string().optional();
      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "number": {
      let inner = z.number({ required_error: "Required", invalid_type_error: "Required" });
      if (typeof (field as any).min === "number") inner = inner.min((field as any).min);
      if (typeof (field as any).max === "number") inner = inner.max((field as any).max);
      return field.required
        ? z.preprocess(numberFromString, inner)
        : z.preprocess(numberFromString, inner.optional());
    }
    case "temp": {
      let inner = z.number({ required_error: "Required", invalid_type_error: "Required" });
      if (typeof field.min === "number") inner = inner.min(field.min);
      if (typeof field.max === "number") inner = inner.max(field.max);

      return field.required
        ? z.preprocess(numberFromString, inner)
        : z.preprocess(numberFromString, inner.optional());
    }
    case "signature": {
      const requiredInner = z
        .string({ required_error: "Required", invalid_type_error: "Required" })
        .min(1, "Required");
      const optionalInner = z.string().optional();

      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "checkbox": {
      const inner = z.boolean({ required_error: "Required", invalid_type_error: "Required" });
      return field.required ? inner : inner.optional();
    }
    case "time": {
      const requiredInner = z
        .string({ required_error: "Required", invalid_type_error: "Required" })
        .min(1, "Required");
      const optionalInner = z.string().optional();
      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "dynamic-table": {
      const row = z.record(z.string(), z.any());
      const base = z.array(row);
      return field.required ? base.min(1, "Add at least one row") : base.optional();
    }
    default: {
      // Exhaustive check
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _never: never = field;
      return z.any();
    }
  }
}

function getSections(schema: FormSchemaV1): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", fields: schema.fields ?? [] }];
}

function isActiveField(field: { isActive?: boolean }) {
  return field.isActive !== false;
}

function gridRowDefaults(grid: GridSection, rowIndex: number) {
  const row: Record<string, unknown> = {};
  for (const col of grid.columns) {
    if (col.type === "checkbox") {
      row[col.id] = false;
      continue;
    }

    // Common ISO log pattern: read-only day column.
    if (col.readOnly && col.id === "day") {
      row[col.id] = String(rowIndex + 1);
      continue;
    }

    row[col.id] = "";
  }
  return row;
}

function gridToZod(grid: GridSection) {
  const rowShape: Record<string, z.ZodTypeAny> = {};
  for (const col of grid.columns) {
    rowShape[col.id] = fieldToZod(col);
  }

  const rowObj = z.object(rowShape);
  const arr = z.array(rowObj);
  if (grid.rows === "dynamic") return arr.min(1, "Add at least one row");
  if (typeof grid.rows === "number" && Number.isFinite(grid.rows) && grid.rows >= 0) {
    return arr.length(grid.rows);
  }
  return arr;
}


export function buildZodSchema(schema: FormSchemaV1) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const section of getSections(schema)) {
    if (section.type === "fields") {
      for (const field of section.fields.filter(isActiveField)) {
        shape[field.id] = fieldToZod(field);
      }
    }

    if (section.type === "grid") {
      const key = section.id || "form_data";
      shape[key] = gridToZod({ ...section, columns: section.columns.filter(isActiveField) });
    }
  }

  return z.object(shape);
}

export function buildDefaultValues(schema: FormSchemaV1) {
  const defaults: Record<string, unknown> = {};

  for (const section of getSections(schema)) {
    if (section.type === "fields") {
      for (const field of section.fields.filter(isActiveField)) {
        if (field.type === "dynamic-table") defaults[field.id] = [];
        else if (field.type === "checkbox") defaults[field.id] = false;
        else defaults[field.id] = "";
      }
    }

    if (section.type === "grid") {
      const key = section.id || "form_data";
      const activeColumns = section.columns.filter(isActiveField);
      const count = section.rows === "dynamic" ? 1 : Math.max(0, section.rows);
      defaults[key] = Array.from({ length: count }, (_, rowIndex) =>
        gridRowDefaults({ ...section, columns: activeColumns }, rowIndex)
      );
    }
  }

  return defaults;
}
