export type FieldType = "text" | "temp" | "signature" | "dynamic-table";

export type FormSchemaV1 = {
  version: 1;
  title?: string;
  fields: FieldDef[];
};

export type BaseField = {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  helpText?: string;
};

export type TextField = BaseField & {
  type: "text";
  multiline?: boolean;
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

export type DynamicTableField = BaseField & {
  type: "dynamic-table";
  columns: Array<{
    id: string;
    label: string;
    type: "text" | "temp";
    required?: boolean;
  }>;
};

export type FieldDef = TextField | TempField | SignatureField | DynamicTableField;
