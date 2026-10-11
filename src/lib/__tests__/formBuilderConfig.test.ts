import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSectionsFromBuilderState,
  builderStateFromSections,
  sectionTitleForBuilder,
  starterCanvasForType,
} from "@/lib/formBuilderConfig";

describe("form builder section placement", () => {
  it("treats below-table labels as post-grid footer content", () => {
    assert.equal(
      sectionTitleForBuilder({ type: "fields", title: "Below table", fields: [] }, "custom"),
      "bottom"
    );
    assert.equal(
      sectionTitleForBuilder({ type: "fields", title: "After table notes", fields: [] }, "custom"),
      "bottom"
    );
  });

  it("preserves footer fields even when form type config hides footer", () => {
    const sections = buildSectionsFromBuilderState(
      {
        topFields: [{ id: "h1", type: "text", label: "Header", required: false }],
        topFieldsColumns: 1,
        bottomFields: [{ id: "f1", type: "signature", label: "Sign", required: false }],
        bottomFieldsColumns: 1,
        grids: [],
      },
      "checklist"
    );
    assert.equal(sections.length, 2);
    assert.equal(sections[1]?.type, "fields");
    if (sections[1]?.type === "fields") {
      assert.equal(sections[1].fields[0]?.id, "f1");
    }
  });

  it("round-trips header, two grids, and footer without dropping tables", () => {
    const sections = buildSectionsFromBuilderState(
      {
        topFields: [{ id: "h1", type: "text", label: "Site", required: false }],
        topFieldsColumns: 2,
        bottomFields: [{ id: "f1", type: "signature", label: "Manager", required: false }],
        bottomFieldsColumns: 1,
        grids: [
          {
            type: "grid",
            id: "grid_a",
            title: "Cleaning log",
            rows: 5,
            columns: [{ id: "c1", type: "text", label: "Item", required: false }],
          },
          {
            type: "grid",
            id: "grid_b",
            title: "Attendance",
            rows: 8,
            columns: [{ id: "c2", type: "checkbox", label: "Present", required: false }],
          },
        ],
      },
      "custom"
    );

    assert.equal(sections.length, 4);
    assert.equal(sections[0]?.type, "fields");
    assert.equal(sections[1]?.type, "grid");
    assert.equal(sections[2]?.type, "grid");
    assert.equal(sections[3]?.type, "fields");
    if (sections[1]?.type === "grid" && sections[2]?.type === "grid") {
      assert.equal(sections[1].id, "grid_a");
      assert.equal(sections[2].id, "grid_b");
    }

    const rebuilt = builderStateFromSections(sections, "custom");
    assert.equal(rebuilt.grids.length, 2);
    assert.equal(rebuilt.grids[0]?.id, "grid_a");
    assert.equal(rebuilt.grids[1]?.id, "grid_b");
    assert.equal(rebuilt.topFields[0]?.id, "h1");
    assert.equal(rebuilt.bottomFields[0]?.id, "f1");
  });

  it("keeps fields between grids in the footer bucket so tables stay intact", () => {
    const rebuilt = builderStateFromSections(
      [
        { type: "fields", title: "Header", fields: [{ id: "h1", type: "text", label: "A", required: false }] },
        {
          type: "grid",
          id: "g1",
          title: "Table 1",
          rows: 3,
          columns: [{ id: "c1", type: "text", label: "Col", required: false }],
        },
        {
          type: "fields",
          title: "Notes between",
          fields: [{ id: "m1", type: "text", label: "Mid", required: false }],
        },
        {
          type: "grid",
          id: "g2",
          title: "Table 2",
          rows: 3,
          columns: [{ id: "c2", type: "text", label: "Col", required: false }],
        },
        {
          type: "fields",
          title: "Sign-off",
          fields: [{ id: "s1", type: "signature", label: "Sign", required: false }],
        },
      ],
      "custom"
    );

    assert.equal(rebuilt.grids.length, 2);
    assert.equal(rebuilt.topFields.map((f) => f.id).join(","), "h1");
    assert.equal(rebuilt.bottomFields.map((f) => f.id).join(","), "m1,s1");
  });

  it("returns a real starter grid for Load starter layout", () => {
    const starter = starterCanvasForType("custom");
    assert.ok(starter.length >= 1);
    assert.equal(starter[0]?.type, "grid");
  });
});
