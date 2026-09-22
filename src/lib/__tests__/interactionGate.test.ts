import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInteractiveNavBusy,
  markInteractiveNav,
  shouldPauseBackgroundWork,
  waitForInteractiveNavClear,
} from "@/lib/client/interactionGate";

describe("interactionGate", () => {
  it("marks navigation busy for the requested window", async () => {
    markInteractiveNav(40);
    assert.equal(isInteractiveNavBusy(), true);
    assert.equal(shouldPauseBackgroundWork(), true);
    await waitForInteractiveNavClear(200);
    assert.equal(isInteractiveNavBusy(), false);
  });

  it("extends an existing busy window instead of shortening it", async () => {
    markInteractiveNav(80);
    markInteractiveNav(10);
    assert.equal(isInteractiveNavBusy(), true);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(isInteractiveNavBusy(), true);
    await waitForInteractiveNavClear(200);
    assert.equal(isInteractiveNavBusy(), false);
  });
});
