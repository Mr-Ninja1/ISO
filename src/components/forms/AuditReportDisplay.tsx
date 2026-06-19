"use client";

import type { AuditReportData } from "@/types/auditReport";
import {
  AuditReportFooter,
  auditMetaFromPayload,
} from "@/components/forms/AuditReportFooter";
import {
  renderAuditReportFieldValue,
  renderAuditReportTableCellValue,
} from "@/components/forms/auditReportFieldRender";
import { ReportPhotoGallery } from "@/components/forms/ReportPhotoGallery";
import { buildGridLayout } from "@/lib/gridLayout";
import { clampColumnWidthPx } from "@/lib/formFieldConstants";
import {
  normalizeFormSchema,
  splitReportSections,
} from "@/lib/normalizeFormSchema";
import {
  DEFAULT_EVIDENCE_FIELD_ID,
  reportFieldCellClass,
} from "@/lib/reportEvidence";

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter((part) => part.length > 0)
      .join(", ");
  }
  if (typeof value === "object") return "";
  return String(value);
}

function isDataUrl(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image");
}

function sectionColumnsClass(columns?: number) {
  if (columns === 2) return "report-field-grid report-field-grid--2";
  if (columns === 3) return "report-field-grid report-field-grid--3";
  if (columns === 4) return "report-field-grid report-field-grid--4";
  return "report-field-grid report-field-grid--auto";
}

