import { z } from "zod";
import type { FieldDef, FormSchemaV1 } from "@/types/forms";

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

function fieldToZod(field: FieldDef) {
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


export function buildZodSchema(schema: FormSchemaV1) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of schema.fields) {
    shape[field.id] = fieldToZod(field);
  }
  return z.object(shape);
}

export function buildDefaultValues(schema: FormSchemaV1) {
  const defaults: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.type === "dynamic-table") defaults[field.id] = [];
    else defaults[field.id] = "";
  }
  return defaults;
}
