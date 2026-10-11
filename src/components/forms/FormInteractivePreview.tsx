"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Hand, MousePointerClick, RotateCcw } from "lucide-react";
import type { FieldDef, FormSchemaV1, FormSection, FormStyle, TempField } from "@/types/forms";
import { buildDefaultValues, buildZodSchema } from "@/lib/schemaDrivenForm";
import { displayAlignClass, displayFieldText, displayVariantClass } from "@/lib/displayFieldStyles";
import {
  fieldCardShellClass,
  formStyleTokens,
  isCompactDisplayField,
  sectionFieldsGridClass,
} from "@/lib/fieldLayout";
import { GridField } from "@/components/forms/GridField";
import { Controller } from "react-hook-form";

type FormValues = Record<string, unknown>;

type Props = {
  title: string;
  sections: FormSection[];
  formStyle?: FormStyle;
  maxHeightClass?: string;
  /** Show the “try it yourself” helper banner */
  showHelper?: boolean;
  auditorMode?: boolean;
  className?: string;
};

function PreviewField({
  field,
  register,
  control,
  dense,
}: {
  field: FieldDef;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  control: ReturnType<typeof useForm<FormValues>>["control"];
  dense?: boolean;
}) {
  const lineInputClass = dense
    ? "h-8 w-full border-0 border-b border-foreground/25 bg-transparent px-0.5 text-sm outline-none focus:border-[var(--hse-teal)]"
    : "h-10 w-full rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--hse-teal)_45%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)]";
  const stackClass = dense ? "flex flex-col gap-0.5" : "flex flex-col gap-1.5";
  const labelClass = dense
    ? "text-[11px] font-semibold uppercase tracking-wide text-foreground/55"
    : "text-xs font-medium text-foreground/75";

  if (field.type === "display") {
    const compactMeta = isCompactDisplayField(field);
    return (
      <div
        className={
          (compactMeta
            ? "px-0.5 py-0.5 whitespace-pre-wrap "
            : "rounded-md border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 whitespace-pre-wrap ") +
          displayAlignClass(field.textAlign) +
          " " +
          displayVariantClass(field.variant || "body")
        }
      >
        {displayFieldText(field)}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--hse-teal)]" {...register(field.id)} />
        <span className={labelClass}>
          {field.label}
          {field.required ? <span className="ml-1 text-foreground/50">*</span> : null}
        </span>
      </label>
    );
  }

  if (field.type === "yesno") {
    return (
      <div className={stackClass}>
        <span className={labelClass}>
          {field.label}
          {field.required ? <span className="ml-1 text-foreground/50">*</span> : null}
        </span>
        <select className={lineInputClass} {...register(field.id)}>
          <option value="">Select…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>
    );
  }

  if (field.type === "signature") {
    return (
      <div className={stackClass}>
        <span className={labelClass}>{field.label}</span>
        <Controller
          control={control}
          name={field.id}
          render={({ field: rhf }) => (
            <button
              type="button"
              className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-foreground/25 bg-foreground/[0.02] text-xs text-foreground/55 hover:border-[var(--hse-teal)] hover:text-[var(--hse-teal)]"
              onClick={() => rhf.onChange(rhf.value ? "" : "preview-signed")}
            >
              {rhf.value ? "Signed (preview) · tap to clear" : "Tap to simulate signature"}
            </button>
          )}
        />
      </div>
    );
  }

  if (field.type === "photo") {
    return (
      <div className={stackClass}>
        <span className={labelClass}>{field.label}</span>
        <Controller
          control={control}
          name={field.id}
          render={({ field: rhf }) => (
            <button
              type="button"
              className="flex h-12 w-full items-center justify-center rounded-lg border border-dashed border-foreground/25 bg-foreground/[0.02] text-xs text-foreground/55 hover:border-[var(--hse-teal)] hover:text-[var(--hse-teal)]"
              onClick={() => rhf.onChange(rhf.value ? undefined : "preview-photo")}
            >
              {rhf.value ? "Photo attached (preview) · tap to clear" : "Tap to simulate photo"}
            </button>
          )}
        />
      </div>
    );
  }

  if (field.type === "temp") {
    const temp = field as TempField;
    return (
      <div className={stackClass}>
        <span className={labelClass}>
          {field.label}
          {typeof temp.alertBelow === "number" || typeof temp.alertAbove === "number" ? (
            <span className="ml-1 font-normal normal-case tracking-normal text-foreground/45">
              ({typeof temp.alertBelow === "number" ? `≥${temp.alertBelow}` : ""}
              {typeof temp.alertBelow === "number" && typeof temp.alertAbove === "number" ? " · " : ""}
              {typeof temp.alertAbove === "number" ? `≤${temp.alertAbove}` : ""}
              {temp.unit ? ` ${temp.unit}` : ""})
            </span>
          ) : null}
        </span>
        <Controller
          control={control}
          name={field.id}
          render={({ field: rhf }) => {
            const numeric = typeof rhf.value === "number" ? rhf.value : Number(rhf.value);
            const alert =
              Number.isFinite(numeric) &&
              ((typeof temp.alertAbove === "number" && numeric > temp.alertAbove) ||
                (typeof temp.alertBelow === "number" && numeric < temp.alertBelow));
            return (
              <input
                inputMode="decimal"
                className={lineInputClass + (alert ? " border-red-500 text-red-700" : "")}
                value={rhf.value == null ? "" : String(rhf.value)}
                onChange={(e) => rhf.onChange(e.target.value)}
                placeholder="°"
              />
            );
          }}
        />
      </div>
    );
  }

  if (field.type === "dynamic-table") {
    return (
      <div className="rounded-lg border border-dashed border-foreground/20 px-3 py-2 text-xs text-foreground/55">
        Dynamic table — fillable after save in a live audit
      </div>
    );
  }

  const inputType =
    field.type === "date" ? "date" : field.type === "time" ? "time" : field.type === "number" ? "number" : "text";

  if (field.type === "text" && field.multiline) {
    return (
      <div className={stackClass}>
        <span className={labelClass}>
          {field.label}
          {field.required ? <span className="ml-1 text-foreground/50">*</span> : null}
        </span>
        <textarea className={lineInputClass + " min-h-20 resize-y py-2"} {...register(field.id)} />
      </div>
    );
  }

  return (
    <div className={stackClass}>
      <span className={labelClass}>
        {field.label}
        {field.required ? <span className="ml-1 text-foreground/50">*</span> : null}
      </span>
      <input type={inputType} className={lineInputClass} {...register(field.id)} />
    </div>
  );
}

