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
import {
  Calendar,
  Camera,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  Hash,
  UnfoldHorizontal,
  Minus,
  PenLine,
  Plus,
  Table2,
  Tag,
  Thermometer,
  Trash2,
} from "lucide-react";
import {
  COLUMN_DEFAULT_WIDTH_PX,
  COLUMN_HEADER_PLACEHOLDER,
  COLUMN_MAX_WIDTH_PX,
  COLUMN_MIN_WIDTH_PX,
  clampColumnWidthPx,
  columnHeaderDisplayLabel,
  isColumnHeaderPlaceholder,
} from "@/lib/formFieldConstants";
import { displayAlignClass, displayFieldText, displayVariantClass } from "@/lib/displayFieldStyles";
import type { FieldDef, FieldType, FormSection, FormType, GridMergedCell, GridSection, SimpleFieldDef } from "@/types/forms";
import {
  buildSectionsFromBuilderState,
  defaultGridSectionForType,
  getFormBuilderConfig,
  resolvePaletteSplit,
  sectionTitleForBuilder,
  starterCanvasForType,
} from "@/lib/formBuilderConfig";
import { buildGridLayout } from "@/lib/gridLayout";
import { CenteredOverlay } from "@/components/ui/CenteredOverlay";

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
        columns: [{ id: "col1", label: COLUMN_HEADER_PLACEHOLDER, type: "text" }],
      };
    case "display":
      return {
        id,
        type: "display",
        label: "Instruction or form code",
        required: false,
        variant: "body",
        content: "",
        textAlign: "left",
      };
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { id, type: fieldType as any, label: "Field", required: false };
  }
}

function defaultGrid(formType: FormType): GridSection {
  const section = defaultGridSectionForType(formType);
  if (section.type !== "grid") {
    return {
      type: "grid",
      id: "form_data",
      title: "Log Sheet",
      rows: 10,
      columns: [
        { id: "col_1", type: "text", label: COLUMN_HEADER_PLACEHOLDER, required: false },
        { id: "col_2", type: "text", label: COLUMN_HEADER_PLACEHOLDER, required: false },
        { id: "col_3", type: "text", label: COLUMN_HEADER_PLACEHOLDER, required: false },
      ],
    };
  }
  return section;
}

function columnWidthPx(col: SimpleFieldDef): number {
  const w = (col as { widthPx?: number }).widthPx;
  return typeof w === "number" && Number.isFinite(w) ? clampColumnWidthPx(w) : COLUMN_DEFAULT_WIDTH_PX;
}

function ColumnResizeHandle({
  onResizeDelta,
}: {
  onResizeDelta: (deltaPx: number) => void;
}) {
  const startX = useRef(0);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize column"
      title="Drag to resize column"
      className="absolute right-0 top-0 z-20 flex h-full w-4 cursor-col-resize touch-none items-center justify-center border-l border-transparent hover:border-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_12%,white)]"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startX.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
        const delta = e.clientX - startX.current;
        if (Math.abs(delta) < 2) return;
        startX.current = e.clientX;
        onResizeDelta(delta);
      }}
      onPointerUp={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <UnfoldHorizontal className="h-3.5 w-3.5 text-foreground/45" aria-hidden />
    </span>
  );
}

