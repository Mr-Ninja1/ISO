"use client";

import { useEffect, useMemo, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
  useFieldArray,
} from "react-hook-form";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { GridSection, SimpleFieldDef } from "@/types/forms";

type FormValues = Record<string, unknown>;

function buildRowDefaults(columns: Array<SimpleFieldDef>, rowIndex: number) {
  const row: Record<string, unknown> = {};
  for (const col of columns) {
    if (col.type === "checkbox") row[col.id] = false;
    else if (col.readOnly && col.id === "day") row[col.id] = String(rowIndex + 1);
    else row[col.id] = "";
  }
  return row;
}

function SignatureModal({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const [canvas, setCanvas] = useState<SignatureCanvas | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!canvas) return;

    canvas.clear();
    if (initial) {
      try {
        canvas.fromDataURL(initial);
      } catch {
        // ignore
      }
    }
  }, [open, canvas, initial]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-foreground/20 bg-background shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <button
            type="button"
            className="rounded-md border border-foreground/20 px-3 py-1 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-3">
          <div className="rounded-md border border-foreground/20 bg-background">
            <SignatureCanvas
              ref={(ref) => setCanvas(ref)}
              penColor="black"
              canvasProps={{
                className: "h-56 w-full",
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="h-10 rounded-md border border-foreground/20 px-4 text-sm"
              onClick={() => canvas?.clear()}
            >
              Clear
            </button>
            <button
              type="button"
              className="h-10 rounded-md bg-foreground px-4 text-sm text-background"
              onClick={() => {
                const dataUrl = canvas?.toDataURL("image/png") || "";
                onSave(dataUrl);
                onClose();
              }}
            >
              Save Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GridField({
  grid,
  name,
  control,
  register,
  errors,
  loading,
  setValue,
  watch,
}: {
  grid: GridSection;
  name: string;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  loading?: boolean;
  setValue: UseFormSetValue<FormValues>;
  watch: UseFormWatch<FormValues>;
}) {
  const { replace, fields, append, remove } = useFieldArray({
    control: control as any,
    name: name as any,
  });

  const fixedRows = typeof grid.rows === "number" ? Math.max(0, grid.rows) : null;
  const emptyRow = useMemo(() => buildRowDefaults(grid.columns, 0), [grid.columns]);

  useEffect(() => {
    if (grid.rows === "dynamic") {
      if (fields.length === 0) append({ ...emptyRow });
      return;
    }

    if (fixedRows == null) return;
    if (fields.length === fixedRows) return;

    replace(Array.from({ length: fixedRows }, (_, idx) => buildRowDefaults(grid.columns, idx)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.rows, fixedRows, fields.length]);

  const [sig, setSig] = useState<{ rowIndex: number; colId: string } | null>(null);

  function renderCell(col: SimpleFieldDef, rowIndex: number) {
    const cellName = `${name}.${rowIndex}.${col.id}`;
    const errorMessage =
      (errors as any)?.[name]?.[rowIndex]?.[col.id]?.message as string | undefined;

    if (col.readOnly) {
      return (
        <input
          type="text"
          readOnly
          tabIndex={-1}
          className="h-10 w-full rounded-md border border-foreground/20 bg-foreground/5 px-3 text-sm text-center"
          {...register(cellName as any)}
        />
      );
    }

    if (col.type === "temp") {
      const unit = (col as any)?.unit === "F" ? "°F" : "°C";
      return (
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 pr-10 text-sm"
            {...register(cellName as any)}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-foreground/60">
            {unit}
          </span>
          {errorMessage ? (
            <div className="mt-1 text-xs text-red-700">{errorMessage}</div>
          ) : null}
        </div>
      );
    }

    if (col.type === "checkbox") {
      return (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            className="h-6 w-6 accent-foreground"
            {...register(cellName as any)}
          />
        </div>
      );
    }

    if (col.type === "time") {
      return (
        <div>
          <input
            type="time"
            className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
            {...register(cellName as any)}
          />
          {errorMessage ? (
            <div className="mt-1 text-xs text-red-700">{errorMessage}</div>
          ) : null}
        </div>
      );
    }

    if (col.type === "date") {
      return (
        <div>
          <input
            type="date"
            className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
            {...register(cellName as any)}
          />
          {errorMessage ? (
            <div className="mt-1 text-xs text-red-700">{errorMessage}</div>
          ) : null}
        </div>
      );
    }

    if (col.type === "number") {
      return (
        <div>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
            {...register(cellName as any)}
          />
          {errorMessage ? (
            <div className="mt-1 text-xs text-red-700">{errorMessage}</div>
          ) : null}
        </div>
      );
    }

    if (col.type === "signature") {
      const current = (watch(cellName as any) as string) || "";
      return (
        <button
          type="button"
          className={
            current
              ? "h-10 w-full rounded-md border border-foreground/20 bg-foreground/5 px-3 text-left text-sm"
              : "h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-left text-sm text-foreground/70"
          }
          onClick={() => setSig({ rowIndex, colId: col.id })}
        >
          {current ? "Signed" : "Tap to sign"}
        </button>
      );
    }

    // text
    return (
      <div>
        <input
          type="text"
          className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
          {...register(cellName as any)}
        />
        {errorMessage ? (
          <div className="mt-1 text-xs text-red-700">{errorMessage}</div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-foreground/20 bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{grid.title || "Log Sheet"}</h3>
          <p className="mt-1 text-sm text-foreground/70">
            Fill in the log. The layout is designed for audit printing.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-14 border-b border-foreground/20 bg-background px-3 py-2 text-left text-xs font-semibold text-foreground/70">
                #
              </th>
              {grid.columns.map((col) => (
                <th
                  key={col.id}
                  className={
                    "sticky top-0 z-10 border-b border-foreground/20 bg-background px-3 py-2 text-left text-xs font-semibold text-foreground/70 " +
                    (col.type === "checkbox" ? "w-16 text-center" : "")
                  }
                  style={col.type === "checkbox" ? { width: 72, minWidth: 72 } : undefined}
                >
                  {col.label}
                </th>
              ))}
              {grid.rows === "dynamic" ? (
                <th className="sticky top-0 z-10 w-12 border-b border-foreground/20 bg-background px-2 py-2" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {fields.map((row, rowIndex) => (
              <tr key={row.id} className="border-b border-foreground/10">
                <td className="border-b border-foreground/10 bg-background px-3 py-2 text-xs text-foreground/70">
                  {rowIndex + 1}
                </td>
                {grid.columns.map((col) => (
                  <td
                    key={col.id}
                    className={
                      "border-b border-foreground/10 bg-background px-2 py-2 align-top " +
                      (col.type === "checkbox" ? "w-16" : "")
                    }
                    style={col.type === "checkbox" ? { width: 72, minWidth: 72 } : undefined}
                  >
                    {renderCell(col, rowIndex)}
                  </td>
                ))}
                {grid.rows === "dynamic" ? (
                  <td className="border-b border-foreground/10 bg-background px-2 py-2 align-top">
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-foreground/20"
                      onClick={() => remove(rowIndex)}
                      aria-label="Remove row"
                      title="Remove row"
                      disabled={fields.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {grid.rows === "dynamic" ? (
        <div className="mt-3">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-4 text-sm"
            onClick={() => append(buildRowDefaults(grid.columns, fields.length))}
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
        </div>
      ) : null}

      <SignatureModal
        open={!!sig}
        title="Signature"
        initial={
          sig
            ? (watch(`${name}.${sig.rowIndex}.${sig.colId}` as any) as unknown as string) ||
              ""
            : ""
        }
        onClose={() => setSig(null)}
        onSave={(dataUrl) => {
          if (!sig) return;
          setValue(`${name}.${sig.rowIndex}.${sig.colId}` as any, dataUrl, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />
    </section>
  );
}
