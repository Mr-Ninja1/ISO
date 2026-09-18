import type { DisplayField, DisplayVariant } from "@/types/forms";

export function displayFieldText(field: DisplayField): string {
  const content = typeof field.content === "string" ? field.content.trim() : "";
  if (content) return content;
  return field.label?.trim() || "Label text";
}

export function displayVariantClass(variant: DisplayVariant = "body"): string {
  switch (variant) {
    case "title":
      return "text-base font-semibold tracking-tight text-foreground sm:text-lg";
    case "subtitle":
      return "text-sm font-semibold text-foreground/90";
    case "caption":
      return "text-[11px] leading-snug text-foreground/65";
    case "code":
      return "font-mono text-xs font-medium tracking-wide text-foreground/90";
    case "body":
    default:
      return "text-sm text-foreground/85 leading-normal";
  }
}

export function displayAlignClass(align?: "left" | "center" | "right"): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}
