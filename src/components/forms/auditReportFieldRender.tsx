import { ReportPhotoGallery } from "@/components/forms/ReportPhotoGallery";
import type { DisplayField, FieldDef } from "@/types/forms";
import { displayFieldText, displayVariantClass } from "@/lib/displayFieldStyles";

export const REPORT_SIGNATURE_IMG_CLASS =
  "report-signature-img mx-auto block h-20 w-full max-w-md object-contain print:h-24";

export const REPORT_TABLE_SIGNATURE_IMG_CLASS =
  "report-signature-img mx-auto block h-16 w-full min-w-[120px] object-contain print:h-20";

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
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value as string}
          alt={`${field.label} signature`}
          className={inTable ? REPORT_TABLE_SIGNATURE_IMG_CLASS : REPORT_SIGNATURE_IMG_CLASS}
        />
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
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value as string} alt="" className={REPORT_TABLE_SIGNATURE_IMG_CLASS} />
    );
  }
  if (col.type === "yesno") return asYesNo(value);
  return <span className="report-field-value">{asText(value) || "-"}</span>;
}
