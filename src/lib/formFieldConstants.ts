/** Shown on new grid columns until the admin sets a real header name. */
export const COLUMN_HEADER_PLACEHOLDER = "Add column name";

export const COLUMN_MIN_WIDTH_PX = 65;
export const COLUMN_MAX_WIDTH_PX = 640;
export const COLUMN_DEFAULT_WIDTH_PX = 160;

export const GRID_COLUMN_LIMIT_MESSAGE =
  "Tables can use as many columns as the source form needs. The builder scrolls wide tables horizontally and PDF export fits them to the page.";

export function recommendedPdfOrientationForColumns(
  columnCount: number,
): "portrait" | "landscape" {
  return columnCount > 4 ? "landscape" : "portrait";
}

export function clampColumnWidthPx(value: number): number {
  if (!Number.isFinite(value)) return COLUMN_DEFAULT_WIDTH_PX;
  return Math.max(COLUMN_MIN_WIDTH_PX, Math.min(COLUMN_MAX_WIDTH_PX, Math.round(value)));
}

export function isColumnHeaderPlaceholder(label: string | undefined | null): boolean {
  if (!label || !label.trim()) return true;
  const normalized = label.trim().toLowerCase();
  return (
    normalized === COLUMN_HEADER_PLACEHOLDER.toLowerCase() ||
    normalized === "add name" ||
    normalized === "column" ||
    normalized === "column name"
  );
}

export function columnHeaderDisplayLabel(label: string | undefined | null): string {
  if (isColumnHeaderPlaceholder(label)) return COLUMN_HEADER_PLACEHOLDER;
  return label?.trim() || COLUMN_HEADER_PLACEHOLDER;
}
