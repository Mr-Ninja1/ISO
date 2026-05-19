import { z } from "zod";
import type { FieldDef, FormSchemaV1, FormSection, GridSection, SimpleFieldDef } from "@/types/forms";
import { buildGridRowDefaults, getGridFieldMap } from "@/lib/gridLayout";

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

function photoValueFromInput(value: unknown) {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    const next = value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return next.length ? next : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed;
  }
  return value;
}

function fieldToZod(field: FieldDef | SimpleFieldDef) {
  switch (field.type) {
    case "text": {
      const requiredInner = z.string().min(1, "Required");
      const optionalInner = z.string().optional();

      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "date": {
      const requiredInner = z.string().min(1, "Required");
      const optionalInner = z.string().optional();
      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "number": {
      let inner = z.number();
      if (typeof (field as any).min === "number") inner = inner.min((field as any).min);
      if (typeof (field as any).max === "number") inner = inner.max((field as any).max);
      return field.required
        ? z.preprocess(numberFromString, inner)
        : z.preprocess(numberFromString, inner.optional());
    }
    case "temp": {
      let inner = z.number();
      if (typeof field.min === "number") inner = inner.min(field.min);
      if (typeof field.max === "number") inner = inner.max(field.max);

      return field.required
        ? z.preprocess(numberFromString, inner)
        : z.preprocess(numberFromString, inner.optional());
    }
    case "signature": {
      const requiredInner = z.string().min(1, "Required");
      const optionalInner = z.string().optional();

      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "photo": {
      const single = z.string().min(1, "Required");
      const multiple = z.array(z.string().min(1, "Required")).min(1, "Attach at least one photo");
      const requiredInner = z.union([single, multiple]);
      const optionalInner = z.union([z.string(), z.array(z.string())]).optional();
      return field.required
        ? z.preprocess(photoValueFromInput, requiredInner)
        : z.preprocess(photoValueFromInput, optionalInner);
    }
    case "checkbox": {
      const inner = z.boolean();
      return field.required ? inner : inner.optional();
    }
    case "yesno": {
      const requiredInner = z.enum(["yes", "no"]);
      const optionalInner = z.enum(["yes", "no"]).optional();
      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "time": {
      const requiredInner = z.string().min(1, "Required");
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
    case "display": {
      return z.any().optional();
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

/** Display labels are read-only; they are not part of submitted audit data. */
function isInputField(field: FieldDef | SimpleFieldDef) {
  return field.type !== "display";
}

function gridToZod(grid: GridSection) {
  const rowCount = typeof grid.rows === "number" && Number.isFinite(grid.rows) ? Math.max(1, grid.rows) : 1;
  const rowShape: Record<string, z.ZodTypeAny> = {};
  const fieldMap = getGridFieldMap({ ...grid, columns: grid.columns.filter(isActiveField) }, rowCount);

  for (const field of fieldMap.values()) {
    rowShape[field.id] = fieldToZod(field);
  }

  let rowObj = z.object(rowShape);
  if (grid.mergedCells && grid.mergedCells.length > 0) {
    rowObj = rowObj.partial();
  }

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
      for (const field of section.fields.filter(isActiveField).filter(isInputField)) {
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
      for (const field of section.fields.filter(isActiveField).filter(isInputField)) {
        if (field.type === "dynamic-table") defaults[field.id] = [];
        else if (field.type === "checkbox") defaults[field.id] = false;
        else if (field.type === "photo") defaults[field.id] = [];
        else defaults[field.id] = "";
      }
    }

    if (section.type === "grid") {
      const key = section.id || "form_data";
      const activeColumns = section.columns.filter(isActiveField);
      const count = section.rows === "dynamic" ? 1 : Math.max(0, section.rows);
      defaults[key] = Array.from({ length: count }, (_, rowIndex) =>
        buildGridRowDefaults({ ...section, columns: activeColumns }, rowIndex, count)
      );
    }
  }

  return defaults;
}
