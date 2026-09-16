import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeAiFormSchema } from "../generateFormSchema";
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

  it("keeps uncertain labels represented as text fields", () => {
    const schema = sanitizeAiFormSchema(raw);
    const fieldsSection = schema.sections?.find((section) => section.type === "fields");
    assert.ok(fieldsSection && fieldsSection.type === "fields");
    assert.ok(fieldsSection.fields.some((field) => field.label.includes("Unclear label")));
  });
});
