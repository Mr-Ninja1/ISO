import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/PrintButton";
import type { FormSchemaV1, FormSection, FieldDef } from "@/types/forms";
import { collectTemperatureSeries } from "@/lib/temperatureMonitoring";
import { ReportPhotoGallery } from "@/components/forms/ReportPhotoGallery";
import { ReportSnapshotCacheWriter } from "@/components/forms/ReportSnapshotCacheWriter";

const DEFAULT_EVIDENCE_FIELD_ID = "__default_photo_evidence";

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}

function asYesNo(value: unknown) {
  if (value === "yes" || value === true) return "Yes";
  if (value === "no" || value === false) return "No";
  return asText(value);
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
  if (Array.isArray(value)) {
    return value.filter((x): x is string => isImageSource(x));
  }
  if (isImageSource(value)) return [value as string];
  return [] as string[];
}

function splitSections(schema: FormSchemaV1): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", title: "Fields", fields: schema.fields ?? [] }];
}

function visibleSections(schema: FormSchemaV1): FormSection[] {
  return splitSections(schema)
    .map((section) => {
      if (section.type === "fields") {
        return { ...section, fields: section.fields.filter((f) => f.isActive !== false) };
      }
      return { ...section, columns: section.columns.filter((c) => c.isActive !== false) };
    })
    .filter((section) => (section.type === "fields" ? section.fields.length > 0 : section.columns.length > 0));
}

function shouldUseLandscape(schema: FormSchemaV1) {
  const sections = visibleSections(schema);
  const biggestGrid = sections
    .filter((s): s is Extract<FormSection, { type: "grid" }> => s.type === "grid")
    .map((g) => g.columns.length)
    .sort((a, b) => b - a)[0] ?? 0;
  return biggestGrid >= 7;
}

function renderFieldValue(field: FieldDef, payload: Record<string, unknown>) {
  const value = payload[field.id];

  if (field.type === "signature") {
    if (isDataUrl(value)) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={value as string} alt={`${field.label} signature`} className="h-14 w-full object-contain" />;
    }
    return <span className="text-foreground/50">Not signed</span>;
  }

  if (field.type === "photo") {
    const items = photoList(value);
    if (items.length > 0) {
      return <ReportPhotoGallery photos={items} label={field.label} />;
    }
    return <span className="text-foreground/50">No photo</span>;
  }

  if (field.type === "checkbox") {
    return <span>{value ? "Checked" : "Not checked"}</span>;
  }

  return <span>{asText(value) || "-"}</span>;
}