export function FormInteractivePreview({
  title,
  sections,
  formStyle = "default",
  maxHeightClass = "max-h-[78vh]",
  showHelper = true,
  auditorMode = false,
  className = "",
}: Props) {
  const schema = useMemo<FormSchemaV1>(
    () => ({
      version: 1,
      title: title || "Untitled form",
      sections,
      meta: { formStyle },
    }),
    [title, sections, formStyle],
  );

  const defaults = useMemo(() => buildDefaultValues(schema), [schema]);
  const zodSchema = useMemo(() => buildZodSchema(schema), [schema]);
  const styleTokens = formStyleTokens(formStyle);
  const [touched, setTouched] = useState(false);

  const form = useForm<FormValues>({
    // Preview validates loosely — still useful for required cues
    resolver: zodResolver(zodSchema),
    defaultValues: defaults,
    mode: "onChange",
  });

  useEffect(() => {
    form.reset(defaults);
    setTouched(false);
  }, [defaults, form]);

  const visibleSections = useMemo(
    () =>
      sections.filter((section) => {
        if (section.type === "fields") return section.fields.some((f) => f.isActive !== false);
        return section.columns.some((c) => c.isActive !== false);
      }),
    [sections],
  );

  return (
    <div className={`flex flex-col ${maxHeightClass} ${className}`}>
      {showHelper ? (
        <div className="shrink-0 border-b border-[color-mix(in_srgb,var(--hse-teal)_18%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_7%,white)] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white">
              {auditorMode ? <Hand className="h-4 w-4" /> : <MousePointerClick className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">
                {auditorMode ? "Test as auditor" : "Try the form"}
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/65">
                Interact with fields below — type values, tick boxes, and walk the table like a real audit run. If
                something feels off, close preview and edit it in the builder before saving.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-foreground/15 bg-background px-2.5 text-[11px] font-medium text-foreground/70 hover:bg-foreground/[0.04]"
              onClick={() => {
                form.reset(defaults);
                setTouched(false);
              }}
              title="Reset preview values"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
          {touched ? (
            <p className="mt-2 text-[10px] font-medium text-[var(--hse-teal)]">
              Preview values stay on this device only — nothing is submitted.
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-auto p-4"
        onChangeCapture={() => setTouched(true)}
        onClickCapture={() => setTouched(true)}
      >
        <form
          className={
            "mx-auto w-full max-w-4xl space-y-4 rounded-2xl border border-foreground/12 bg-background p-4 shadow-sm sm:p-5 " +
            (auditorMode ? "ring-2 ring-[color-mix(in_srgb,var(--hse-teal)_35%,transparent)]" : "")
          }
          onSubmit={(e) => e.preventDefault()}
        >
          {auditorMode ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--hse-teal)]">
              <Hand className="h-3 w-3" />
              Auditor simulation
            </div>
          ) : null}

          <div className="text-center text-xl font-semibold tracking-tight">{title || "Untitled form"}</div>

          {visibleSections.map((section, idx) => {
            if (section.type === "fields") {
              const fields = section.fields.filter((f) => f.isActive !== false);
              if (!fields.length) return null;
              return (
                <section
                  key={`ipv-f-${idx}`}
                  className={`rounded-xl border border-foreground/12 bg-background ${styleTokens.section}`}
                >
                  {section.title &&
                  section.title.trim().toLowerCase() !== "fields" &&
                  section.title.trim().toLowerCase() !== "metadata header" ? (
                    <div className="mb-2 border-b border-foreground/8 pb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
                      {section.title}
                    </div>
                  ) : null}
                  <div className={sectionFieldsGridClass(section.columns)}>
                    {fields.map((field) => (
                      <div key={field.id} className={fieldCardShellClass(field, formStyle)}>
                        <PreviewField
                          field={field}
                          register={form.register}
                          control={form.control}
                          dense={formStyle === "compact" || formStyle === "report"}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            }

            const key = section.id || "form_data";
            return (
              <GridField
                key={`ipv-g-${key}-${idx}`}
                grid={section}
                formStyle={formStyle}
                name={key}
                control={form.control}
                register={form.register}
                errors={form.formState.errors}
                setValue={form.setValue}
                watch={form.watch}
              />
            );
          })}

          {!visibleSections.length ? (
            <div className="rounded-xl border border-dashed border-foreground/20 px-4 py-10 text-center text-sm text-foreground/55">
              No fields yet — add some in the builder, then preview again.
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
