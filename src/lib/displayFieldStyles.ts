import type { DisplayField, DisplayVariant } from "@/types/forms";

export function displayFieldText(field: DisplayField): string {
  const content = typeof field.content === "string" ? field.content.trim() : "";
  if (content) return content;
  return field.label?.trim() || "Label text";
}

export function displayVariantClass(variant: DisplayVariant = "body"): string {
  switch (variant) {
    case "title":
      return "text-lg font-bold tracking-tight text-foreground sm:text-xl";
    case "subtitle":
      return "text-base font-semibold text-foreground/90";
    case "caption":
      return "text-xs text-foreground/65";
    case "code":
      return "font-mono text-sm font-medium tracking-wide text-foreground/90";
    case "body":
    default:
      return "text-sm text-foreground/85 leading-relaxed";
  }
}

export function displayAlignClass(align?: "left" | "center" | "right"): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}
