import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeAiFormSchema } from "../generateFormSchema";
import { FORM_ENGINE_SYSTEM_PROMPT } from "../formEnginePrompt";
import {
  MAX_SOURCE_DOCUMENT_BYTES,
  resolveSourceMimeType,
  validateSourceDocument,
} from "../sourceDocument";
import { normalizeFormSchema } from "../../normalizeFormSchema";
import { buildDefaultValues } from "../../schemaDrivenForm";

describe("sourceDocument validation", () => {
  it("accepts pdf jpg png by mime and extension", () => {
    assert.equal(resolveSourceMimeType({ name: "form.pdf", type: "application/pdf" }), "application/pdf");
    assert.equal(resolveSourceMimeType({ name: "scan.JPG", type: "" }), "image/jpeg");
    assert.equal(resolveSourceMimeType({ name: "photo.png", type: "image/png" }), "image/png");
    assert.equal(resolveSourceMimeType({ name: "photo.jpg", type: "image/jpg" }), "image/jpeg");
  });

  it("rejects unsupported types and empty/oversized files", () => {
    assert.equal(validateSourceDocument({ name: "notes.docx", type: "", size: 100 }).ok, false);
    assert.equal(validateSourceDocument({ name: "form.pdf", type: "application/pdf", size: 0 }).ok, false);
    assert.equal(
      validateSourceDocument({
        name: "form.pdf",
        type: "application/pdf",
        size: MAX_SOURCE_DOCUMENT_BYTES + 1,
      }).ok,
      false,
    );
    assert.equal(
      validateSourceDocument({ name: "form.pdf", type: "application/pdf", size: 1200 }).ok,
      true,
    );
  });
});