export function AuditReportDisplay({
  audit,
}: {
  audit: AuditReportData;
  tenantSlug: string;
  auditId: string;
}) {
  const payload = audit.payload;
  const schema = audit.template.schema
    ? normalizeFormSchema(audit.template.schema)
    : null;
  const { submittedByName, submittedByEmail } = auditMetaFromPayload(payload);
  if (!schema || (!schema.sections?.length && !schema.fields?.length)) {
    const entries = Object.entries(payload).filter(
      ([key]) => !key.startsWith("__"),
    );
    return (
      <div
        className="report-export-root print-shell rounded-lg border border-foreground/25 bg-background p-4 sm:p-6"
        id="report-content"
      >
        <header className="report-header-block">
          <h2 className="text-xl font-semibold">{audit.template.title}</h2>
          <p className="mt-1 text-sm text-foreground/70">
            {audit.status} • {new Date(audit.createdAt).toLocaleString()}
          </p>
        </header>
        <div className="mt-4 report-field-grid report-field-grid--auto">
          {entries.map(([key, value]) => (
            <div key={key} className="report-field-card">
              <div className="report-field-label">{key}</div>
              <div className="report-field-value break-words">
                {isDataUrl(value) ? (
                  <div className="report-cell-signature">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={value as string}
                      alt={key}
                      className="report-signature-img"
                    />
                  </div>
                ) : (
                  asText(value) || "—"
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

  const sections = splitReportSections(schema);
  const defaultEvidence = payload[DEFAULT_EVIDENCE_FIELD_ID];
  const payloadTempMeta =
    payload &&
    typeof payload.__temperatureMeta === "object" &&
    payload.__temperatureMeta !== null
      ? (payload.__temperatureMeta as Record<string, unknown>)
      : null;
  const correctiveAction =
    payloadTempMeta && typeof payloadTempMeta.correctiveAction === "string"
      ? payloadTempMeta.correctiveAction
      : "";
  const tenant = audit.tenant;

  return (
    <div
      className="report-export-root print-shell rounded-lg border border-foreground/25 bg-background p-4 sm:p-6"
      id="report-content"
    >
      <header className="report-header-block print-page-break-avoid">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-foreground/20 bg-background">
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.logoUrl}
                  alt={`${tenant.name} logo`}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <span className="text-base font-semibold">
                  {tenant.name[0]}
                </span>
              )}
            </div>
            <div>
              <div className="text-lg font-semibold leading-tight">
                {tenant.name}
              </div>
              <div className="text-xs uppercase tracking-wide text-foreground/65">
                Food safety audit report
              </div>
            </div>
          </div>
          <dl className="grid gap-1 text-right text-xs sm:text-sm">
            <div>
              <dt className="inline font-semibold">Status: </dt>
              <dd className="inline">{audit.status}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Date: </dt>
              <dd className="inline">
                {new Date(audit.createdAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
        <h1 className="report-title mt-4 text-center text-xl font-bold tracking-tight sm:text-2xl">
          {schema.title || audit.template.title}
        </h1>
      </header>

      <div className="mt-5 flex flex-col gap-4">
        {correctiveAction ? (
          <section className="report-section print-page-break-avoid rounded-md border border-amber-300/80 bg-amber-50/90 p-3">
            <h3 className="report-section-title text-amber-950">
              Corrective action
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-amber-950">
              {correctiveAction}
            </p>
          </section>
        ) : null}

        {sections.map((section, idx) => {
          if (section.type === "fields") {
            const fields = section.fields.filter((f) => f.isActive !== false);
            if (!fields.length) return null;
            return (
              <section
                key={`fields-${idx}`}
                className="report-section print-page-break-avoid"
              >
                {section.title &&
                section.title.trim().toLowerCase() !== "fields" ? (
                  <h3 className="report-section-title">{section.title}</h3>
                ) : null}
                <div className={sectionColumnsClass(section.columns)}>
                  {fields.map((field) => (
                    <div
                      key={field.id}
                      className={`report-field-card ${reportFieldCellClass(field, section.columns)}`}
                    >
                      <div className="report-field-label">{field.label}</div>
                      <div className="report-field-body">
                        {renderAuditReportFieldValue(field, payload)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          const key = section.id || "form_data";
          const rows = Array.isArray(payload[key])
            ? (payload[key] as Array<Record<string, unknown>>)
            : [];
          const fixedRows =
            typeof section.rows === "number" ? section.rows : rows.length;
          const rowCount = Math.max(rows.length, fixedRows || 0, 1);
          const layout = buildGridLayout(section, rowCount);

          return (
            <section key={`grid-${key}-${idx}`} className="report-section">
              <h3 className="report-section-title">
                {section.title || "Log sheet"}
              </h3>
              <div className="report-table-wrap overflow-x-auto rounded-md border border-foreground/20">
                <table className="report-data-table w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr>
                      {layout.columns.map((col) => (
                        <th
                          key={col.id}
                          className={
                            "border border-foreground/25 bg-foreground/[0.04] px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide " +
                            (col.type === "checkbox" ? "w-16 text-center" : "")
                          }
                          style={
                            col.type === "checkbox"
                              ? { width: 72, minWidth: 72, maxWidth: 72 }
                              : col.type === "signature"
                                ? { width: 168, minWidth: 140, maxWidth: 200 }
                                : typeof (col as { widthPx?: number })
                                      .widthPx === "number" &&
                                    Number.isFinite(
                                      (col as { widthPx?: number }).widthPx,
                                    )
                                  ? {
                                      width: clampColumnWidthPx(
                                        (col as { widthPx: number }).widthPx,
                                      ),
                                      minWidth: clampColumnWidthPx(
                                        (col as { widthPx: number }).widthPx,
                                      ),
                                      maxWidth: clampColumnWidthPx(
                                        (col as { widthPx: number }).widthPx,
                                      ),
                                    }
                                  : undefined
                          }
                        >
                          {col.label || "Column"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowCount }).map((_, rowIndex) => {
                      const row = rows[rowIndex] || {};
                      return (
                        <tr
                          key={`r-${rowIndex}`}
                          className="print-page-break-avoid"
                        >
                          {layout.rows[rowIndex]?.map((cell, colIndex) => {
                            if (!cell || cell.kind === "covered") return null;
                            const col = cell.field;
                            const value = row[col.id];
                            return (
                              <td
                                key={`${rowIndex}-${colIndex}-${cell.mergeId || col.id}`}
                                rowSpan={cell.rowSpan}
                                colSpan={cell.colSpan}
                                className={
                                  "border border-foreground/15 px-2.5 py-2 align-top " +
                                  (col.type === "checkbox" ? "text-center" : "")
                                }
                                style={
                                  col.type === "checkbox"
                                    ? { width: 72, minWidth: 72, maxWidth: 72 }
                                    : col.type === "signature"
                                      ? {
                                          width: 168,
                                          minWidth: 140,
                                          maxWidth: 200,
                                        }
                                      : typeof (col as { widthPx?: number })
                                            .widthPx === "number" &&
                                          Number.isFinite(
                                            (col as { widthPx?: number })
                                              .widthPx,
                                          )
                                        ? {
                                            width: clampColumnWidthPx(
                                              (col as { widthPx: number })
                                                .widthPx,
                                            ),
                                            minWidth: clampColumnWidthPx(
                                              (col as { widthPx: number })
                                                .widthPx,
                                            ),
                                            maxWidth: clampColumnWidthPx(
                                              (col as { widthPx: number })
                                                .widthPx,
                                            ),
                                          }
                                        : undefined
                                }
                              >
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

        <section className="report-section print-page-break-avoid">
          <h3 className="report-section-title">Photo evidence</h3>
          {photoListOnlyDefault(defaultEvidence).length > 0 ? (
            <div className="grid gap-2">
              <p className="text-sm text-foreground/70">
                {photoListOnlyDefault(defaultEvidence).length} photo evidence{" "}
                {photoListOnlyDefault(defaultEvidence).length === 1
                  ? "item is"
                  : "items are"}{" "}
                attached for this document.
              </p>
              <ReportPhotoGallery
                photos={photoListOnlyDefault(defaultEvidence)}
                label="Photo evidence"
                pdfSummary={`${photoListOnlyDefault(defaultEvidence).length} photo evidence ${photoListOnlyDefault(defaultEvidence).length === 1 ? "item is" : "items are"} attached for this document. Full-size photo evidence is included below in the Evidence attachments section.`}
              />
            </div>
          ) : (
            <p className="text-sm text-foreground/50">
              No photo evidence was attached for this document.
            </p>
          )}
        </section>
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

function photoListOnlyDefault(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (x): x is string =>
        typeof x === "string" &&
        (x.startsWith("data:image") || /^https?:\/\//i.test(x)),
    );
  }
  if (
    typeof value === "string" &&
    (value.startsWith("data:image") || /^https?:\/\//i.test(value))
  )
    return [value];
  return [];
}
