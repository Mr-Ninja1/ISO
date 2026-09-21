import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTemplateDeletePlan } from "./templateDelete";

describe("buildTemplateDeletePlan", () => {
  it("groups a lineage and includes all associated audit rows for permanent deletion", () => {
    const allTemplates = [
      { id: "template-1", schema: { version: 1, meta: { lineageId: "lineage-42" } } },
      { id: "template-2", schema: { version: 1, meta: { lineageId: "lineage-42" } } },
      { id: "template-3", schema: { version: 1, meta: { lineageId: "lineage-99" } } },
    ];

    const plan = buildTemplateDeletePlan({
      templateId: "template-1",
      allTemplates,
      countsByTemplateId: {
        "template-1": 2,
        "template-2": 1,
        "template-3": 0,
      },
    });

    assert.equal(plan.lineageId, "lineage-42");
    assert.deepEqual(plan.lineageTemplateIds, ["template-1", "template-2"]);
    assert.equal(plan.totalAuditRows, 3);
    assert.equal(plan.requiresSubmissionCleanup, true);
  });

  it("keeps a plain delete as a safe no-audit path when no submissions exist", () => {
    const plan = buildTemplateDeletePlan({
      templateId: "template-9",
      allTemplates: [{ id: "template-9", schema: { version: 1 } }],
      countsByTemplateId: { "template-9": 0 },
    });

    assert.equal(plan.lineageId, "template-9");
    assert.deepEqual(plan.lineageTemplateIds, ["template-9"]);
    assert.equal(plan.totalAuditRows, 0);
    assert.equal(plan.requiresSubmissionCleanup, false);
  });
});
