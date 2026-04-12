"use client";

export function PrintButton({ label = "Export PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      className="h-10 rounded-md bg-foreground px-3 text-background print:hidden"
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
