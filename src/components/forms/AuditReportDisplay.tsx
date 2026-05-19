"use client";

import type { AuditReportData } from "@/types/auditReport";
import { AuditReportFooter, auditMetaFromPayload } from "@/components/forms/AuditReportFooter";
import {
  renderAuditReportFieldValue,
  renderAuditReportTableCellValue,
} from "@/components/forms/auditReportFieldRender";
import { ReportPhotoGallery } from "@/components/forms/ReportPhotoGallery";
import { buildGridLayout } from "@/lib/gridLayout";
import type { FormSchemaV1, FormSection } from "@/types/forms";

const DEFAULT_EVIDENCE_FIELD_ID = "__default_photo_evidence";

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}

function isDataUrl(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image");
}

function isImageSource(value: unknown) {
  if (typeof value !== "string") return false;
  if (value.startsWith("data:image")) return true;
  if (/^https?:\/\//i.test(value)) return true;
  return false;
}

function photoList(value: unknown) {
  if (Array.isArray(value)) return value.filter((x): x is string => isImageSource(x));
  if (isImageSource(value)) return [value as string];
  return [] as string[];
}

function splitSections(schema: FormSchemaV1): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", fields: schema.fields ?? [] }];
}

function sectionColumnsClass(columns?: number) {
  if (columns === 2) return "grid grid-cols-1 gap-3 md:grid-cols-2 print:grid-cols-2";
  if (columns === 3) return "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3";
  if (columns === 4) return "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4";
  return "grid grid-cols-1 gap-3 md:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] print:grid-cols-2";
}

export function AuditReportDisplay({
  audit,
}: {
  audit: AuditReportData;
  tenantSlug: string;
  auditId: string;
}) {
  const payload = audit.payload;
  const schema = audit.template.schema;
  const { submittedByName, submittedByEmail } = auditMetaFromPayload(payload);

  if (!schema) {
    const entries = Object.entries(payload).filter(([key]) => !key.startsWith("__"));
    return (
      <div className="report-export-root rounded-md border border-foreground/20 bg-background p-4">
        <h2 className="text-lg font-semibold">{audit.template.title}</h2>
        <p className="mt-1 text-sm text-foreground/70">
          {audit.status} • {new Date(audit.createdAt).toLocaleString()}
        </p>
        <div className="mt-4 space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded border border-foreground/15 p-2">
              <div className="text-xs text-foreground/60">{key}</div>
              <div className="break-words text-sm">
                {isDataUrl(value) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={value as string} alt={key} className="report-signature-img mt-1 object-contain" />
                ) : (
                  asText(value) || "-"
                )}
              </div>
            </div>
          ))}
        </div>
        <AuditReportFooter
          submittedByName={submittedByName}
          submittedByEmail={submittedByEmail}
          submittedAt={audit.createdAt}
          status={audit.status}
        />
      </div>
    );
  }

  const sections = splitSections(schema);
  const defaultEvidence = payload[DEFAULT_EVIDENCE_FIELD_ID];
  const payloadTempMeta =
    payload && typeof payload.__temperatureMeta === "object" && payload.__temperatureMeta !== null
      ? (payload.__temperatureMeta as Record<string, unknown>)
      : null;
  const correctiveAction =
    payloadTempMeta && typeof payloadTempMeta.correctiveAction === "string" ? payloadTempMeta.correctiveAction : "";
  const tenant = audit.tenant;

  return (
    <div
      className="report-export-root print-shell rounded-lg border border-foreground/30 bg-background p-4 sm:p-6"
      id="report-content"
    >
      <div className="rounded-md border border-foreground/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-foreground/20 bg-background">
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-10 w-10 object-contain" />
              ) : (
                <span className="text-base font-semibold">{tenant.name[0]}</span>
              )}
            </div>
            <div>
              <div className="text-lg font-semibold leading-tight">{tenant.name}</div>
              <div className="text-xs text-foreground/70">Food Safety Audit Report</div>
            </div>
          </div>
          <div className="grid gap-1 text-right text-xs">
            <div>
              <span className="font-semibold">Status:</span> {audit.status}
            </div>
            <div>
              <span className="font-semibold">Date:</span> {new Date(audit.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div className="mt-3 text-center text-2xl font-bold tracking-tight">{schema.title || audit.template.title}</div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {correctiveAction ? (
          <section className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-900">Corrective action</h3>
            <div className="text-sm text-amber-900">{correctiveAction}</div>
          </section>
        ) : null}

        {sections.map((section, idx) => {
          if (section.type === "fields") {
            const fields = section.fields.filter((f) => f.isActive !== false);
            if (!fields.length) return null;
            return (
              <section key={`fields-${idx}`} className="rounded-md border border-foreground/20 p-3">
                {section.title && section.title.trim().toLowerCase() !== "fields" ? (
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">{section.title}</h3>
                ) : null}
                <div className={sectionColumnsClass(section.columns)}>
                  {fields.map((field) => (
                    <div key={field.id} className="rounded-md border border-foreground/15 p-2">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                        {field.label}
                      </div>
                      <div className="text-sm">{renderAuditReportFieldValue(field, payload)}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          const key = section.id || "form_data";
          const rows = Array.isArray(payload[key]) ? (payload[key] as Array<Record<string, unknown>>) : [];
          const fixedRows = typeof section.rows === "number" ? section.rows : rows.length;
          const rowCount = Math.max(rows.length, fixedRows || 0, 1);
          const layout = buildGridLayout(section, rowCount);

          return (
            <section key={`grid-${key}-${idx}`} className="rounded-md border border-foreground/20 p-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">{section.title || "Log Sheet"}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr>
                      {layout.columns.map((col) => (
                        <th key={col.id} className="border border-foreground/30 px-2 py-2 text-left font-semibold">
                          {col.label || "Column"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowCount }).map((_, rowIndex) => {
                      const row = rows[rowIndex] || {};
                      return (
                        <tr key={`r-${rowIndex}`}>
                          {layout.rows[rowIndex]?.map((cell, colIndex) => {
                            if (!cell || cell.kind === "covered") return null;
                            const col = cell.field;
                            const value = row[col.id];
                            return (
                              <td key={`${rowIndex}-${colIndex}`} className="border border-foreground/20 px-2 py-1.5">
                                {renderAuditReportTableCellValue(col, value)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {photoList(defaultEvidence).length > 0 ? (
          <section className="rounded-md border border-foreground/20 p-3">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">Photo evidence</h3>
            <ReportPhotoGallery photos={photoList(defaultEvidence)} label="Photo evidence" />
          </section>
        ) : null}
      </div>

      <AuditReportFooter
        submittedByName={submittedByName}
        submittedByEmail={submittedByEmail}
        submittedAt={audit.createdAt}
        status={audit.status}
      />
    </div>
  );
}