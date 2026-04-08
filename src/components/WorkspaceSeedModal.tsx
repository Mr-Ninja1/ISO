"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function WorkspaceSeedModal({
  open,
  onClose,
  onSubmit,
  busy,
  suggestions,
  loadingSuggestions,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (names: string[]) => void;
  busy?: boolean;
  suggestions: string[];
  loadingSuggestions?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [customName, setCustomName] = useState("");
  const [custom, setCustom] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (selected.size > 0) return;
    if (!suggestions.length) return;
    setSelected(new Set(suggestions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestions.join("|")]);

  const allSelected = useMemo(() => {
    const combined = new Set<string>();
    for (const s of selected) combined.add(s);
    for (const c of custom) combined.add(c);
    return Array.from(combined);
  }, [selected, custom]);

  if (!open) return null;

  function toggleSuggested(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addCustom() {
    const name = normalizeName(customName);
    if (!name) return;

    setCustom((prev) => {
      if (prev.some((x) => x.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, name];
    });
    setCustomName("");
  }

  function removeCustom(name: string) {
    setCustom((prev) => prev.filter((x) => x !== name));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/20"
        onClick={() => (busy ? null : onClose())}
      />

      <div className="relative w-full max-w-lg rounded-lg border border-foreground/20 bg-background p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Setup Workspace</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Choose suggested categories and/or add your own.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-foreground/20 p-2"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Suggested Categories</div>
            {loadingSuggestions ? (
              <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-background p-3 text-sm text-foreground/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading suggested categories...
              </div>
            ) : suggestions.length ? (
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map((name) => {
                  const isOn = selected.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleSuggested(name)}
                      className={
                        isOn
                          ? "h-10 rounded-md border border-foreground/20 bg-foreground/5 px-3 text-left"
                          : "h-10 rounded-md border border-foreground/20 px-3 text-left opacity-70"
                      }
                      disabled={busy}
                    >
                      <span className="text-sm font-medium">{name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-foreground/20 bg-background p-3 text-sm text-foreground/70">
                No suggested categories configured yet.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Add Custom Category</div>
            <div className="flex gap-2">
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3"
                placeholder="e.g., Dispatch"
                disabled={busy}
              />
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-3 text-background disabled:opacity-50"
                onClick={addCustom}
                disabled={busy || !normalizeName(customName)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {custom.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {custom.map((name) => (
                  <button
                    type="button"
                    key={name}
                    className="rounded-full border border-foreground/20 px-3 py-1 text-sm"
                    onClick={() => removeCustom(name)}
                    disabled={busy}
                    title="Remove"
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-10 rounded-md border border-foreground/20 px-4 disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-10 rounded-md bg-foreground px-4 text-background disabled:opacity-50"
            onClick={() => onSubmit(allSelected)}
            disabled={busy || allSelected.length === 0}
          >
            {busy ? "Setting up..." : "Finish Setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
