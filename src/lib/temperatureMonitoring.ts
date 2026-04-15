import type { FormSchemaV1, FormSection } from "@/types/forms";

export type TemperatureAlert = {
  key: string;
  label: string;
  value: number;
  alertBelow?: number;
  alertAbove?: number;
  unit?: "C" | "F";
};

function getSections(schema: FormSchemaV1): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", title: "Fields", fields: schema.fields ?? [] }];
}

export function collectTemperatureAlerts(schema: FormSchemaV1, payload: Record<string, unknown>) {
  const alerts: TemperatureAlert[] = [];
  const schemaMeta = (schema as unknown as { meta?: Record<string, unknown> })?.meta || {};
  const defaultAlertBelow = typeof schemaMeta.temperatureAlertBelow === "number" ? schemaMeta.temperatureAlertBelow : undefined;
  const defaultAlertAbove = typeof schemaMeta.temperatureAlertAbove === "number" ? schemaMeta.temperatureAlertAbove : undefined;
  const defaultUnit = schemaMeta.temperatureUnit === "F" ? "F" : schemaMeta.temperatureUnit === "C" ? "C" : undefined;

  for (const section of getSections(schema)) {
    if (section.type === "fields") {
      for (const field of section.fields) {
        if (field.isActive === false || field.type !== "temp") continue;
        const raw = payload[field.id];
        const value = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(value)) continue;

        const alertBelow = typeof field.alertBelow === "number" ? field.alertBelow : defaultAlertBelow;
        const alertAbove = typeof field.alertAbove === "number" ? field.alertAbove : defaultAlertAbove;
        const below = typeof alertBelow === "number" && value < alertBelow;
        const above = typeof alertAbove === "number" && value > alertAbove;
        if (!below && !above) continue;

        alerts.push({
          key: field.id,
          label: field.label,
          value,
          alertBelow,
          alertAbove,
          unit: field.unit || defaultUnit,
        });
      }
      continue;
    }

    const gridKey = section.id || "form_data";
    const rows = payload[gridKey];
    if (!Array.isArray(rows)) continue;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const rowRecord = row as Record<string, unknown>;

      for (const col of section.columns) {
        if (col.isActive === false || col.type !== "temp") continue;
        const raw = rowRecord[col.id];
        const value = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(value)) continue;

        const alertBelow = typeof (col as any).alertBelow === "number" ? (col as any).alertBelow : defaultAlertBelow;
        const alertAbove = typeof (col as any).alertAbove === "number" ? (col as any).alertAbove : defaultAlertAbove;
        const below = typeof alertBelow === "number" && value < alertBelow;
        const above = typeof alertAbove === "number" && value > alertAbove;
        if (!below && !above) continue;

        alerts.push({
          key: `${gridKey}.${rowIndex}.${col.id}`,
          label: `${section.title || "Log"} / Row ${rowIndex + 1} / ${col.label}`,
          value,
          alertBelow: typeof alertBelow === "number" ? alertBelow : undefined,
          alertAbove: typeof alertAbove === "number" ? alertAbove : undefined,
          unit: (col as any).unit || defaultUnit,
        });
      }
    }
  }

  return alerts;
}

export function collectTemperatureSeries(schema: FormSchemaV1, payload: Record<string, unknown>) {
  const series: Array<{ key: string; label: string; unit: "C" | "F"; values: number[] }> = [];

  for (const section of getSections(schema)) {
    if (section.type === "fields") {
      for (const field of section.fields) {
        if (field.isActive === false || field.type !== "temp") continue;
        const raw = payload[field.id];
        const value = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(value)) continue;
        series.push({
          key: field.id,
          label: field.label,
          unit: field.unit === "F" ? "F" : "C",
          values: [value],
        });
      }
      continue;
    }

    const gridKey = section.id || "form_data";
    const rows = payload[gridKey];
    if (!Array.isArray(rows)) continue;

    for (const col of section.columns) {
      if (col.isActive === false || col.type !== "temp") continue;
      const values: number[] = [];
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const raw = (row as Record<string, unknown>)[col.id];
        const numeric = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(numeric)) values.push(numeric);
      }
      if (!values.length) continue;
      series.push({
        key: `${gridKey}.${col.id}`,
        label: `${section.title || "Log"} / ${col.label}`,
        unit: (col as any).unit === "F" ? "F" : "C",
        values,
      });
    }
  }

  return series;
}
