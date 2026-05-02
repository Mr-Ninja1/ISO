"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Calendar, Camera, Check, FileText, Hash, PenLine, Plus, Table2, Trash2 } from "lucide-react";
import type { FieldDef, FieldType, FormSection, FormType, GridMergedCell, GridSection, SimpleFieldDef } from "@/types/forms";
import { buildGridLayout } from "@/lib/gridLayout";

type BuilderState = {
  topFields: FieldDef[];
  topFieldsColumns: 1 | 2 | 3 | 4;
  bottomFields: FieldDef[];
  bottomFieldsColumns: 1 | 2 | 3 | 4;
  grid: GridSection | null;
};

type PaletteItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  fieldType: FieldType | "table";
};

function makeId(prefix: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cryptoAny: any = crypto;
    if (cryptoAny?.randomUUID) return `${prefix}_${cryptoAny.randomUUID()}`;
  } catch {
    // ignore
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function defaultField(fieldType: FieldType): FieldDef {
  const id = makeId(fieldType);

  switch (fieldType) {
    case "text":
      return { id, type: "text", label: "Text", required: false, placeholder: "" };
    case "date":
      return { id, type: "date", label: "Date", required: false, placeholder: "" };
    case "number":
      return { id, type: "number", label: "Number", required: false, placeholder: "", step: 1 };
    case "signature":
      return { id, type: "signature", label: "Signature", required: false };
    case "photo":
      return { id, type: "photo", label: "Photo evidence", required: false };
    case "temp":
      return { id, type: "temp", label: "Temperature", required: false, unit: "C" };
    case "checkbox":
      return { id, type: "checkbox", label: "Checkbox", required: false };
    case "yesno":
      return { id, type: "yesno", label: "Yes / No", required: false };
    case "time":
      return { id, type: "time", label: "Time", required: false };
    case "dynamic-table":
      return {
        id,
        type: "dynamic-table",
        label: "Table",
        required: false,
        columns: [{ id: "col1", label: "Column 1", type: "text" }],
      };
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { id, type: fieldType as any, label: "Field", required: false };
  }
}

function defaultGrid(): GridSection {
  return {
    type: "grid",
    id: "form_data",
    title: "Log Sheet",
    rows: 31,
    columns: [
      { id: "col_1", type: "text", label: "", required: false },
      { id: "col_2", type: "text", label: "", required: false },
      { id: "col_3", type: "text", label: "", required: false },
    ],
  };
}

function sectionColumnsClass(columns: 1 | 2 | 3 | 4) {
  if (columns === 1) return "grid grid-cols-1 gap-4";
  if (columns === 2) return "grid grid-cols-1 gap-4 md:grid-cols-2";
  if (columns === 3) return "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";
  return "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4";
}

function SectionColumnsSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 1 | 2 | 3 | 4;
  onChange: (next: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground/70">
      <span>{label}</span>
      <select
        className="h-8 rounded-md border border-foreground/20 bg-background px-2 text-xs"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as 1 | 2 | 3 | 4)}
      >
        <option value={1}>1 column</option>
        <option value={2}>2 columns</option>
        <option value={3}>3 columns</option>
        <option value={4}>4 columns</option>
      </select>
    </label>
  );
}

function palette(): PaletteItem[] {
  return [
    { id: "palette_text", label: "Text field", icon: <FileText className="h-4 w-4" />, fieldType: "text" },
    { id: "palette_date", label: "Date field", icon: <Calendar className="h-4 w-4" />, fieldType: "date" },
    { id: "palette_number", label: "Number field", icon: <Hash className="h-4 w-4" />, fieldType: "number" },
    { id: "palette_photo", label: "Photo evidence", icon: <Camera className="h-4 w-4" />, fieldType: "photo" },
    { id: "palette_signature", label: "Signature field", icon: <PenLine className="h-4 w-4" />, fieldType: "signature" },
    { id: "palette_table", label: "Table block", icon: <Table2 className="h-4 w-4" />, fieldType: "table" },
  ];
}

function DraggablePaletteItem({
  item,
  onClick,
}: {
  item: PaletteItem;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { palette: true, fieldType: item.fieldType },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm whitespace-nowrap hover:bg-foreground/5 transition-colors " +
        (isDragging ? "opacity-50" : "")
      }
      {...listeners}
      {...attributes}
      title={`Drag to add ${item.label.toLowerCase()}`}
    >
      {item.icon}
      <span className="font-medium">{item.label}</span>
    </button>
  );
}

