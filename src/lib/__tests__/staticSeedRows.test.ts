import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FormSchemaV1, GridSection } from "@/types/forms";
import {
  buildStaticSeedRowPatches,
  extractStaticSeedRows,
  withUpdatedStaticSeedRows,
} from "@/lib/staticSeedRows";
import { isDraftPayloadDirty } from "@/lib/client/draftPayloadDirty";
import { buildDefaultValues } from "@/lib/schemaDrivenForm";

const grid: GridSection = {
  type: "grid",
  id: "log",
  title: "Log",
  rows: "dynamic",
  columns: [
    { id: "item", type: "static", label: "Item", required: false },
    { id: "temp", type: "temp", label: "Temp", required: false },
  ],
};

const schema: FormSchemaV1 = {
  version: 1,
  title: "Prep list",
  sections: [grid],
};

describe("static seedRows from fill values", () => {
  it("extracts static column text into seedRows", () => {
    const seedRows = extractStaticSeedRows(grid, [
      { item: "Milk", temp: 4 },
      { item: "Eggs", temp: "" },
    ]);
    assert.deepEqual(seedRows, [{ item: "Milk" }, { item: "Eggs" }]);
  });

  it("updates schema seedRows and reports changed", () => {
    const { schema: next, changed } = withUpdatedStaticSeedRows(schema, {
      log: [{ item: "Bread", temp: "" }],
    });
    assert.equal(changed, true);
    const nextGrid = next.sections?.[0] as GridSection;
    assert.deepEqual(nextGrid.seedRows, [{ item: "Bread" }]);
  });

  it("builds API patches only when seed text differs", () => {
    const seeded: FormSchemaV1 = {
      ...schema,
      sections: [{ ...grid, seedRows: [{ item: "Milk" }] }],
    };
    assert.deepEqual(buildStaticSeedRowPatches(seeded, { log: [{ item: "Milk", temp: 3 }] }), []);
    const patches = buildStaticSeedRowPatches(seeded, { log: [{ item: "Juice", temp: 3 }] });
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0].seedRows, [{ item: "Juice" }]);
  });

  it("does not treat seeded static text alone as a draft", () => {
    const seeded: FormSchemaV1 = {
      ...schema,
      sections: [{ ...grid, seedRows: [{ item: "Milk" }, { item: "Eggs" }] }],
    };
    const defaults = buildDefaultValues(seeded);
    assert.equal(isDraftPayloadDirty(defaults as Record<string, unknown>, seeded), false);
    assert.equal(
      isDraftPayloadDirty(
        { log: [{ item: "Milk", temp: 5 }, { item: "Eggs", temp: "" }] } as Record<string, unknown>,
        seeded,
      ),
      true,
    );
  });
});
