/** Shown on new grid columns until the admin sets a real header name. */
export const COLUMN_HEADER_PLACEHOLDER = "Add column name";

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