describe("seedRows sanitize and defaults", () => {
  const raw = {
    version: 1,
    title: "Inspection",
    meta: { formType: "inspection" },
    sections: [
      {
        type: "grid",
        id: "form_data",
        title: "Items",
        rows: 12,
        columns: [
          { id: "item", type: "text", label: "Item", readOnly: true },
          { id: "status", type: "yesno", label: "OK?" },
          { id: "notes", type: "text", label: "Notes" },
        ],
        seedRows: [
          { item: "Fire doors", ignored: "x" },
          { item: "Emergency lighting" },
          { item: "First aid kit" },
        ],
      },
      {
        type: "fields",
        title: "Header",
        fields: [{ id: "blurry_label", type: "text", label: "Unclear label near footer" }],
      },
    ],
  };

  it("preserves readOnly and seedRows through sanitize + normalize", () => {
    const schema = sanitizeAiFormSchema(raw);
    const grid = schema.sections?.find((section) => section.type === "grid");
    assert.ok(grid && grid.type === "grid");
    assert.equal(grid.rows, "dynamic");
    assert.equal(grid.columns[0]?.readOnly, true);
    assert.deepEqual(grid.seedRows, [
      { item: "Fire doors" },
      { item: "Emergency lighting" },
      { item: "First aid kit" },
    ]);

    const normalized = normalizeFormSchema(schema);
    const normalizedGrid = normalized.sections?.find((section) => section.type === "grid");
    assert.ok(normalizedGrid && normalizedGrid.type === "grid");
    assert.equal(normalizedGrid.columns[0]?.readOnly, true);
    assert.equal(normalizedGrid.seedRows?.length, 3);
  });

  it("seeds default submission rows from seedRows", () => {
    const schema = sanitizeAiFormSchema(raw);
    const defaults = buildDefaultValues(schema);
    const rows = defaults.form_data as Array<Record<string, unknown>>;
    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.item, "Fire doors");
    assert.equal(rows[1]?.item, "Emergency lighting");
    assert.equal(rows[2]?.item, "First aid kit");
    assert.equal(rows[0]?.status, "");
    assert.equal(rows[0]?.notes, "");
  });

  it("promotes printed item arrays into table seed rows", () => {
    const schema = sanitizeAiFormSchema({
      version: 1,
      sections: [{
        type: "grid",
        title: "Cleaning items",
        columns: [
          { id: "equipment", type: "text", label: "Equipment" },
          { id: "status", type: "checkbox", label: "Completed" },
        ],
        staticItems: ["Hot pass", "Alkaline table", "Preparation table"],
      }],
    });

    const grid = schema.sections?.find((section) => section.type === "grid");
    assert.ok(grid && grid.type === "grid");
    assert.deepEqual(grid.seedRows, [
      { equipment: "Hot pass" },
      { equipment: "Alkaline table" },
      { equipment: "Preparation table" },
    ]);
    assert.equal(grid.rows, "dynamic");
  });

  it("keeps uncertain labels represented as text fields", () => {
    const schema = sanitizeAiFormSchema(raw);
    const fieldsSection = schema.sections?.find((section) => section.type === "fields");
    assert.ok(fieldsSection && fieldsSection.type === "fields");
    assert.ok(fieldsSection.fields.some((field) => field.label.includes("Unclear label")));
  });

  it("preserves static labels with their value instead of dropping the field name", () => {
    const schema = sanitizeAiFormSchema({
      version: 1,
      sections: [
        {
          type: "fields",
          title: "Header",
          fields: [
            { id: "document_number", type: "text", name: "Document No", value: "BBN-SHEQ-P-16-R-11n" },
            { id: "compiled_by", type: "text", name: "Compiled by", value: "Michael Zulu C." },
            { id: "date", type: "date", name: "Date", value: "03/08/2025" },
          ],
        },
      ],
    });

    const fields = schema.sections?.[0]?.type === "fields" ? schema.sections[0].fields : [];
    assert.ok(fields.some((field) => field.type === "display" && field.label === "Document No"));
    assert.ok(fields.some((field) => field.type === "display" && field.label === "Compiled by"));
    assert.ok(fields.some((field) => field.type === "display" && field.label === "Date"));
  });

  it("keeps printed metadata names when the model returns display values", () => {
    const schema = sanitizeAiFormSchema({
      version: 1,
      sections: [
        {
          type: "fields",
          title: "Document metadata",
          fields: [
            { id: "document_number", type: "display", name: "Doc No", value: "BBN-SHEQ-P-16-R-11n" },
            { id: "compiled_by", type: "display", fieldName: "Compiled by", staticValue: "Michael Zulu C." },
            { id: "revision_date", type: "display", key: "Revision Date", textValue: "30/12/2026" },
            { id: "issue_date", type: "display", label: "Issue Date: 03/08/2025" },
          ],
        },
      ],
    });

    const fields = schema.sections?.[0]?.type === "fields" ? schema.sections[0].fields : [];
    assert.ok(fields.some((field) => field.type === "display" && field.content === "Doc No: BBN-SHEQ-P-16-R-11n"));
    assert.ok(fields.some((field) => field.type === "display" && field.content === "Compiled by: Michael Zulu C."));
    assert.ok(fields.some((field) => field.type === "display" && field.content === "Revision Date: 30/12/2026"));
    assert.ok(fields.some((field) => field.type === "display" && field.content === "Issue Date: 03/08/2025"));
  });

  it("keeps complete printed key/value labels as read-only display fields", () => {
    const schema = sanitizeAiFormSchema({
      version: 1,
      sections: [{
        type: "fields",
        title: "Header",
        fields: [
          { id: "doc_number", type: "text", label: "DOC NUMBER:983923923" },
          { id: "shift", type: "label", label: "SHIFT: AM" },
          { id: "rev", type: "text", label: "REV NO: 00" },
        ],
      }],
    });

    const fields = schema.sections?.[0]?.type === "fields" ? schema.sections[0].fields : [];
    assert.ok(fields.every((field) => field.type === "display"));
    assert.deepEqual(fields.map((field) => field.type === "display" ? field.content : ""), [
      "DOC NUMBER:983923923",
      "SHIFT: AM",
      "REV NO: 00",
    ]);
  });

  it("keeps signature roles separate from checkbox-like day columns", () => {
    const schema = sanitizeAiFormSchema({
      version: 1,
      sections: [{
        type: "grid",
        id: "form_data",
        title: "Cleaning checklist",
        rows: "dynamic",
        columns: [
          { id: "area", type: "text", label: "Area to be cleaned" },
          { id: "frequency", type: "text", label: "Frequency" },
          { id: "mon", type: "checkbox", label: "Mon" },
          { id: "tue", type: "checkbox", label: "Tue" },
          { id: "wed", type: "checkbox", label: "Wed" },
          { id: "hseq_sign", type: "checkbox", label: "HSEQ sign" },
          { id: "manager_sign", type: "checkbox", label: "Complex manager / FSCS sign" },
        ],
        seedRows: [{ area: "Door", frequency: "2", mon: "", tue: "", wed: "" }],
      }],
    });

    const grid = schema.sections?.find((section) => section.type === "grid");
    const signFieldSection = schema.sections?.find((section) => section.type === "fields" && section.title === "Sign-off");

    assert.ok(grid && grid.type === "grid");
    assert.equal(grid.columns.some((col) => /hseq|sign/i.test(col.label)), false);
    assert.ok(signFieldSection && signFieldSection.type === "fields");
    assert.equal(signFieldSection.fields.filter((field) => field.type === "signature").length, 2);
  });

  it("ignores handwriting and keeps static form items aligned with their original grid position", () => {
    assert.match(FORM_ENGINE_SYSTEM_PROMPT, /ignore handwritten|handwriting/i);
    assert.match(FORM_ENGINE_SYSTEM_PROMPT, /typed|printed text/i);
    assert.match(FORM_ENGINE_SYSTEM_PROMPT, /same columns|original.*row|original.*grid/i);
  });
});