export default async function AuditReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; auditId: string }>;
  searchParams: Promise<{ orientation?: "portrait" | "landscape" }>;
}) {
  const { tenantSlug, auditId } = await params;
  const { orientation } = await searchParams;
  let audit:
    | {
        id: string;
        status: "DRAFT" | "SUBMITTED";
        createdAt: Date;
        payload: unknown;
        tenant: { name: string; logoUrl: string | null; slug: string };
        template: { title: string; schema: unknown };
      }
    | null = null;

  try {
    audit = await prisma.auditLog.findFirst({
      where: {
        id: auditId,
        tenant: { slug: tenantSlug },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        payload: true,
        tenant: {
          select: {
            name: true,
            logoUrl: true,
            slug: true,
          },
        },
        template: {
          select: {
            title: true,
            schema: true,
          },
        },
      },
    });
  } catch (error: any) {
    if (error?.code === "P2024") {
      return (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Report loading is delayed because the database is busy. Please retry in a few seconds.
          <div className="mt-2">
            <Link className="underline" href={`/${tenantSlug}/audits`}>
              Back to stored forms
            </Link>
          </div>
        </div>
      );
    }
    throw error;
  }

  if (!audit) notFound();

  const tenant = audit.tenant;
  const schema = audit.template.schema as FormSchemaV1;
  const payload = (audit.payload as Record<string, unknown>) ?? {};
  const auditMeta =
    payload && typeof payload.__auditMeta === "object" && payload.__auditMeta !== null
      ? (payload.__auditMeta as Record<string, unknown>)
      : null;
  const submittedByName = auditMeta && typeof auditMeta.submittedByName === "string" ? auditMeta.submittedByName : "";
  const submittedByEmail = auditMeta && typeof auditMeta.submittedByEmail === "string" ? auditMeta.submittedByEmail : "";
  const sections = splitSections(schema);
  const defaultEvidence = payload[DEFAULT_EVIDENCE_FIELD_ID];
  const payloadTempMeta =
    payload && typeof payload.__temperatureMeta === "object" && payload.__temperatureMeta !== null
      ? (payload.__temperatureMeta as Record<string, unknown>)
      : null;
  const correctiveAction = payloadTempMeta && typeof payloadTempMeta.correctiveAction === "string"
    ? payloadTempMeta.correctiveAction
    : "";
  const trends = collectTemperatureSeries(schema, payload);
  const resolvedOrientation = orientation || (shouldUseLandscape(schema) ? "landscape" : "portrait");

  const printCss = `
    @page { size: A4 ${resolvedOrientation}; margin: 10mm; }
    @media print {
      html, body { background: #fff !important; }
      .print-shell { box-shadow: none !important; border-color: #000 !important; }
      .print-page-break-avoid { break-inside: avoid; page-break-inside: avoid; }
      .print-hide { display: none !important; }
    }
  `;

  return (
    <div className="flex flex-col gap-4">
      <ReportSnapshotCacheWriter
        tenantSlug={tenantSlug}
        auditId={auditId}
        title={schema.title || audit.template.title}
        status={audit.status}
        createdAt={audit.createdAt.toISOString()}
        tenantName={tenant.name}
        payload={payload}
      />
      <style>{printCss}</style>

      <div className="print-hide flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            className="h-9 rounded-md border border-foreground/20 px-3 text-sm inline-flex items-center"
            href={`/${tenantSlug}/audits/${auditId}?orientation=portrait`}
          >
            Portrait
          </Link>
          <Link
            className="h-9 rounded-md border border-foreground/20 px-3 text-sm inline-flex items-center"
            href={`/${tenantSlug}/audits/${auditId}?orientation=landscape`}
          >
            Landscape
          </Link>
        </div>
        <PrintButton />
      </div>

      <div className="print-shell rounded-lg border border-foreground/30 bg-background p-4 sm:p-6">
        <div className="print-page-break-avoid rounded-md border border-foreground/30 p-3">
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
            <div className="grid gap-1 text-xs text-right">
              <div><span className="font-semibold">Status:</span> {audit.status}</div>
              <div><span className="font-semibold">Date:</span> {new Date(audit.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
          <div className="mt-3 text-center text-2xl font-bold tracking-tight">{schema.title || audit.template.title}</div>
          {submittedByName || submittedByEmail ? (
            <div className="mt-2 text-center text-xs text-foreground/70">
              Submitted by {submittedByName || "Staff"}
              {submittedByEmail ? ` (${submittedByEmail})` : ""}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {trends.length > 0 ? (
            <section className="print-page-break-avoid rounded-md border border-foreground/20 p-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">Temperature trends</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {trends.map((trend) => {
                  const min = Math.min(...trend.values);
                  const max = Math.max(...trend.values);
                  const range = max - min || 1;
                  const points = trend.values
                    .map((v, i) => {
                      const x = (i / Math.max(1, trend.values.length - 1)) * 260;
                      const y = 70 - ((v - min) / range) * 60;
                      return `${x},${y}`;
                    })
                    .join(" ");
                  return (
                    <div key={trend.key} className="rounded-md border border-foreground/15 p-2">
                      <div className="text-xs font-semibold text-foreground/80">{trend.label}</div>
                      <svg viewBox="0 0 260 80" className="mt-2 h-20 w-full rounded bg-foreground/[0.03]">
                        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <div className="mt-1 text-[11px] text-foreground/70">
                        Min: {min.toFixed(1)}°{trend.unit} | Max: {max.toFixed(1)}°{trend.unit}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {correctiveAction ? (
            <section className="print-page-break-avoid rounded-md border border-amber-300 bg-amber-50 p-3">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-900">Corrective action</h3>
              <div className="text-sm text-amber-900">{correctiveAction}</div>
            </section>
          ) : null}

          {sections.map((section, idx) => {
            if (section.type === "fields") {
              return (
                <section key={`fields-${idx}`} className="print-page-break-avoid rounded-md border border-foreground/20 p-3">
                  {section.title && section.title.trim().toLowerCase() !== "fields" ? <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">{section.title}</h3> : null}
                  <div className="grid grid-cols-1 gap-3 md:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                    {section.fields.map((field) => (
                      <div
                        key={field.id}
                        className={
                          field.type === "dynamic-table"
                            ? "md:[grid-column:1/-1] rounded-md border border-foreground/15 p-2"
                            : "rounded-md border border-foreground/15 p-2"
                        }
                      >
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">{field.label}</div>
                        <div className="text-sm">{renderFieldValue(field, payload)}</div>
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

            return (
              <section key={`grid-${key}-${idx}`} className="rounded-md border border-foreground/20 p-3">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">{section.title || "Log Sheet"}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-xs">
                    <thead>
                      <tr>
                        {section.columns.map((col) => (
                          <th
                            key={col.id}
                            className={
                              "border border-foreground/30 px-2 py-2 text-left font-semibold uppercase tracking-wide " +
                              (col.type === "checkbox" ? "w-16 text-center" : "")
                            }
                            style={col.type === "checkbox" ? { width: 72, minWidth: 72 } : undefined}
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
                          <tr key={`r-${rowIndex}`}>
                            {section.columns.map((col) => {
                              const cell = row[col.id];
                              return (
                                <td
                                  key={`${rowIndex}-${col.id}`}
                                  className={
                                    "h-8 border border-foreground/20 px-2 py-1 align-top " +
                                    (col.type === "checkbox" ? "w-16 text-center" : "")
                                  }
                                  style={col.type === "checkbox" ? { width: 72, minWidth: 72 } : undefined}
                                >
                                  {isDataUrl(cell) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={cell as string} alt={`${col.label} signature`} className="h-8 w-full object-contain" />
                                  ) : (
                                    isImageSource(cell)
                                      ? (
                                        <a href={cell as string} target="_blank" rel="noreferrer" className="underline">View image</a>
                                      )
                                      : col.type === "yesno" ? asYesNo(cell) : asText(cell)
                                  )}
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
            <section className="print-page-break-avoid rounded-md border border-foreground/20 p-3">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">Photo evidence</h3>
              <ReportPhotoGallery photos={photoList(defaultEvidence)} label="Photo evidence" />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