function defaultMetadataHeaderFields(): FieldDef[] {
  return [
    { id: makeId("week"), type: "text", label: "Week", required: false, placeholder: "" },
    { id: makeId("month"), type: "text", label: "Month", required: false, placeholder: "" },
    { id: makeId("year"), type: "text", label: "Year", required: false, placeholder: "" },
    { id: makeId("issue_date"), type: "date", label: "Issue date", required: false, placeholder: "" },
  ];
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

const PALETTE_CATALOG: PaletteItem[] = [
  { id: "palette_display", label: "Label", icon: <Tag className="h-4 w-4" />, fieldType: "display" },
  { id: "palette_text", label: "Text", icon: <FileText className="h-4 w-4" />, fieldType: "text" },
  { id: "palette_date", label: "Date", icon: <Calendar className="h-4 w-4" />, fieldType: "date" },
  { id: "palette_number", label: "Number", icon: <Hash className="h-4 w-4" />, fieldType: "number" },
  { id: "palette_yesno", label: "Yes / No", icon: <Check className="h-4 w-4" />, fieldType: "yesno" },
  { id: "palette_checkbox", label: "Checkbox", icon: <CheckSquare className="h-4 w-4" />, fieldType: "checkbox" },
  { id: "palette_time", label: "Time", icon: <Calendar className="h-4 w-4" />, fieldType: "time" },
  { id: "palette_temp", label: "Temperature", icon: <Thermometer className="h-4 w-4" />, fieldType: "temp" },
  { id: "palette_photo", label: "Photo", icon: <Camera className="h-4 w-4" />, fieldType: "photo" },
  { id: "palette_signature", label: "Signature", icon: <PenLine className="h-4 w-4" />, fieldType: "signature" },
  { id: "palette_table", label: "Table", icon: <Table2 className="h-4 w-4" />, fieldType: "table" },
];

function paletteForFormType(formType: FormType): PaletteItem[] {
  const allowed = new Set(getFormBuilderConfig(formType).paletteTypes);
  return PALETTE_CATALOG.filter((item) => allowed.has(item.fieldType));
}

function splitPaletteItems(allItems: PaletteItem[], formType: FormType) {
  const { quickTypes, moreTypes } = resolvePaletteSplit(formType);
  const quickSet = new Set(quickTypes);
  const moreSet = new Set(moreTypes);
  return {
    quickPaletteItems: allItems.filter((item) => quickSet.has(item.fieldType)),
    morePaletteItems: allItems.filter((item) => moreSet.has(item.fieldType)),
  };
}

function PaletteMoreToolsMenu({
  items,
  open,
  onClose,
  onPick,
}: {
  items: PaletteItem[];
  open: boolean;
  onClose: () => void;
  onPick: (fieldType: FieldType | "table") => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="More field tools"
      className="absolute left-0 top-full z-30 mt-1 min-w-[min(100%,20rem)] max-w-md rounded-md border border-foreground/20 bg-background p-2 shadow-lg"
    >
      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
        Additional tools
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <DraggablePaletteItem
            key={item.id}
            item={item}
            onClick={() => {
              onPick(item.fieldType);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
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

function DisplayFieldCard({
  field,
  isActive,
  isExpanded,
  setIsExpanded,
  onChange,
  onRemove,
  canDelete,
}: {
  field: import("@/types/forms").DisplayField;
  isActive: boolean;
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
  onChange: (next: import("@/types/forms").DisplayField) => void;
  onRemove?: () => void;
  canDelete?: boolean;
}) {
  const previewText = displayFieldText(field);
  const variant = field.variant || "body";

  if (isExpanded) {
    return (
      <div
        className={
          "rounded-md border border-dashed border-[var(--hse-teal)]/40 bg-[var(--hse-cream)]/30 p-3 " +
          (isActive ? "" : "opacity-70")
        }
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-[var(--hse-teal)]">Read-only label</div>
          <div className="flex items-center gap-1">
            {onRemove && canDelete ? (
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="grid gap-1">
            <div className="text-xs font-medium text-foreground/70">Short title (optional)</div>
            <input
              className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
              placeholder="e.g. Form F-12"
            />
          </div>
          <div className="grid gap-1">
            <div className="text-xs font-medium text-foreground/70">Display text</div>
            <textarea
              className="min-h-20 w-full rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-xs"
              value={field.content ?? ""}
              onChange={(e) => onChange({ ...field, content: e.target.value })}
              placeholder="Instructions, legal text, form number, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Style</div>
              <select
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={variant}
                onChange={(e) =>
                  onChange({
                    ...field,
                    variant: e.target.value as import("@/types/forms").DisplayVariant,
                  })
                }
              >
                <option value="title">Title</option>
                <option value="subtitle">Subtitle</option>
                <option value="body">Body / instruction</option>
                <option value="caption">Caption</option>
                <option value="code">Code / form number</option>
              </select>
            </div>
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Align</div>
              <select
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={field.textAlign || "left"}
                onChange={(e) =>
                  onChange({
                    ...field,
                    textAlign: e.target.value as "left" | "center" | "right",
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </div>
        <div
          className={
            "mt-3 rounded-md border border-foreground/10 bg-background/80 px-3 py-2 " +
            displayAlignClass(field.textAlign) +
            " " +
            displayVariantClass(variant)
          }
        >
          {previewText}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        "rounded-md border border-dashed border-[var(--hse-teal)]/35 bg-[var(--hse-cream)]/20 px-3 py-2 " +
        (isActive ? "" : "opacity-60")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setIsExpanded(true)}>
          <div className={"whitespace-pre-wrap " + displayAlignClass(field.textAlign) + " " + displayVariantClass(variant)}>
            {previewText}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--hse-teal-mid)]">Label Â· not submitted</div>
        </button>
        {onRemove && canDelete ? (
          <button type="button" onClick={onRemove} className="shrink-0 rounded-md border border-foreground/20 p-1 hover:bg-foreground/5">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
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

  if (field.type === "display") {
    return (
      <DisplayFieldCard
        field={field as import("@/types/forms").DisplayField}
        isActive={isActive}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
        onChange={onChange as (next: import("@/types/forms").DisplayField) => void}
        onRemove={onRemove}
        canDelete={canDelete}
      />
    );
  }

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

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Text align</div>
              <select
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={field.textAlign || "left"}
                onChange={(e) =>
                  onChange({ ...field, textAlign: e.target.value as "left" | "center" | "right" })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Font size</div>
              <select
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={field.fontSize || "md"}
                onChange={(e) => onChange({ ...field, fontSize: e.target.value as "sm" | "md" | "lg" })}
              >
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            </div>
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Font weight</div>
              <select
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={field.fontWeight || "normal"}
                onChange={(e) =>
                  onChange({
                    ...field,
                    fontWeight: e.target.value as "normal" | "medium" | "semibold" | "bold",
                  })
                }
              >
                <option value="normal">Normal</option>
                <option value="medium">Medium</option>
                <option value="semibold">Semibold</option>
                <option value="bold">Bold</option>
              </select>
            </div>
            <div className="grid gap-1">
              <div className="text-xs font-medium text-foreground/70">Font style</div>
              <select
                className="h-8 w-full rounded-md border border-foreground/20 bg-background px-2 text-xs"
                value={field.fontStyle || "normal"}
                onChange={(e) => onChange({ ...field, fontStyle: e.target.value as "normal" | "italic" })}
              >
                <option value="normal">Normal</option>
                <option value="italic">Italic</option>
              </select>
            </div>
          </div>
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

function ColumnEditorModal({
  activeCol,
  grid,
  lockExistingDeletes,
  lockedColumnIds,
  onClose,
  onUpdateColumn,
  onApplyGridChange,
  onDelete,
}: {
  activeCol: SimpleFieldDef;
  grid: GridSection;
  lockExistingDeletes?: boolean;
  lockedColumnIds?: Set<string>;
  onClose: () => void;
  onUpdateColumn: (colId: string, patch: Partial<SimpleFieldDef>) => void;
  onApplyGridChange: (next: GridSection) => void;
  onDelete: () => void;
}) {
  return (
    <CenteredOverlay open maxWidthClass="max-w-sm" onClose={onClose}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 border-b border-foreground/10 pb-3">
          <div>
            <div className="text-sm font-semibold">Edit column</div>
            <div className="text-xs text-foreground/60">Set the header name, type, and size</div>
          </div>
          <button
            type="button"
            className="rounded-md border border-foreground/20 px-3 py-1.5 text-xs font-medium hover:bg-foreground/5"
            onClick={onClose}
          >
            Done
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <div className="text-xs font-medium text-foreground/70">Header name</div>
            <input
              className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
              value={activeCol.label}
              onChange={(e) => onUpdateColumn(activeCol.id, { label: e.target.value } as Partial<SimpleFieldDef>)}
              placeholder={COLUMN_HEADER_PLACEHOLDER}
              autoFocus
            />
          </div>
          <div className="grid gap-1">
            <div className="text-xs font-medium text-foreground/70">Data type</div>
            <ColumnTypeSelect
              value={activeCol.type as FieldType}
              onChange={(nextType) => {
                const patch: Partial<SimpleFieldDef> = { type: nextType as SimpleFieldDef["type"] };
                if (nextType === "temp" && !("unit" in activeCol)) (patch as { unit?: "C" | "F" }).unit = "C";
                onApplyGridChange({
                  ...grid,
                  columns: grid.columns.map((c) =>
                    c.id === activeCol.id ? ({ ...c, ...patch } as SimpleFieldDef) : c
                  ),
                });
              }}
            />
          </div>
          <div className="grid gap-1">
            <div className="text-xs font-medium text-foreground/70">Column size</div>
            <div className="text-[11px] leading-4 text-foreground/55">
              Drag the resize handle on the column header, use the slider, or type a pixel width ({COLUMN_MIN_WIDTH_PX}–{COLUMN_MAX_WIDTH_PX}).
            </div>
            <div className="grid grid-cols-[36px_1fr_36px] items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
                onClick={() =>
                  onUpdateColumn(activeCol.id, {
                    widthPx: clampColumnWidthPx(columnWidthPx(activeCol) - 20),
                  } as Partial<SimpleFieldDef>)
                }
                title="Narrower"
                aria-label="Narrower column"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={COLUMN_MIN_WIDTH_PX}
                max={COLUMN_MAX_WIDTH_PX}
                step={10}
                className="h-9 w-full rounded-md border border-foreground/20 bg-background px-2 text-sm"
                value={columnWidthPx(activeCol)}
                onChange={(e) => {
                  const n = Number(e.target.value || COLUMN_DEFAULT_WIDTH_PX);
                  onUpdateColumn(activeCol.id, {
                    widthPx: clampColumnWidthPx(n),
                  } as Partial<SimpleFieldDef>);
                }}
              />
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
                onClick={() =>
                  onUpdateColumn(activeCol.id, {
                    widthPx: clampColumnWidthPx(columnWidthPx(activeCol) + 20),
                  } as Partial<SimpleFieldDef>)
                }
                title="Wider"
                aria-label="Wider column"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <input
              type="range"
              min={COLUMN_MIN_WIDTH_PX}
              max={COLUMN_MAX_WIDTH_PX}
              step={10}
              className="mt-1 w-full accent-[var(--hse-teal)]"
              value={columnWidthPx(activeCol)}
              onChange={(e) =>
                onUpdateColumn(activeCol.id, {
                  widthPx: clampColumnWidthPx(Number(e.target.value)),
                } as Partial<SimpleFieldDef>)
              }
              aria-label="Column width slider"
            />
          </div>

          {activeCol.type === "temp" ? (
            <>
              <div className="grid gap-1">
                <div className="text-xs font-medium text-foreground/70">Temperature unit</div>
                <select
                  className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                  value={(activeCol as { unit?: string }).unit === "F" ? "F" : "C"}
                  onChange={(e) =>
                    onUpdateColumn(activeCol.id, { unit: e.target.value === "F" ? "F" : "C" } as Partial<SimpleFieldDef>)
                  }
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
                    className="h-9 w-full rounded-md border border-foreground/20 bg-background px-2 text-sm"
                    value={
                      typeof (activeCol as { alertBelow?: number }).alertBelow === "number"
                        ? String((activeCol as { alertBelow?: number }).alertBelow)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      onUpdateColumn(activeCol.id, {
                        alertBelow: val === "" ? undefined : Number(val),
                      } as Partial<SimpleFieldDef>);
                    }}
                    placeholder="Optional"
                  />
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-foreground/70">Alert above</div>
                  <input
                    type="number"
                    step="0.1"
                    className="h-9 w-full rounded-md border border-foreground/20 bg-background px-2 text-sm"
                    value={
                      typeof (activeCol as { alertAbove?: number }).alertAbove === "number"
                        ? String((activeCol as { alertAbove?: number }).alertAbove)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      onUpdateColumn(activeCol.id, {
                        alertAbove: val === "" ? undefined : Number(val),
                      } as Partial<SimpleFieldDef>);
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
              onChange={(e) => onUpdateColumn(activeCol.id, { isActive: e.target.checked } as Partial<SimpleFieldDef>)}
            />
            Column active
          </label>

          {!lockExistingDeletes || !lockedColumnIds?.has(activeCol.id) ? (
            <button
              type="button"
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-red-300 text-sm text-red-700 hover:bg-red-50"
              onClick={onDelete}
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
    </CenteredOverlay>
  );
}

function GridBuilder({
  grid,
  onChange,
  onRemoveTable,
  lockExistingDeletes,
  lockedColumnIds,
  compact = false,
}: {
  grid: GridSection;
  onChange: (next: GridSection) => void;
  onRemoveTable?: () => void;
  lockExistingDeletes?: boolean;
  lockedColumnIds?: Set<string>;
  compact?: boolean;
}) {
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);
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
    () => grid.columns.find((c) => c.id === (editingColumnId || activeColId)) ?? null,
    [grid.columns, activeColId, editingColumnId]
  );

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
  const nextCol: SimpleFieldDef = { id: colId, type: "text", label: COLUMN_HEADER_PLACEHOLDER, required: false } as any;
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
    <div className={"rounded-lg border border-foreground/20 bg-background flex flex-col h-full " + (compact ? "p-3" : "p-4")}>
      <div className={"flex items-center justify-between gap-4 border-b border-foreground/20 " + (compact ? "pb-3" : "pb-4")}>
        <div>
          <div className="text-sm font-semibold">Data Log Table</div>
          <div className="text-xs text-foreground/70 mt-0.5">
            Click headers to edit columns
          </div>
          <div className={"text-[11px] text-foreground/55 mt-1 " + (compact ? "hidden sm:block" : "")}>
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
          {onRemoveTable ? (
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-red-200 px-2 text-xs text-red-700 hover:bg-red-50"
              onClick={onRemoveTable}
              title="Remove table from form"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove table
            </button>
          ) : null}
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
                    "relative border border-foreground/35 bg-background px-3 py-2 text-left text-xs font-semibold text-foreground/70 " +
                    (col.type === "checkbox" ? "w-16" : "")
                  }
                  style={
                    col.type === "checkbox"
                      ? { width: 72, minWidth: 72 }
                      : { width: columnWidthPx(col), minWidth: columnWidthPx(col) }
                  }
                >
                  {col.type !== "checkbox" ? (
                    <ColumnResizeHandle
                      onResizeDelta={(delta) =>
                        updateColumn(col.id, {
                          widthPx: clampColumnWidthPx(columnWidthPx(col) + delta),
                        } as Partial<SimpleFieldDef>)
                      }
                    />
                  ) : null}
                  <button
                    type="button"
                    className={
                      "w-full rounded-md px-2 py-1 hover:bg-foreground/5 " +
                      (col.type === "checkbox" ? "text-center" : "text-left ") +
                      (activeColId === col.id ? "bg-foreground/5" : "")
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveColId(col.id);
                      setEditingColumnId(col.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveColId(col.id);
                      setEditingColumnId(col.id);
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (!touch) return;
                      if (longPressRef.current != null) window.clearTimeout(longPressRef.current);
                      longPressRef.current = window.setTimeout(() => {
                        setActiveColId(col.id);
                        setEditingColumnId(col.id);
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
                    <span
                      className={
                        isColumnHeaderPlaceholder(col.label)
                          ? "inline-flex items-center gap-1 italic text-foreground/45"
                          : ""
                      }
                    >
                      {columnHeaderDisplayLabel(col.label)}
                      {isColumnHeaderPlaceholder(col.label) ? (
                        <PenLine className="h-3.5 w-3.5 shrink-0" />
                      ) : null}
                    </span>
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
                      style={
                        col.type === "checkbox"
                          ? { width: 72, minWidth: 72 }
                          : typeof (col as any).widthPx === "number" && Number.isFinite((col as any).widthPx)
                            ? {
                                width: columnWidthPx(col),
                                minWidth: columnWidthPx(col),
                              }
                            : undefined
                      }
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

      {editingColumnId && activeCol && activeCol.id === editingColumnId ? (
        <ColumnEditorModal
          activeCol={activeCol}
          grid={grid}
          lockExistingDeletes={lockExistingDeletes}
          lockedColumnIds={lockedColumnIds}
          onClose={() => setEditingColumnId(null)}
          onUpdateColumn={updateColumn}
          onApplyGridChange={applyGridChange}
          onDelete={() => {
            applyGridChange({ ...grid, columns: grid.columns.filter((c) => c.id !== activeCol.id) });
            setEditingColumnId(null);
            setActiveColId(null);
          }}
        />
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
  const builderConfig = useMemo(() => getFormBuilderConfig(formType), [formType]);

  const initialState = useMemo<BuilderState>(() => {
    const topFields: FieldDef[] = [];
    const bottomFields: FieldDef[] = [];
    let topFieldsColumns: 1 | 2 | 3 | 4 = builderConfig.headerColumnsDefault;
    let bottomFieldsColumns: 1 | 2 | 3 | 4 = 1;
    let grid: GridSection | null = null;

    if (initialSections?.length) {
      for (const section of initialSections) {
        if (section.type === "fields") {
          const bucket = sectionTitleForBuilder(section, formType);
          if (bucket === "bottom") {
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
  }, [initialSections, formType, builderConfig.headerColumnsDefault]);

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
  const [questionType, setQuestionType] = useState<FieldType>(builderConfig.defaultQuestionFieldType);
  const [compactBuilder, setCompactBuilder] = useState(false);
  const [headerAreaOpen, setHeaderAreaOpen] = useState(() => initialState.topFields.length > 0);
  const [footerAreaOpen, setFooterAreaOpen] = useState(() => initialState.bottomFields.length > 0);
  const paletteItems = useMemo(() => paletteForFormType(formType), [formType]);
  const { quickPaletteItems, morePaletteItems } = useMemo(
    () => splitPaletteItems(paletteItems, formType),
    [paletteItems, formType]
  );
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const lockedFieldIdSet = useMemo(() => new Set(lockedFieldIds), [lockedFieldIds]);
  const lockedGridColumnIdSet = useMemo(() => new Set(lockedGridColumnIds), [lockedGridColumnIds]);
  useEffect(() => {
    setQuestionType(builderConfig.defaultQuestionFieldType);
    if (state.topFields.length === 0) setHeaderAreaOpen(false);
    if (state.bottomFields.length === 0) setFooterAreaOpen(false);
    setMoreToolsOpen(false);
  }, [formType, builderConfig.defaultQuestionFieldType, state.topFields.length, state.bottomFields.length]);

  useEffect(() => {
    if (typeof resetKey === "string") {
      setHeaderAreaOpen(initialState.topFields.length > 0);
      setFooterAreaOpen(initialState.bottomFields.length > 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const computedSections = useMemo<FormSection[]>(
    () => buildSectionsFromBuilderState(state, formType),
    [state, formType]
  );

  function sync(next: BuilderState) {
    setState(next);
    onChangeSections(buildSectionsFromBuilderState(next, formType));
  }

  function applyStarterLayout() {
    const starter = starterCanvasForType(formType);
    const topFields: FieldDef[] = [];
    const bottomFields: FieldDef[] = [];
    let topFieldsColumns: 1 | 2 | 3 | 4 = builderConfig.headerColumnsDefault;
    let bottomFieldsColumns: 1 | 2 | 3 | 4 = 1;
    let grid: GridSection | null = null;

    for (const section of starter) {
      if (section.type === "fields") {
        const bucket = sectionTitleForBuilder(section, formType);
        if (bucket === "bottom") {
          bottomFields.push(...section.fields);
          bottomFieldsColumns = section.columns || bottomFieldsColumns;
        } else {
          topFields.push(...section.fields);
          topFieldsColumns = section.columns || topFieldsColumns;
        }
        continue;
      }
      if (section.type === "grid") grid = section;
    }

    sync({ topFields, topFieldsColumns, bottomFields, bottomFieldsColumns, grid });
  }

  function addItem(fieldType: FieldType | "table", target: "top" | "bottom" = "top") {
    if (fieldType === "table") {
      if (state.grid) return;
      sync({ ...state, grid: defaultGrid(formType) });
      return;
    }
    const nextField = defaultField(fieldType);
    if (target === "bottom") {
      if (!footerAreaOpen) setFooterAreaOpen(true);
      sync({ ...state, bottomFields: [...state.bottomFields, nextField] });
      return;
    }
    if (!headerAreaOpen) setHeaderAreaOpen(true);
    sync({ ...state, topFields: [...state.topFields, nextField] });
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const item =
      quickPaletteItems.find((p) => p.id === id) ?? morePaletteItems.find((p) => p.id === id) ?? null;
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

  const showQuestionTools = builderConfig.showQuestionTools;

  function addQuestion() {
    const label = questionLabel.trim();
    if (!label) return;
    const nextField = defaultField(questionType);
    nextField.label = label;
    if (formType === "answer-sheet" && nextField.type === "text") {
      nextField.multiline = true;
    }
    if (!headerAreaOpen) setHeaderAreaOpen(true);
    sync({ ...state, topFields: [...state.topFields, nextField] });
    setQuestionLabel("");
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col">
        {/* Ribbon */}
        <div className="border-b border-foreground/20 bg-background px-3 py-3 sm:px-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-3">
            <div className="min-w-0 flex-1 rounded-md border border-foreground/15 bg-foreground/[0.02] p-2">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Quick add · {builderConfig.label}
              </div>
              <div className="relative flex flex-wrap items-center gap-2">
                {quickPaletteItems.map((item) => (
                  <DraggablePaletteItem
                    key={item.id}
                    item={item}
                    onClick={() => addItem(item.fieldType, insertTarget)}
                  />
                ))}
                {morePaletteItems.length > 0 ? (
                  <div className="relative">
                    <button
                      type="button"
                      className={
                        "inline-flex items-center gap-1.5 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm whitespace-nowrap hover:bg-foreground/5 " +
                        (moreToolsOpen ? "border-[var(--hse-teal)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)]" : "")
                      }
                      aria-expanded={moreToolsOpen}
                      aria-haspopup="menu"
                      onClick={() => setMoreToolsOpen((open) => !open)}
                    >
                      <Ellipsis className="h-4 w-4 text-foreground/55" />
                      <span className="font-medium">More tools</span>
                      <ChevronDown
                        className={
                          "h-4 w-4 text-foreground/45 transition-transform " +
                          (moreToolsOpen ? "rotate-180" : "")
                        }
                      />
                    </button>
                    <PaletteMoreToolsMenu
                      items={morePaletteItems}
                      open={moreToolsOpen}
                      onClose={() => setMoreToolsOpen(false)}
                      onPick={(fieldType) => addItem(fieldType, insertTarget)}
                    />
                  </div>
                ) : null}
              </div>
              {builderConfig.starterGrid ? (
                <button
                  type="button"
                  className="mt-2 inline-flex h-7 items-center justify-center rounded-md border border-dashed border-foreground/25 px-2 text-[11px] text-foreground/70 hover:bg-foreground/5"
                  onClick={applyStarterLayout}
                >
                  Load starter layout
                </button>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-stretch gap-2">
              {builderConfig.showPlacementToggle ? (
              <div className="rounded-md border border-foreground/15 bg-foreground/[0.02] p-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/60">Placement</div>
                <div className="inline-flex items-center rounded-md border border-foreground/20 bg-background p-0.5 text-xs">
                  <button
                    type="button"
                    className={
                      "rounded px-2 py-1 " +
                      (insertTarget === "top" ? "bg-foreground text-background" : "hover:bg-foreground/5")
                    }
                    onClick={() => setInsertTarget("top")}
                  >
                    {builderConfig.sectionLabels.header}
                  </button>
                  {builderConfig.sections.footer ? (
                    <button
                      type="button"
                      className={
                        "rounded px-2 py-1 " +
                        (insertTarget === "bottom" ? "bg-foreground text-background" : "hover:bg-foreground/5")
                      }
                      onClick={() => setInsertTarget("bottom")}
                    >
                      {builderConfig.sectionLabels.footer}
                    </button>
                  ) : null}
                </div>
              </div>
              ) : null}

              <div className="rounded-md border border-foreground/15 bg-foreground/[0.02] p-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/60">View</div>
                <button
                  type="button"
                  className="inline-flex h-7 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                  onClick={() => setCompactBuilder((v) => !v)}
                >
                  {compactBuilder ? "Expanded layout" : "Compact layout"}
                </button>
              </div>
            </div>
          </div>
          <div className={"mt-2 rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-xs text-foreground/70 " + (compactBuilder ? "hidden sm:block" : "")}>
            <span className="font-semibold">{builderConfig.label}:</span> {builderConfig.description}
          </div>
        </div>

        {/* Page Canvas */}
        <main className="overflow-visible">
          <CanvasDropSurface>
            <div data-formbuilder-scroll="true" className={compactBuilder ? "p-2 pb-36 sm:p-4 sm:pb-44" : "p-3 pb-44 sm:p-6 sm:pb-52"}>
              <div className="w-full">
                <div className={"rounded-lg border-2 border-foreground/40 bg-background shadow-sm " + (compactBuilder ? "p-4" : "p-6")}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Page</div>

                  <div className="mt-4 flex justify-center">
                    <div className="w-full max-w-xl">
                      <label className="mb-1 block text-center text-xs font-medium uppercase tracking-wide text-foreground/70">
                        Add form title
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
                    <div className="mt-4 rounded-md border border-dashed border-foreground/20 p-6 text-center text-sm text-foreground/60">
                      Use the tools above, or add a block below to start building.
                    </div>
                  ) : null}

                  {(() => {
                    const canAddHeader = builderConfig.sections.header && !headerAreaOpen;
                    const canAddTable = builderConfig.sections.table && !state.grid;
                    const canAddFooter = builderConfig.sections.footer && !footerAreaOpen;
                    if (!canAddHeader && !canAddTable && !canAddFooter) return null;
                    return (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canAddHeader ? (
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-full border border-dashed border-[var(--hse-teal)] px-3 text-xs font-medium text-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)]"
                            onClick={() => setHeaderAreaOpen(true)}
                          >
                            + {builderConfig.sectionLabels.header}
                          </button>
                        ) : null}
                        {canAddTable ? (
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-full border border-dashed border-[var(--hse-teal)] px-3 text-xs font-medium text-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)]"
                            onClick={() => addItem("table", "top")}
                          >
                            + {builderConfig.sectionLabels.table}
                          </button>
                        ) : null}
                        {canAddFooter ? (
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-full border border-dashed border-[var(--hse-teal)] px-3 text-xs font-medium text-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)]"
                            onClick={() => setFooterAreaOpen(true)}
                          >
                            + {builderConfig.sectionLabels.footer}
                          </button>
                        ) : null}
                      </div>
                    );
                  })()}

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

                  {builderConfig.sections.header && headerAreaOpen ? (
                  <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      {builderConfig.sectionLabels.header}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-red-600 hover:underline"
                      onClick={() => {
                        sync({ ...state, topFields: [] });
                        setHeaderAreaOpen(false);
                      }}
                    >
                      Remove section
                    </button>
                  </div>
                  <FieldDropArea id="drop_top_fields" label={builderConfig.sectionLabels.header}>
                      <div className="mt-2 flex items-center justify-between gap-3">
                      <div className={"text-xs text-foreground/60 " + (compactBuilder ? "hidden sm:block" : "")}>Brand/report metadata fields shown at the top of the form.</div>
                      <SectionColumnsSelect
                        label="Columns"
                        value={state.topFieldsColumns}
                        onChange={(columns) => sync({ ...state, topFieldsColumns: columns })}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                        onClick={() => addItem("display", "top")}
                      >
                        + Label / instruction
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                        onClick={() => {
                          const f = defaultField("display") as import("@/types/forms").DisplayField;
                          f.variant = "code";
                          f.label = "Form reference";
                          f.content = "e.g. F-12 / Rev. 3";
                          sync({ ...state, topFields: [...state.topFields, f] });
                        }}
                      >
                        + Form code
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                        onClick={() => addItem("text", "top")}
                      >
                        + Text field
                      </button>
                      {builderConfig.showMetadataStarter ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                        onClick={() => sync({ ...state, topFields: defaultMetadataHeaderFields() })}
                      >
                        Add metadata starter
                      </button>
                      ) : null}
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
                              const next = state.topFields.filter((x) => x.id !== f.id);
                              sync({ ...state, topFields: next });
                              if (next.length === 0) setHeaderAreaOpen(false);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-foreground/60">Drag fields here to place them above the table.</div>
                    )}
                  </FieldDropArea>
                  </div>
                  ) : null}

                  {state.grid ? (
                  <div className="mt-5">
                    <GridBuilder
                      grid={state.grid}
                      onChange={(next) => sync({ ...state, grid: next })}
                      onRemoveTable={() => sync({ ...state, grid: null })}
                      lockExistingDeletes={lockExistingDeletes}
                      lockedColumnIds={lockedGridColumnIdSet}
                      compact={compactBuilder}
                    />
                  </div>
                  ) : null}

                  {builderConfig.sections.footer && footerAreaOpen ? (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                        {builderConfig.sectionLabels.footer}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-red-600 hover:underline"
                        onClick={() => {
                          sync({ ...state, bottomFields: [] });
                          setFooterAreaOpen(false);
                        }}
                      >
                        Remove section
                      </button>
                    </div>
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
                          onClick={() => addItem("display", "bottom")}
                        >
                          + Label
                        </button>
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
                                const next = state.bottomFields.filter((x) => x.id !== f.id);
                                sync({ ...state, bottomFields: next });
                                if (next.length === 0) setFooterAreaOpen(false);
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-foreground/60">Drag fields here for sign-off or notes.</div>
                      )}
                    </FieldDropArea>
                  </div>
                  ) : null}
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
