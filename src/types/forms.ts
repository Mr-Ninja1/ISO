export type FieldType =
  | "text"
  | "date"
  | "number"
  | "temp"
  | "signature"
  | "checkbox"
  | "time"
  | "dynamic-table";

export type FormSchemaV1 = {
  version: 1;
  title?: string;
  // Backward compatible: older templates may only have `fields`.
  fields?: FieldDef[];
  // New: section-based schemas (supports complex grids/log sheets).
  sections?: FormSection[];
};

export type BaseField = {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  helpText?: string;
  readOnly?: boolean;
};

export type TextField = BaseField & {
  type: "text";
  multiline?: boolean;
  placeholder?: string;
};

export type DateField = BaseField & {
  type: "date";
  placeholder?: string;
};

export type NumberField = BaseField & {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

export type TempField = BaseField & {
  type: "temp";
  min?: number;
  max?: number;
  alertAbove?: number;
  alertBelow?: number;
  unit?: "C" | "F";
};

export type SignatureField = BaseField & {
  type: "signature";
};

export type CheckboxField = BaseField & {
  type: "checkbox";
};

export type TimeField = BaseField & {
  type: "time";
};

export type DynamicTableField = BaseField & {
  type: "dynamic-table";
  columns: Array<{
    id: string;
    label: string;
    type: "text" | "temp";
    required?: boolean;
  }>;
};

export type FieldDef =
  | TextField
  | DateField
  | NumberField
  | TempField
  | SignatureField
  | CheckboxField
  | TimeField
  | DynamicTableField;

export type SimpleFieldDef = Exclude<FieldDef, DynamicTableField>;

export type FieldsSection = {
  type: "fields";
  title?: string;
  fields: FieldDef[];
};

export type GridSection = {
  type: "grid";
  // Name used as the form key. Defaults to `form_data`.
  id?: string;
  title?: string;
  rows: number | "dynamic";
  columns: Array<SimpleFieldDef>;
};

export type FormSection = FieldsSection | GridSection;
