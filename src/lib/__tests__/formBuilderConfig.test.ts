import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSectionsFromBuilderState, sectionTitleForBuilder } from "@/lib/formBuilderConfig";

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
        grid: null,
      },
      "checklist"
    );
    assert.equal(sections.length, 2);
    assert.equal(sections[1]?.type, "fields");
    if (sections[1]?.type === "fields") {
      assert.equal(sections[1].fields[0]?.id, "f1");
    }
  });
});
