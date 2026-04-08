"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      className="h-10 rounded-md bg-foreground px-3 text-background print:hidden"
      onClick={() => window.print()}
    >
      Print
    </button>
  );
}
