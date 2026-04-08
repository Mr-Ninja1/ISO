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
import { Calendar, Check, FileText, Hash, PenLine, Plus, Table2, Trash2 } from "lucide-react";
import type { FieldDef, FieldType, FormSection, GridSection, SimpleFieldDef } from "@/types/forms";

type BuilderState = {
  topFields: FieldDef[];
  bottomFields: FieldDef[];
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
    case "temp":
      return { id, type: "temp", label: "Temperature", required: false, unit: "C" };
    case "checkbox":
      return { id, type: "checkbox", label: "Checkbox", required: false };
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

function palette(): PaletteItem[] {
  return [
    { id: "palette_text", label: "Text field", icon: <FileText className="h-4 w-4" />, fieldType: "text" },
    { id: "palette_date", label: "Date field", icon: <Calendar className="h-4 w-4" />, fieldType: "date" },
    { id: "palette_number", label: "Number field", icon: <Hash className="h-4 w-4" />, fieldType: "number" },
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
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  function updateColumn(colId: string, patch: Partial<SimpleFieldDef>) {
    onChange({
      ...grid,
      columns: grid.columns.map((c) => (c.id === colId ? ({ ...c, ...patch } as any) : c)),
    });
  }

  function addColumn() {
    const colId = makeId("col");
    const nextCol: SimpleFieldDef = { id: colId, type: "text", label: "Column", required: false } as any;
    onChange({ ...grid, columns: [...grid.columns, nextCol] });
    setActiveColId(colId);
  }

  const previewRows = typeof grid.rows === "number" ? Math.max(1, grid.rows) : 1;
  const activeColumns = grid.columns.filter((c) => c.isActive !== false);

  return (
    <div className="rounded-lg border border-foreground/20 bg-background p-4 flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-foreground/20">
        <div>
          <div className="text-sm font-semibold">Data Log Table</div>
          <div className="text-xs text-foreground/70 mt-0.5">
            Click headers to edit columns
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
                onChange({ ...grid, rows: next });
              }}
            />
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
            onClick={addColumn}
          >
            <Plus className="h-3.5 w-3.5" />
            Add column
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto flex-1 flex flex-col">
        <table className="w-full min-w-max border-collapse text-xs border border-foreground/20">
          <thead>
            <tr>
              {activeColumns.map((col) => (
                <th
                  key={col.id}
                  className={
                    "border border-foreground/20 bg-background px-3 py-2 text-left text-xs font-semibold text-foreground/70 " +
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
                {activeColumns.map((col) => (
                  <td
                    key={`${col.id}-${rowIndex}`}
                    className={
                      "h-9 border border-foreground/20 bg-background px-3 py-2 text-xs text-foreground/45 " +
                      (col.type === "checkbox" ? "w-16 text-center" : "")
                    }
                    style={col.type === "checkbox" ? { width: 72, minWidth: 72 } : undefined}
                  >
                    {rowIndex === 0 ? col.type : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                  onChange({
                    ...grid,
                    columns: grid.columns.map((c) =>
                      c.id === activeCol.id ? ({ ...c, ...patch } as any) : c
                    ),
                  });
                }}
              />
            </div>
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
                  onChange({ ...grid, columns: grid.columns.filter((c) => c.id !== activeCol.id) });
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
  lockExistingDeletes = false,
  lockedFieldIds = [],
  lockedGridColumnIds = [],
  resetKey,
}: {
  initialSections?: FormSection[];
  onChangeSections: (sections: FormSection[]) => void;
  title?: string;
  onTitleChange?: (next: string) => void;
  lockExistingDeletes?: boolean;
  lockedFieldIds?: string[];
  lockedGridColumnIds?: string[];
  resetKey?: string;
}) {
  const initialState = useMemo<BuilderState>(() => {
    const topFields: FieldDef[] = [];
    const bottomFields: FieldDef[] = [];
    let grid: GridSection | null = null;

    if (initialSections?.length) {
      for (const section of initialSections) {
        if (section.type === "fields") {
          if (section.title?.toLowerCase().includes("footer")) bottomFields.push(...section.fields);
          else topFields.push(...section.fields);
          continue;
        }
        if (section.type === "grid" && !grid) {
          grid = section;
          continue;
        }
      }
    }

    return { topFields, bottomFields, grid };
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
  const lockedFieldIdSet = useMemo(() => new Set(lockedFieldIds), [lockedFieldIds]);
  const lockedGridColumnIdSet = useMemo(() => new Set(lockedGridColumnIds), [lockedGridColumnIds]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const computedSections = useMemo<FormSection[]>(() => {
    const sections: FormSection[] = [{ type: "fields", title: "Fields", fields: state.topFields }];
    if (state.grid) sections.push(state.grid);
    if (state.bottomFields.length) {
      sections.push({ type: "fields", title: "Footer", fields: state.bottomFields });
    }
    return sections;
  }, [state.bottomFields, state.grid, state.topFields]);

  function sync(next: BuilderState) {
    setState(next);
    const sections: FormSection[] = [{ type: "fields", title: "Fields", fields: next.topFields }];
    if (next.grid) sections.push(next.grid);
    if (next.bottomFields.length) {
      sections.push({ type: "fields", title: "Footer", fields: next.bottomFields });
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

                  <FieldDropArea id="drop_top_fields" label="Top fields">
                    {state.topFields.length ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                        <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
