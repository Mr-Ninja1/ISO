"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

type CategorySummary = {
  id: string;
  name: string;
};

export function AddFormOptionsModal({
  open,
  onClose,
  categories,
  defaultCategoryId,
  onAddFromTemplates,
  onCreateCustom,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategorySummary[];
  defaultCategoryId: string | null;
  onAddFromTemplates: (categoryId: string | null) => void;
  onCreateCustom: (categoryId: string | null) => void;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(defaultCategoryId);

  useEffect(() => {
    if (!open) return;
    setSelectedCategoryId(defaultCategoryId);
  }, [open, defaultCategoryId]);

  const categoryOptions = useMemo(() => {
    return categories.map((c) => ({ value: c.id, label: c.name }));
  }, [categories]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-lg border border-foreground/20 bg-background p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Add a form</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Choose where this form should live, then pick an option.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-foreground/20 p-2"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">Category</div>
          <div className="relative">
            <select
              className="h-11 w-full appearance-none rounded-md border border-foreground/20 bg-background px-3 pr-10"
              value={selectedCategoryId ?? ""}
              onChange={(e) => setSelectedCategoryId(e.target.value || null)}
            >
              <option value="">Uncategorized</option>
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60" />
          </div>
          <div className="text-xs text-foreground/60">
            Defaults to the category you clicked from.
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md border border-foreground/20 bg-background px-4 text-sm font-medium hover:bg-foreground/5"
            onClick={() => onAddFromTemplates(selectedCategoryId)}
          >
            Add from templates
          </button>

          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background"
            onClick={() => onCreateCustom(selectedCategoryId)}
          >
            <Plus className="h-4 w-4" />
            Create custom form
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            className="h-10 rounded-md border border-foreground/20 px-4"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
