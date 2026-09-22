import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sectionTitleForBuilder } from "@/lib/formBuilderConfig";

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
});
