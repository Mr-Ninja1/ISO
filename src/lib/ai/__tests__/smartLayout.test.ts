import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySmartLayout,
  applySmartLayoutAction,
  listSmartLayoutActions,
} from "../smartLayout";
import { sanitizeAiFormSchema } from "../generateFormSchema";

describe("smartLayout", () => {
  it("compacts metadata headers and sizes note columns", () => {
    const schema = applySmartLayout({
      version: 1,
      title: "Stock card",
      meta: { formType: "checklist" },
      sections: [
        {
          type: "fields",
          title: "Document metadata",
          columns: 1,
          fields: [
            { id: "doc", type: "display", label: "Doc No", content: "Doc No: A-1" },
            { id: "issue", type: "display", label: "Issue Date", content: "Issue Date: 01/01/2026" },
            { id: "rev", type: "display", label: "Revision Date", content: "Revision Date: 02/02/2026" },
            { id: "compiled", type: "display", label: "Compiled by", content: "Compiled by: A. Admin" },
          ],
        },
        {
          type: "grid",
          id: "form_data",
          title: "Items",
          rows: "dynamic",
          columns: [
            { id: "item", type: "static", label: "Item" },
            { id: "ok", type: "yesno", label: "OK?" },
            { id: "notes", type: "text", label: "Notes" },
          ],
        },
      ],
    });

    const header = schema.sections?.[0];
    assert.ok(header && header.type === "fields");
    assert.equal(header.columns, 2);

    const grid = schema.sections?.find((section) => section.type === "grid");
    assert.ok(grid && grid.type === "grid");
    const notes = grid.columns.find((column) => column.id === "notes");
    assert.ok(notes);
    assert.equal((notes as { multiline?: boolean }).multiline, true);
    assert.ok((notes.widthPx || 0) >= 200);
    assert.ok((grid.columns.find((column) => column.id === "ok")?.widthPx || 0) <= 100);
  });

  it("lists and applies ensure_signoff action", () => {
    const schema = {
      version: 1 as const,
      title: "Inspection",
      meta: { formType: "inspection" as const },
      sections: [
        {
          type: "fields" as const,
          title: "Header",
          columns: 2 as const,
          fields: [{ id: "site", type: "text" as const, label: "Site" }],
        },
      ],
    };

    const actions = listSmartLayoutActions(schema);
    assert.ok(actions.some((action) => action.id === "ensure_signoff"));

    const next = applySmartLayoutAction(schema, "ensure_signoff");
    const signoff = next.sections?.find((section) => section.type === "fields" && section.title === "Sign-off");
    assert.ok(signoff && signoff.type === "fields");
    assert.equal(signoff.fields.filter((field) => field.type === "signature").length, 2);
  });

  it("does not force every first grid column to static during sanitize", () => {
    const schema = sanitizeAiFormSchema({
      version: 1,
      title: "Temp log",
      sections: [
        {
          type: "grid",
          id: "form_data",
          rows: 12,
          columns: [
            { id: "time", type: "time", label: "Time" },
            { id: "temp", type: "text", label: "Temperature °C" },
            { id: "initials", type: "text", label: "Initials" },
          ],
        },
      ],
    });

    const grid = schema.sections?.find((section) => section.type === "grid");
    assert.ok(grid && grid.type === "grid");
    assert.equal(grid.columns[0]?.type, "time");
    assert.equal(grid.columns[1]?.type, "temp");
    const initials = grid.columns.find((column) => /initials/i.test(column.label));
    assert.ok(initials, "initials should remain a grid column");
    assert.equal(initials.type, "text");
  });
});
