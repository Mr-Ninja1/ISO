"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { useAuth } from "@/components/AuthProvider";
import {
  type Control,
  Controller,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FormSchemaV1, FieldDef, TempField, DynamicTableField } from "@/types/forms";
import { buildDefaultValues, buildZodSchema } from "@/lib/schemaDrivenForm";

type Props = {
  tenantSlug: string;
  templateId: string;
  schema: FormSchemaV1;
};

type FormValues = Record<string, unknown>;

export function FormRenderer({ tenantSlug, templateId, schema }: Props) {
  const router = useRouter();
  const { session } = useAuth();

  const zodSchema = useMemo(() => buildZodSchema(schema), [schema]);
  const defaultValues = useMemo(() => buildDefaultValues(schema), [schema]);

  const form = useForm<FormValues>({
    resolver: zodResolver(zodSchema),
    defaultValues,
    mode: "onBlur",
  });

  async function onSubmit(values: FormValues) {
    const accessToken = session?.access_token;
    if (!accessToken) {
      alert("Please sign in again.");
      router.push("/login");
      return;
    }

    const res = await fetch("/api/audit/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tenantSlug, templateId, payload: values }),
    });

    if (!res.ok) {
      // Keep it simple for now; we can add a toast system later.
      alert("Submit failed");
      return;
    }

    const json = (await res.json()) as { auditId: string };
    router.push(`/${tenantSlug}/audits/${json.auditId}`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {schema.fields.map((field) => (
        <Field
          key={field.id}
          field={field}
          control={form.control}
          register={form.register}
          errors={form.formState.errors}
        />
      ))}

      <button
        type="submit"
        className="h-12 rounded-md bg-foreground px-4 text-background"
      >
        Submit
      </button>
    </form>
  );
}

function Field({
  field,
  control,
  register,
  errors,
}: {
  field: FieldDef;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;

  if (field.type === "text") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="ml-1">*</span> : null}
        </label>
        {field.multiline ? (
          <textarea
            id={field.id}
            className="min-h-24 rounded-md border border-foreground/20 bg-background p-3"
            {...register(field.id)}
          />
        ) : (
          <input
            id={field.id}
            className="h-12 rounded-md border border-foreground/20 bg-background px-3"
            {...register(field.id)}
          />
        )}
        {field.helpText ? (
          <p className="text-sm text-foreground/70">{field.helpText}</p>
        ) : null}
        {errorMessage ? (
          <p className="text-sm text-red-700">{errorMessage}</p>
        ) : null}
      </div>
    );
  }

  if (field.type === "temp") {
    return <TempFieldInput field={field} control={control} errors={errors} />;
  }

  if (field.type === "signature") {
    return <SignatureFieldInput field={field} control={control} errors={errors} />;
  }

  if (field.type === "dynamic-table") {
    return <DynamicTableInput field={field} control={control} errors={errors} />;
  }

  return null;
}

function TempFieldInput({
  field,
  control,
  errors,
}: {
  field: TempField;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={field.id}>
        {field.label}
        {field.required ? <span className="ml-1">*</span> : null}
      </label>
      <Controller
        control={control}
        name={field.id as never}
        render={({ field: rhfField }) => {
          const value = rhfField.value;
          const numeric = typeof value === "number" ? value : Number(value);
          const isAlertAbove =
            typeof field.alertAbove === "number" &&
            Number.isFinite(numeric) &&
            numeric > field.alertAbove;
          const isAlertBelow =
            typeof field.alertBelow === "number" &&
            Number.isFinite(numeric) &&
            numeric < field.alertBelow;

          const alert = isAlertAbove || isAlertBelow;

          return (
            <input
              id={field.id}
              inputMode="decimal"
              className={
                "h-12 rounded-md border px-3 bg-background " +
                (alert ? "border-red-700" : "border-foreground/20")
              }
              value={typeof value === "number" ? String(value) : String(value ?? "")}
              onChange={(e) => rhfField.onChange(e.target.value)}
            />
          );
        }}
      />
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </div>
  );
}

function SignatureFieldInput({
  field,
  control,
  errors,
}: {
  field: { id: string; label: string; required?: boolean };
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;
  const sigRef = useRef<SignatureCanvas | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{field.label}</label>
      <Controller
        control={control}
        name={field.id as never}
        render={({ field: rhfField }) => (
          <div className="rounded-md border border-foreground/20 bg-background p-2">
            <SignatureCanvas
              ref={(ref) => {
                sigRef.current = ref;
              }}
              penColor="black"
              canvasProps={{ className: "h-32 w-full" }}
              onEnd={() => {
                const dataUrl = sigRef.current?.toDataURL("image/png") ?? "";
                rhfField.onChange(dataUrl);
              }}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="h-10 rounded-md border border-foreground/20 px-3"
                onClick={() => {
                  sigRef.current?.clear();
                  rhfField.onChange("");
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      />
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </div>
  );
}

function DynamicTableInput({
  field,
  control,
  errors,
}: {
  field: DynamicTableField;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const errorMessage = errors?.[field.id]?.message as string | undefined;
  const { fields, append, remove } = useFieldArray({
    control,
    name: field.id as never,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium">{field.label}</label>
        <button
          type="button"
          className="h-10 rounded-md border border-foreground/20 px-3"
          onClick={() => append({})}
        >
          Add row
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-foreground/20">
        <table className="min-w-full text-sm">
          <thead className="bg-foreground/5">
            <tr>
              {field.columns.map((c) => (
                <th key={c.id} className="px-3 py-2 text-left font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-6 text-foreground/70"
                  colSpan={field.columns.length + 1}
                >
                  No rows yet
                </td>
              </tr>
            ) : null}

            {fields.map((row, rowIndex) => (
              <tr key={row.id} className="border-t border-foreground/10">
                {field.columns.map((c) => (
                  <td key={c.id} className="px-3 py-2">
                    <Controller
                      control={control}
                      name={`${field.id}.${rowIndex}.${c.id}` as never}
                      render={({ field: rhfField }) => (
                        <input
                          className="h-10 w-full rounded-md border border-foreground/20 bg-background px-2"
                          value={String(rhfField.value ?? "")}
                          onChange={(e) => rhfField.onChange(e.target.value)}
                        />
                      )}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="h-10 rounded-md border border-foreground/20 px-3"
                    onClick={() => remove(rowIndex)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </div>
  );
}
