import { ReportPhotoGallery } from "@/components/forms/ReportPhotoGallery";
import type { DisplayField, FieldDef } from "@/types/forms";
import { displayFieldText, displayVariantClass } from "@/lib/displayFieldStyles";

export const REPORT_SIGNATURE_IMG_CLASS =
  "report-signature-img mx-auto block max-h-28 w-full max-w-lg object-contain";

export const REPORT_TABLE_SIGNATURE_IMG_CLASS =
  "report-signature-img report-signature-img--table mx-auto block max-h-[4.5rem] w-auto max-w-[11rem] object-contain";

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
  if (Array.isArray(value)) return value.filter((x): x is string => isImageSource(x));
  if (isImageSource(value)) return [value as string];
  return [] as string[];
}

export function renderAuditReportFieldValue(field: FieldDef, payload: Record<string, unknown>, inTable = false) {
  if (field.type === "display") {
    const displayField = field as DisplayField;
    return (
      <span className={"whitespace-pre-wrap " + displayVariantClass(displayField.variant || "body")}>
        {displayFieldText(displayField)}
      </span>
    );
  }

  const value = payload[field.id];

  if (field.type === "signature") {
    if (isDataUrl(value)) {
      return (
        <div className={inTable ? "report-cell-signature report-cell-signature--table" : "report-cell-signature"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value as string}
            alt={`${field.label} signature`}
            className={inTable ? REPORT_TABLE_SIGNATURE_IMG_CLASS : REPORT_SIGNATURE_IMG_CLASS}
          />
        </div>
      );
    }
    return <span className="text-foreground/50">Not signed</span>;
  }

  if (field.type === "photo") {
    const items = photoList(value);
    if (items.length > 0) return <ReportPhotoGallery photos={items} label={field.label} />;
    return <span className="text-foreground/50">No photo</span>;
  }

  if (field.type === "checkbox") {
    return <span>{value ? "Checked" : "Not checked"}</span>;
  }

  return <span className="report-field-value">{asText(value) || "-"}</span>;
}

export function renderAuditReportTableCellValue(
  col: FieldDef,
  value: unknown
) {
  if (isDataUrl(value)) {
    return (
      <div className="report-cell-signature report-cell-signature--table">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value as string} alt="" className={REPORT_TABLE_SIGNATURE_IMG_CLASS} />
      </div>
    );
  }
  if (col.type === "yesno") return asYesNo(value);
  return <span className="report-field-value">{asText(value) || "-"}</span>;
}