function FieldCard({
  field,
  onChange,
  onRemove,
  onToggleActive,
  canDelete = true,
}: {
  field: FieldDef;
  onChange: (next: FieldDef) => void;
  onRemove?: () => void;
  onToggleActive?: () => void;
  canDelete?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const supportsPlaceholder = field.type === "text" || field.type === "date" || field.type === "number";
  const isActive = field.isActive !== false;

  if (isExpanded) {
    return (
      <div className={"rounded-md border border-foreground/20 bg-background p-3 " + (isActive ? "" : "opacity-70")}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-xs font-semibold opacity-70">{field.type}</div>
          <div className="flex items-center gap-1">
            {onToggleActive ? (
              <button
                type="button"
                onClick={onToggleActive}
                className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                title={isActive ? "Hide field" : "Show field"}
              >
                {isActive ? "Hide" : "Show"}
              </button>
            ) : null}
            {onRemove && canDelete ? (
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
                title="Remove field"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
              title="Done editing"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="grid gap-1">
            <div className="text-xs font-medium text-foreground/70">Label</div>
            <input
              className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
              placeholder="e.g., Unit/Location"
            />
          </div>

          {supportsPlaceholder ? (
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Placeholder</div>
              <input
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={(field as any).placeholder ?? ""}
                onChange={(e) => onChange({ ...field, placeholder: e.target.value } as any)}
                placeholder="Optional"
              />
            </div>
          ) : null}

          {field.type === "text" ? (
            <label className="inline-flex items-center gap-2 text-xs text-foreground/80">
              <input
                type="checkbox"
                checked={Boolean((field as any).multiline)}
                onChange={(e) => onChange({ ...field, multiline: e.target.checked } as any)}
              />
              Multiline (comment section)
            </label>
          ) : null}

          {field.type === "temp" ? (
            <>
              <div className="grid gap-1">
                <div className="text-xs font-medium text-foreground/70">Unit</div>
                <select
                  className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                  value={(field as any).unit === "F" ? "F" : "C"}
                  onChange={(e) => onChange({ ...field, unit: e.target.value === "F" ? "F" : "C" } as any)}
                >
                  <option value="C">Celsius (C)</option>
                  <option value="F">Fahrenheit (F)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-foreground/70">Alert below</div>
                  <input
                    type="number"
                    step="0.1"
                    className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                    value={typeof (field as any).alertBelow === "number" ? String((field as any).alertBelow) : ""}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      onChange({ ...field, alertBelow: val === "" ? undefined : Number(val) } as any);
                    }}
                    placeholder="Optional"
                  />
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-foreground/70">Alert above</div>
                  <input
                    type="number"
                    step="0.1"
                    className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                    value={typeof (field as any).alertAbove === "number" ? String((field as any).alertAbove) : ""}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      onChange({ ...field, alertAbove: val === "" ? undefined : Number(val) } as any);
                    }}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={"rounded-md border border-foreground/20 bg-background px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-foreground/5 transition-colors " + (isActive ? "" : "opacity-70")}>
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="flex-1 text-left truncate"
        title={field.label}
      >
        <span className="font-semibold">{field.label}</span>
        <span className="opacity-50 ml-2">({field.type})</span>
        {!isActive ? <span className="ml-2 rounded border border-foreground/20 px-1.5 py-0.5 text-[10px]">Hidden</span> : null}
      </button>
      <div className="flex items-center gap-1">
        {onToggleActive ? (
          <button
            type="button"
            onClick={onToggleActive}
            className="px-2 py-1 rounded-md border border-foreground/20 hover:bg-foreground/10 whitespace-nowrap text-xs"
            title={isActive ? "Hide field" : "Show field"}
          >
            {isActive ? "Hide" : "Show"}
          </button>
        ) : null}
        {onRemove && canDelete ? (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/10"
            title="Remove field"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="px-2 py-1 rounded-md border border-foreground/20 hover:bg-foreground/10 whitespace-nowrap text-xs"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function ColumnTypeSelect({
  value,
  onChange,
}: {
  value: FieldType;
  onChange: (next: FieldType) => void;
}) {
  const options: Array<{ value: FieldType; label: string }> = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "temp", label: "Temp" },
    { value: "time", label: "Time" },
    { value: "checkbox", label: "Checkbox" },
    { value: "yesno", label: "Yes / No" },
    { value: "signature", label: "Signature" },
  ];

  return (
    <select
      className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value as FieldType)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function GridBuilder({
  grid,
  onChange,
  lockExistingDeletes,
  lockedColumnIds,
}: {
  grid: GridSection;
  onChange: (next: GridSection) => void;
  lockExistingDeletes?: boolean;
  lockedColumnIds?: Set<string>;
}) {
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [colEditor, setColEditor] = useState<{ colId: string; top: number; left: number } | null>(null);
  const [selection, setSelection] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [toolsPos, setToolsPos] = useState<{ top: number; left: number } | null>(null);
  const dragAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const undoStackRef = useRef<GridSection[]>([]);
  const longPressRef = useRef<number | null>(null);
  const [mergeDraft, setMergeDraft] = useState<{
    label: string;
    textAlign: "left" | "center" | "right";
    fontSize: "sm" | "md" | "lg";
    fontWeight: "normal" | "medium" | "semibold" | "bold";
    fontStyle: "normal" | "italic";
  } | null>(null);

  function sanitizeMergedCells(next: GridSection): GridSection {
    const rowCount = typeof next.rows === "number" ? Math.max(1, next.rows) : 1;
    const normalized = buildGridLayout(next, rowCount);
    const validMergeIds = new Set<string>();
    for (const row of normalized.rows) {
      for (const cell of row) {
        if (cell.kind === "cell" && cell.mergeId) validMergeIds.add(cell.mergeId);
      }
    }
    if (!next.mergedCells?.length) return next;
    return { ...next, mergedCells: next.mergedCells.filter((cell) => validMergeIds.has(cell.id)) };
  }

  function cloneGridState(next: GridSection): GridSection {
    return JSON.parse(JSON.stringify(next)) as GridSection;
  }

  function applyGridChange(next: GridSection, options?: { skipHistory?: boolean }) {
    if (!options?.skipHistory) {
      undoStackRef.current.push(cloneGridState(grid));
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    }
    onChange(sanitizeMergedCells(next));
  }

  function undoLastChange() {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    onChange(previous);
  }

  const activeCol = useMemo(
    () => grid.columns.find((c) => c.id === activeColId) ?? null,
    [grid.columns, activeColId]
  );

  useEffect(() => {
    if (!colEditor) return;

    function onMouseDown(ev: MouseEvent) {
      const pop = popoverRef.current;
      if (!pop) return;
      if (ev.target instanceof Node && pop.contains(ev.target)) return;
      setColEditor(null);
    }

    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setColEditor(null);
    }

    function onAnyScroll() {
      setColEditor(null);
    }

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onAnyScroll, true);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onAnyScroll, true);
    };
  }, [colEditor]);

  useEffect(() => {
    if (!selection) {
      setMergeDraft(null);
      return;
    }
    const sel = normalizeSelection(selection);
    const merge = findMergeAt(sel.startRow, sel.startCol);
    if (!merge) {
      setMergeDraft(null);
      return;
    }
    setMergeDraft({
      label: merge.field?.label || "",
      textAlign: (merge.field?.textAlign as "left" | "center" | "right") || "left",
      fontSize: (merge.field?.fontSize as "sm" | "md" | "lg") || "md",
      fontWeight: (merge.field?.fontWeight as "normal" | "medium" | "semibold" | "bold") || "normal",
      fontStyle: (merge.field?.fontStyle as "normal" | "italic") || "normal",
    });
  }, [selection, grid.mergedCells]);

  useEffect(() => {
    function stopSelecting() {
      setIsSelecting(false);
      dragAnchorRef.current = null;
    }
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, []);

  useEffect(() => {
    return () => {
      if (longPressRef.current != null) {
        window.clearTimeout(longPressRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function onUndo(ev: KeyboardEvent) {
      const isUndoKey = (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z";
      if (!isUndoKey) return;
      ev.preventDefault();
      undoLastChange();
    }
    window.addEventListener("keydown", onUndo);
    return () => window.removeEventListener("keydown", onUndo);
  }, []);

  function updateColumn(colId: string, patch: Partial<SimpleFieldDef>) {
    applyGridChange({
      ...grid,
      columns: grid.columns.map((c) => (c.id === colId ? ({ ...c, ...patch } as any) : c)),
    });
  }

  function addColumn() {
    const colId = makeId("col");
    const nextCol: SimpleFieldDef = { id: colId, type: "text", label: "Column", required: false } as any;
    applyGridChange({ ...grid, columns: [...grid.columns, nextCol] });
    setActiveColId(colId);
  }

  const previewRows = typeof grid.rows === "number" ? Math.max(1, grid.rows) : 1;
  const layout = useMemo(() => buildGridLayout(grid, previewRows), [grid, previewRows]);
  const activeColumns = layout.columns;

  function normalizeSelection(sel: NonNullable<typeof selection>) {
    const startRow = Math.min(sel.startRow, sel.endRow);
    const endRow = Math.max(sel.startRow, sel.endRow);
    const startCol = Math.min(sel.startCol, sel.endCol);
    const endCol = Math.max(sel.startCol, sel.endCol);
    return {
      startRow,
      endRow,
      startCol,
      endCol,
      rowSpan: endRow - startRow + 1,
      colSpan: endCol - startCol + 1,
    };
  }

  function mergeRange(cell: GridMergedCell) {
    const rowSpan = Math.max(1, cell.rowSpan || 1);
    const colSpan = Math.max(1, cell.colSpan || 1);
    return {
      startRow: cell.row,
      endRow: cell.row + rowSpan - 1,
      startCol: cell.col,
      endCol: cell.col + colSpan - 1,
      rowSpan,
      colSpan,
    };
  }

  function rangesOverlap(a: ReturnType<typeof normalizeSelection>, b: ReturnType<typeof normalizeSelection>) {
    return !(a.endRow < b.startRow || a.startRow > b.endRow || a.endCol < b.startCol || a.startCol > b.endCol);
  }

  function findMergeAt(rowIndex: number, colIndex: number) {
    return (grid.mergedCells || []).find((cell) => {
      const r = mergeRange(cell);
      return rowIndex >= r.startRow && rowIndex <= r.endRow && colIndex >= r.startCol && colIndex <= r.endCol;
    }) || null;
  }

  function selectionOverlapsMerge(sel: ReturnType<typeof normalizeSelection>) {
    return (grid.mergedCells || []).some((cell) => rangesOverlap(sel, mergeRange(cell)));
  }

  function overlappingMerges(sel: ReturnType<typeof normalizeSelection>) {
    return (grid.mergedCells || []).filter((cell) => rangesOverlap(sel, mergeRange(cell)));
  }

  function selectionContainsRange(
    sel: ReturnType<typeof normalizeSelection>,
    range: ReturnType<typeof mergeRange>
  ) {
    return (
      sel.startRow <= range.startRow &&
      sel.endRow >= range.endRow &&
      sel.startCol <= range.startCol &&
      sel.endCol >= range.endCol
    );
  }

  function updateMerge(mergeId: string, patch: Partial<GridMergedCell>) {
    applyGridChange({
      ...grid,
      mergedCells: (grid.mergedCells || []).map((cell) => (cell.id === mergeId ? { ...cell, ...patch } : cell)),
    });
  }

  const normalizedSelection = selection ? normalizeSelection(selection) : null;
  const selectedMerge = normalizedSelection ? findMergeAt(normalizedSelection.startRow, normalizedSelection.startCol) : null;
  const overlaps = normalizedSelection ? overlappingMerges(normalizedSelection) : [];
  const canExpandFromSingleMerge =
    Boolean(normalizedSelection) &&
    overlaps.length === 1 &&
    selectionContainsRange(normalizedSelection!, mergeRange(overlaps[0]));
  const canMerge =
    Boolean(normalizedSelection) &&
    Boolean(normalizedSelection && (normalizedSelection.rowSpan > 1 || normalizedSelection.colSpan > 1)) &&
    Boolean(normalizedSelection && (!selectionOverlapsMerge(normalizedSelection) || canExpandFromSingleMerge));
  const canUnmerge = Boolean(selectedMerge);

  function mergeSelected() {
    if (!normalizedSelection) return;
    const id = makeId("merge");
    const merged: GridMergedCell = {
      id,
      row: normalizedSelection.startRow,
      col: normalizedSelection.startCol,
      rowSpan: normalizedSelection.rowSpan,
      colSpan: normalizedSelection.colSpan,
      field: {
        id,
        type: "text",
        label: "Merged cell",
        required: false,
      },
    };
    const nextMergedCells = canExpandFromSingleMerge
      ? (grid.mergedCells || []).filter((cell) => cell.id !== overlaps[0].id)
      : (grid.mergedCells || []);
    applyGridChange({ ...grid, mergedCells: [...nextMergedCells, merged] });
    setSelection({
      startRow: normalizedSelection.startRow,
      startCol: normalizedSelection.startCol,
      endRow: normalizedSelection.endRow,
      endCol: normalizedSelection.endCol,
    });
  }

  function unmergeSelected() {
    if (!selectedMerge) return;
    applyGridChange({
      ...grid,
      mergedCells: (grid.mergedCells || []).filter((cell) => cell.id !== selectedMerge.id),
    });
    setSelection(null);
  }

  return (
    <div className="rounded-lg border border-foreground/20 bg-background p-4 flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-foreground/20">
        <div>
          <div className="text-sm font-semibold">Data Log Table</div>
          <div className="text-xs text-foreground/70 mt-0.5">
            Click headers to edit columns
          </div>
          <div className="text-[11px] text-foreground/55 mt-1">
            Tip: Right-click or long-press cells/headers for contextual tools.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="row-count" className="text-xs font-medium text-foreground/70">Rows:</label>
            <input
              id="row-count"
              type="number"
              min={1}
              className="h-8 w-16 rounded-md border border-foreground/20 bg-background px-2 text-xs"
              value={typeof grid.rows === "number" ? grid.rows : 1}
              onChange={(e) => {
                const next = Math.max(1, Number(e.target.value || 1));
                applyGridChange({ ...grid, rows: next });
              }}
            />
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
              onClick={() => {
                const current = typeof grid.rows === "number" ? Math.max(1, grid.rows) : 1;
                applyGridChange({ ...grid, rows: current + 1 });
              }}
              title="Add one row"
            >
              + Row
            </button>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
            onClick={addColumn}
          >
            <Plus className="h-3.5 w-3.5" />
            Add column
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5 disabled:opacity-50"
            onClick={undoLastChange}
            disabled={undoStackRef.current.length === 0}
            title="Undo last table edit (Ctrl/Cmd+Z)"
          >
            Undo
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto flex-1 flex flex-col">
        <table className="w-full min-w-max border-collapse text-xs border border-foreground/35">
          <thead>
            <tr>
              {activeColumns.map((col) => (
                <th
                  key={col.id}
                  className={
                    "border border-foreground/35 bg-background px-3 py-2 text-left text-xs font-semibold text-foreground/70 " +
                    (col.type === "checkbox" ? "w-16" : "")
                  }
                  style={col.type === "checkbox" ? { width: 72, minWidth: 72 } : undefined}
                >
                  <button
                    type="button"
                    className={
                      "w-full rounded-md px-2 py-1 hover:bg-foreground/5 " +
                      (col.type === "checkbox" ? "text-center" : "text-left ") +
                      (activeColId === col.id ? "bg-foreground/5" : "")
                    }
                    onClick={(e) => {
                      setActiveColId(col.id);
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const estimatedPopoverHeight = 260;
                      const desiredTop = rect.top - estimatedPopoverHeight - 8;
                      const top = desiredTop >= 12 ? desiredTop : rect.bottom + 8;
                      const desiredLeft = rect.left;
                      const maxLeft = Math.max(12, window.innerWidth - 340);
                      setColEditor({ colId: col.id, top, left: Math.min(desiredLeft, maxLeft) });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveColId(col.id);
                      setColEditor({
                        colId: col.id,
                        top: e.clientY + 8,
                        left: e.clientX + 8,
                      });
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (!touch) return;
                      if (longPressRef.current != null) window.clearTimeout(longPressRef.current);
                      longPressRef.current = window.setTimeout(() => {
                        setActiveColId(col.id);
                        setColEditor({
                          colId: col.id,
                          top: touch.clientY + 8,
                          left: touch.clientX + 8,
                        });
                      }, 450);
                    }}
                    onTouchEnd={() => {
                      if (longPressRef.current != null) {
                        window.clearTimeout(longPressRef.current);
                        longPressRef.current = null;
                      }
                    }}
                    title="Edit column"
                  >
                    {col.label || "Click to edit / column name"}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: previewRows }).map((_, rowIndex) => (
              <tr key={`preview-row-${rowIndex}`}>
                {layout.rows[rowIndex]?.map((cell, colIndex) => {
                  if (!cell || cell.kind === "covered") return null;
                  const col = cell.field;
                  const isSelected =
                    normalizedSelection &&
                    rowIndex >= normalizedSelection.startRow &&
                    rowIndex <= normalizedSelection.endRow &&
                    colIndex >= normalizedSelection.startCol &&
                    colIndex <= normalizedSelection.endCol;

                  return (
                    <td
                      key={`${col.id}-${rowIndex}-${cell.mergeId || "cell"}`}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      className={
                        "h-9 border border-foreground/35 px-3 py-2 text-xs " +
                        (col.type === "checkbox" ? "w-16 text-center" : "") +
                        (isSelected ? " bg-foreground/10" : " bg-background")
                      }
                      style={col.type === "checkbox" ? { width: 72, minWidth: 72 } : undefined}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        const merge = findMergeAt(rowIndex, colIndex);
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setToolsPos({ top: Math.max(12, rect.top - 44), left: rect.left });
                        if (merge) {
                          const range = mergeRange(merge);
                          setSelection({
                            startRow: range.startRow,
                            startCol: range.startCol,
                            endRow: range.endRow,
                            endCol: range.endCol,
                          });
                          return;
                        }
                        dragAnchorRef.current = { row: rowIndex, col: colIndex };
                        setIsSelecting(true);
                        if (e.shiftKey && selection) {
                          setSelection({
                            ...selection,
                            endRow: rowIndex,
                            endCol: colIndex,
                          });
                          return;
                        }
                        if (selection) {
                          const current = normalizeSelection(selection);
                          const clickedInsideCurrent =
                            rowIndex >= current.startRow &&
                            rowIndex <= current.endRow &&
                            colIndex >= current.startCol &&
                            colIndex <= current.endCol;
                          if (!clickedInsideCurrent) {
                            setSelection({
                              ...selection,
                              endRow: rowIndex,
                              endCol: colIndex,
                            });
                            return;
                          }
                        }
                        setSelection({
                          startRow: rowIndex,
                          startCol: colIndex,
                          endRow: rowIndex,
                          endCol: colIndex,
                        });
                      }}
                      onMouseEnter={() => {
                        if (!isSelecting || !dragAnchorRef.current) return;
                        setSelection({
                          startRow: dragAnchorRef.current.row,
                          startCol: dragAnchorRef.current.col,
                          endRow: rowIndex,
                          endCol: colIndex,
                        });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const merge = findMergeAt(rowIndex, colIndex);
                        if (merge) {
                          const range = mergeRange(merge);
                          setSelection({
                            startRow: range.startRow,
                            startCol: range.startCol,
                            endRow: range.endRow,
                            endCol: range.endCol,
                          });
                        } else {
                          setSelection({
                            startRow: rowIndex,
                            startCol: colIndex,
                            endRow: rowIndex,
                            endCol: colIndex,
                          });
                        }
                        setToolsPos({ top: e.clientY + 8, left: e.clientX + 8 });
                      }}
                      onTouchStart={(e) => {
                        const touch = e.touches[0];
                        if (!touch) return;
                        if (longPressRef.current != null) window.clearTimeout(longPressRef.current);
                        longPressRef.current = window.setTimeout(() => {
                          const merge = findMergeAt(rowIndex, colIndex);
                          if (merge) {
                            const range = mergeRange(merge);
                            setSelection({
                              startRow: range.startRow,
                              startCol: range.startCol,
                              endRow: range.endRow,
                              endCol: range.endCol,
                            });
                          } else {
                            setSelection({
                              startRow: rowIndex,
                              startCol: colIndex,
                              endRow: rowIndex,
                              endCol: colIndex,
                            });
                          }
                          setToolsPos({ top: touch.clientY + 8, left: touch.clientX + 8 });
                        }, 450);
                      }}
                      onTouchEnd={() => {
                        if (longPressRef.current != null) {
                          window.clearTimeout(longPressRef.current);
                          longPressRef.current = null;
                        }
                      }}
                      title="Click to select cell"
                    >
                      {cell.mergeId ? col.label || "Merged cell" : rowIndex === 0 ? (col.type === "yesno" ? "yes/no" : col.type) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toolsPos && normalizedSelection ? (
        <div
          className="fixed z-40 w-[360px] rounded-md border border-foreground/30 bg-background p-2 shadow-md"
          style={{ top: toolsPos.top, left: toolsPos.left }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-foreground/25 px-2 text-xs hover:bg-foreground/5 disabled:opacity-50"
              onClick={mergeSelected}
              disabled={!canMerge}
            >
              Merge
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-foreground/25 px-2 text-xs hover:bg-foreground/5 disabled:opacity-50"
              onClick={unmergeSelected}
              disabled={!canUnmerge}
            >
              Unmerge
            </button>
            <button
              type="button"
              className="ml-auto inline-flex h-7 items-center justify-center rounded-md border border-foreground/25 px-2 text-xs hover:bg-foreground/5"
              onClick={() => setToolsPos(null)}
            >
              Close
            </button>
          </div>
          {selectedMerge && mergeDraft ? (
            <div className="mt-2 grid gap-2">
              <div className="text-[11px] font-medium text-foreground/60">Merged label (header text)</div>
              <input
                className="h-8 rounded-md border border-foreground/25 bg-background px-2 text-xs"
                value={mergeDraft.label}
                placeholder="Add field label"
                onChange={(e) => setMergeDraft((prev) => (prev ? { ...prev, label: e.target.value } : prev))}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-8 rounded-md border border-foreground/20 bg-background px-2 text-xs"
                  value={mergeDraft.textAlign}
                  onChange={(e) =>
                    setMergeDraft((prev) =>
                      prev ? { ...prev, textAlign: e.target.value as "left" | "center" | "right" } : prev
                    )
                  }
                >
                  <option value="left">Align Left</option>
                  <option value="center">Align Center</option>
                  <option value="right">Align Right</option>
                </select>
                <select
                  className="h-8 rounded-md border border-foreground/20 bg-background px-2 text-xs"
                  value={mergeDraft.fontSize}
                  onChange={(e) =>
                    setMergeDraft((prev) => (prev ? { ...prev, fontSize: e.target.value as "sm" | "md" | "lg" } : prev))
                  }
                >
                  <option value="sm">Small text</option>
                  <option value="md">Normal text</option>
                  <option value="lg">Large text</option>
                </select>
                <select
                  className="h-8 rounded-md border border-foreground/20 bg-background px-2 text-xs"
                  value={mergeDraft.fontWeight}
                  onChange={(e) =>
                    setMergeDraft((prev) =>
                      prev ? { ...prev, fontWeight: e.target.value as "normal" | "medium" | "semibold" | "bold" } : prev
                    )
                  }
                >
                  <option value="normal">Weight Normal</option>
                  <option value="medium">Weight Medium</option>
                  <option value="semibold">Weight Semi-bold</option>
                  <option value="bold">Weight Bold</option>
                </select>
                <label className="inline-flex h-8 items-center gap-2 rounded-md border border-foreground/20 bg-background px-2 text-xs">
                  <input
                    type="checkbox"
                    checked={mergeDraft.fontStyle === "italic"}
                    onChange={(e) =>
                      setMergeDraft((prev) => (prev ? { ...prev, fontStyle: e.target.checked ? "italic" : "normal" } : prev))
                    }
                  />
                  Italic
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-foreground/60">
                  {selectedMerge.rowSpan || 1} x {selectedMerge.colSpan || 1}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                    onClick={() =>
                      setMergeDraft({
                        label: selectedMerge.field?.label || "",
                        textAlign: (selectedMerge.field?.textAlign as "left" | "center" | "right") || "left",
                        fontSize: (selectedMerge.field?.fontSize as "sm" | "md" | "lg") || "md",
                        fontWeight: (selectedMerge.field?.fontWeight as "normal" | "medium" | "semibold" | "bold") || "normal",
                        fontStyle: (selectedMerge.field?.fontStyle as "normal" | "italic") || "normal",
                      })
                    }
                  >
                    Revert
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center justify-center rounded-md bg-foreground px-2 text-xs text-background hover:opacity-90"
                    onClick={() =>
                      updateMerge(selectedMerge.id, {
                        field: {
                          ...(selectedMerge.field || { id: selectedMerge.id, type: "text", required: false }),
                          label: mergeDraft.label,
                          textAlign: mergeDraft.textAlign,
                          fontSize: mergeDraft.fontSize,
                          fontWeight: mergeDraft.fontWeight,
                          fontStyle: mergeDraft.fontStyle,
                        },
                      })
                    }
                  >
                    Apply tweaks
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {colEditor && activeCol && colEditor.colId === activeCol.id ? (
        <div
          ref={popoverRef}
          className="fixed z-50 w-80 rounded-md border border-foreground/20 bg-background p-3 shadow-lg"
          style={{ top: colEditor.top, left: colEditor.left }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-foreground/70">Column</div>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded hover:bg-foreground/5"
              onClick={() => setColEditor(null)}
            >
              Done
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Header name</div>
              <input
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={activeCol.label}
                onChange={(e) => updateColumn(activeCol.id, { label: e.target.value } as any)}
                placeholder="Column name"
                autoFocus
              />
            </div>
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Data type</div>
              <ColumnTypeSelect
                value={activeCol.type as FieldType}
                onChange={(nextType) => {
                  const patch: any = { type: nextType };
                  if (nextType === "temp" && !("unit" in activeCol)) patch.unit = "C";
                  applyGridChange({
                    ...grid,
                    columns: grid.columns.map((c) =>
                      c.id === activeCol.id ? ({ ...c, ...patch } as any) : c
                    ),
                  });
                }}
              />
            </div>

            {activeCol.type === "temp" ? (
              <>
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-foreground/70">Temperature unit</div>
                  <select
                    className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                    value={(activeCol as any).unit === "F" ? "F" : "C"}
                    onChange={(e) => updateColumn(activeCol.id, { unit: e.target.value === "F" ? "F" : "C" } as any)}
                  >
                    <option value="C">Celsius (C)</option>
                    <option value="F">Fahrenheit (F)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <div className="text-xs font-medium text-foreground/70">Alert below</div>
                    <input
                      type="number"
                      step="0.1"
                      className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                      value={typeof (activeCol as any).alertBelow === "number" ? String((activeCol as any).alertBelow) : ""}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        updateColumn(activeCol.id, { alertBelow: val === "" ? undefined : Number(val) } as any);
                      }}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="grid gap-1">
                    <div className="text-xs font-medium text-foreground/70">Alert above</div>
                    <input
                      type="number"
                      step="0.1"
                      className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                      value={typeof (activeCol as any).alertAbove === "number" ? String((activeCol as any).alertAbove) : ""}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        updateColumn(activeCol.id, { alertAbove: val === "" ? undefined : Number(val) } as any);
                      }}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </>
            ) : null}
            <label className="inline-flex items-center gap-2 text-xs text-foreground/80">
              <input
                type="checkbox"
                checked={activeCol.isActive !== false}
                onChange={(e) => updateColumn(activeCol.id, { isActive: e.target.checked } as any)}
              />
              Column active
            </label>
            {!lockExistingDeletes || !lockedColumnIds?.has(activeCol.id) ? (
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md border border-red-300 px-2 text-xs text-red-700 hover:bg-red-50"
                onClick={() => {
                  applyGridChange({ ...grid, columns: grid.columns.filter((c) => c.id !== activeCol.id) });
                  setColEditor(null);
                  setActiveColId(null);
                }}
              >
                Delete column
              </button>
            ) : (
              <div className="text-xs text-foreground/60">
                Existing columns are locked because this template has submissions.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FormBuilder({
  initialSections,
  onChangeSections,
  title,
  onTitleChange,
  formType = "custom",
  lockExistingDeletes = false,
  lockedFieldIds = [],
  lockedGridColumnIds = [],
  resetKey,
}: {
  initialSections?: FormSection[];
  onChangeSections: (sections: FormSection[]) => void;
  title?: string;
  onTitleChange?: (next: string) => void;
  formType?: FormType;
  lockExistingDeletes?: boolean;
  lockedFieldIds?: string[];
  lockedGridColumnIds?: string[];
  resetKey?: string;
}) {
  const initialState = useMemo<BuilderState>(() => {
    const topFields: FieldDef[] = [];
    const bottomFields: FieldDef[] = [];
    let topFieldsColumns: 1 | 2 | 3 | 4 = 1;
    let bottomFieldsColumns: 1 | 2 | 3 | 4 = 1;
    let grid: GridSection | null = null;

    if (initialSections?.length) {
      for (const section of initialSections) {
        if (section.type === "fields") {
          if (section.title?.toLowerCase().includes("footer")) {
            bottomFields.push(...section.fields);
            bottomFieldsColumns = section.columns || bottomFieldsColumns;
          } else {
            topFields.push(...section.fields);
            topFieldsColumns = section.columns || topFieldsColumns;
          }
          continue;
        }
        if (section.type === "grid" && !grid) {
          grid = section;
          continue;
        }
      }
    }

    return { topFields, topFieldsColumns, bottomFields, bottomFieldsColumns, grid };
  }, [initialSections]);

  const [state, setState] = useState<BuilderState>(initialState);

  useEffect(() => {
    if (typeof resetKey === "string") {
      setState(initialState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const [activeDrag, setActiveDrag] = useState<PaletteItem | null>(null);
  const [insertTarget, setInsertTarget] = useState<"top" | "bottom">("top");
  const [questionLabel, setQuestionLabel] = useState("");
  const [questionType, setQuestionType] = useState<FieldType>(formType === "answer-sheet" ? "text" : "yesno");
  const lockedFieldIdSet = useMemo(() => new Set(lockedFieldIds), [lockedFieldIds]);
  const lockedGridColumnIdSet = useMemo(() => new Set(lockedGridColumnIds), [lockedGridColumnIds]);
  useEffect(() => {
    if (formType === "questionnaire") {
      setQuestionType("yesno");
      return;
    }
    if (formType === "answer-sheet") {
      setQuestionType("text");
    }
  }, [formType]);


  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const computedSections = useMemo<FormSection[]>(() => {
    const sections: FormSection[] = [{ type: "fields", title: "Fields", columns: state.topFieldsColumns, fields: state.topFields }];
    if (state.grid) sections.push(state.grid);
    if (state.bottomFields.length) {
      sections.push({ type: "fields", title: "Footer", columns: state.bottomFieldsColumns, fields: state.bottomFields });
    }
    return sections;
  }, [state.bottomFields, state.bottomFieldsColumns, state.grid, state.topFields, state.topFieldsColumns]);

  function sync(next: BuilderState) {
    setState(next);
    const sections: FormSection[] = [{ type: "fields", title: "Fields", columns: next.topFieldsColumns, fields: next.topFields }];
    if (next.grid) sections.push(next.grid);
    if (next.bottomFields.length) {
      sections.push({ type: "fields", title: "Footer", columns: next.bottomFieldsColumns, fields: next.bottomFields });
    }
    onChangeSections(sections);
  }

  function addItem(fieldType: FieldType | "table", target: "top" | "bottom" = "top") {
    if (fieldType === "table") {
      if (state.grid) return;
      sync({ ...state, grid: defaultGrid() });
      return;
    }
    const nextField = defaultField(fieldType);
    if (target === "bottom") {
      sync({ ...state, bottomFields: [...state.bottomFields, nextField] });
      return;
    }
    sync({ ...state, topFields: [...state.topFields, nextField] });
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const item = palette().find((p) => p.id === id) ?? null;
    setActiveDrag(item);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);

    const overId = event.over?.id ? String(event.over.id) : "";
    const data = event.active.data.current as any;

    if (!data?.palette) return;

    const fieldType = data.fieldType as FieldType | "table";

    if (fieldType === "table") {
      if (overId !== "drop_canvas" && overId !== "drop_top_fields" && overId !== "drop_bottom_fields") return;
      addItem(fieldType, "top");
      return;
    }

    if (overId === "drop_bottom_fields") {
      addItem(fieldType, "bottom");
      return;
    }
    if (overId === "drop_canvas" || overId === "drop_top_fields") {
      addItem(fieldType, "top");
    }
  }

  const showQuestionTools = formType === "questionnaire" || formType === "answer-sheet";

  function addQuestion() {
    const label = questionLabel.trim();
    if (!label) return;
    const nextField = defaultField(questionType);
    nextField.label = label;
    if (formType === "answer-sheet" && nextField.type === "text") {
      nextField.multiline = true;
    }
    sync({ ...state, topFields: [...state.topFields, nextField] });
    setQuestionLabel("");
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col">
        {/* Ribbon */}
        <div className="border-b border-foreground/20 bg-background px-3 py-3 sm:px-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Insert</div>
              <div className="inline-flex items-center rounded-md border border-foreground/20 bg-background p-0.5 text-xs">
                <button
                  type="button"
                  className={
                    "rounded px-2 py-1 " +
                    (insertTarget === "top" ? "bg-foreground text-background" : "hover:bg-foreground/5")
                  }
                  onClick={() => setInsertTarget("top")}
                >
                  Add to top
                </button>
                <button
                  type="button"
                  className={
                    "rounded px-2 py-1 " +
                    (insertTarget === "bottom" ? "bg-foreground text-background" : "hover:bg-foreground/5")
                  }
                  onClick={() => setInsertTarget("bottom")}
                >
                  Add to footer
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {palette().map((item) => (
                <DraggablePaletteItem
                  key={item.id}
                  item={item}
                  onClick={() => addItem(item.fieldType, insertTarget)}
                />
              ))}
            </div>
            <div className="rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-xs text-foreground/70">
              <span className="font-semibold">How to build your form:</span> Tap a field button to add it to the selected target (top/footer), or drag a field into either drop area.
            </div>
          </div>
        </div>

        {/* Page Canvas */}
        <main className="overflow-visible">
          <CanvasDropSurface>
            <div data-formbuilder-scroll="true" className="p-3 pb-44 sm:p-6 sm:pb-52">
              <div className="w-full">
                <div className="rounded-lg border border-foreground/20 bg-background p-6">
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Page</div>

                  <div className="mt-4 flex justify-center">
                    <div className="w-full max-w-xl">
                      <label className="mb-1 block text-center text-xs font-medium uppercase tracking-wide text-foreground/70">
                        Form Title
                      </label>
                      <input
                        className="h-11 w-full rounded-md border border-foreground/20 bg-background px-4 text-center text-lg font-semibold"
                        value={title ?? ""}
                        onChange={(e) => onTitleChange?.(e.target.value)}
                        placeholder="Form title"
                      />
                    </div>
                  </div>

                  {state.topFields.length === 0 && state.bottomFields.length === 0 && !state.grid ? (
                    <div className="mt-4 rounded-md border border-dashed border-foreground/20 p-10 text-center text-sm text-foreground/60">
                      Click a tool above to insert, or drag tools onto this page.
                    </div>
                  ) : null}

                  {showQuestionTools ? (
                    <div className="mt-4 rounded-md border border-foreground/15 bg-foreground/[0.03] p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                        Quick question
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_180px_120px]">
                        <input
                          className="h-9 rounded-md border border-foreground/20 bg-background px-3 text-sm"
                          placeholder="Type the question label"
                          value={questionLabel}
                          onChange={(e) => setQuestionLabel(e.target.value)}
                        />
                        <select
                          className="h-9 rounded-md border border-foreground/20 bg-background px-3 text-sm"
                          value={questionType}
                          onChange={(e) => setQuestionType(e.target.value as FieldType)}
                        >
                          <option value="text">Text</option>
                          <option value="yesno">Yes / No</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="time">Time</option>
                          <option value="signature">Signature</option>
                          <option value="photo">Photo</option>
                        </select>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                          onClick={addQuestion}
                        >
                          Add
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-foreground/60">
                        {formType === "answer-sheet"
                          ? "Answer sheet: questions default to multiline text responses."
                          : "Questionnaire: pick the response type for each question."}
                      </div>
                    </div>
                  ) : null}

                  <FieldDropArea id="drop_top_fields" label="Top fields">
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="text-xs text-foreground/60">Arrange the upper section in a multi-column flow.</div>
                      <SectionColumnsSelect
                        label="Columns"
                        value={state.topFieldsColumns}
                        onChange={(columns) => sync({ ...state, topFieldsColumns: columns })}
                      />
                    </div>
                    {state.topFields.length ? (
                      <div className={"mt-3 " + sectionColumnsClass(state.topFieldsColumns)}>
                        {state.topFields.map((f) => (
                          <FieldCard
                            key={f.id}
                            field={f}
                            canDelete={!(lockExistingDeletes && lockedFieldIdSet.has(f.id))}
                            onToggleActive={
                              lockExistingDeletes && lockedFieldIdSet.has(f.id)
                                ? () => {
                                    sync({
                                      ...state,
                                      topFields: state.topFields.map((x) =>
                                        x.id === f.id ? ({ ...x, isActive: x.isActive === false ? true : false } as FieldDef) : x
                                      ),
                                    });
                                  }
                                : undefined
                            }
                            onChange={(next) => {
                              sync({ ...state, topFields: state.topFields.map((x) => (x.id === f.id ? next : x)) });
                            }}
                            onRemove={() => {
                              sync({ ...state, topFields: state.topFields.filter((x) => x.id !== f.id) });
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-foreground/60">Drag fields here to place them above the table.</div>
                    )}
                  </FieldDropArea>

                  <div className="mt-6">
                    {state.grid ? (
                      <div className="min-h-[420px]">
                        <GridBuilder
                          grid={state.grid}
                          onChange={(next) => sync({ ...state, grid: next })}
                          lockExistingDeletes={lockExistingDeletes}
                          lockedColumnIds={lockedGridColumnIdSet}
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-foreground/20 bg-background/50 p-10 text-center">
                        <div className="text-sm text-foreground/60">Insert a Table block to add a data grid.</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6">
                    <FieldDropArea id="drop_bottom_fields" label="Footer fields">
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-xs text-foreground/60">Keep signatures, notes, and confirmations grouped in the footer.</div>
                        <SectionColumnsSelect
                          label="Columns"
                          value={state.bottomFieldsColumns}
                          onChange={(columns) => sync({ ...state, bottomFieldsColumns: columns })}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                          onClick={() => addItem("text", "bottom")}
                        >
                          + Text
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                          onClick={() => {
                            const commentField = {
                              ...defaultField("text"),
                              label: "Comments",
                              multiline: true,
                            } as FieldDef;
                            sync({ ...state, bottomFields: [...state.bottomFields, commentField] });
                          }}
                        >
                          + Comment
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                          onClick={() => addItem("date", "bottom")}
                        >
                          + Date
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                          onClick={() => addItem("number", "bottom")}
                        >
                          + Number
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                          onClick={() => addItem("signature", "bottom")}
                        >
                          + Signature
                        </button>
                      </div>

                      {state.bottomFields.length ? (
                        <div className={"mt-3 " + sectionColumnsClass(state.bottomFieldsColumns)}>
                          {state.bottomFields.map((f) => (
                            <FieldCard
                              key={f.id}
                              field={f}
                              canDelete={!(lockExistingDeletes && lockedFieldIdSet.has(f.id))}
                              onToggleActive={
                                lockExistingDeletes && lockedFieldIdSet.has(f.id)
                                  ? () => {
                                      sync({
                                        ...state,
                                        bottomFields: state.bottomFields.map((x) =>
                                          x.id === f.id ? ({ ...x, isActive: x.isActive === false ? true : false } as FieldDef) : x
                                        ),
                                      });
                                    }
                                  : undefined
                              }
                              onChange={(next) => {
                                sync({ ...state, bottomFields: state.bottomFields.map((x) => (x.id === f.id ? next : x)) });
                              }}
                              onRemove={() => {
                                sync({ ...state, bottomFields: state.bottomFields.filter((x) => x.id !== f.id) });
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-foreground/60">Drag fields here to place them below the table.</div>
                      )}
                    </FieldDropArea>
                  </div>
                </div>
              </div>
            </div>
          </CanvasDropSurface>
        </main>

        {/* keep computedSections fresh for parent */}
        <SchemaSyncEffect sections={computedSections} onSync={onChangeSections} />
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm shadow-lg">
            <div className="flex items-center gap-2">
              {activeDrag.icon}
              <span className="font-medium">{activeDrag.label}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function CanvasDropSurface({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "drop_canvas" });
  return (
    <div
      ref={setNodeRef}
      className={
        "w-full bg-background/50 transition-colors " +
        (isOver ? "bg-foreground/5 outline outline-2 outline-foreground/30" : "")
      }
    >
      {children}
    </div>
  );
}

function FieldDropArea({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={
        "mt-4 rounded-md border border-dashed border-foreground/20 p-3 transition-colors " +
        (isOver ? "bg-foreground/5 border-foreground/40" : "")
      }
    >
      <div className="text-xs font-medium text-foreground/70">{label}</div>
      {children}
    </div>
  );
}

function SchemaSyncEffect({
  sections,
  onSync,
}: {
  sections: FormSection[];
  onSync: (sections: FormSection[]) => void;
}) {
  // Sync after render (not during) to avoid parent state updates during child render.
  useEffect(() => {
    onSync(sections);
  }, [onSync, sections]);

  return null;
}
