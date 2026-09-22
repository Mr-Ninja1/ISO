import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  buildWorkspaceReturnHref,
  preserveWorkspaceViewInParams,
  readWorkspaceViewPref,
  rememberWorkspaceViewPref,
  resolveActiveCategoryId,
  resolveStableWorkspaceViewFallback,
  shouldClearOptimisticCategoryHighlight,
} from "@/lib/client/workspaceNavigation";
import { workspaceContentFingerprint } from "@/lib/client/workspaceCache";

function installSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: sessionStorage,
  });
  return sessionStorage;
}

function setLocationSearch(search: string) {
  const value = {
    search,
    pathname: "/workspace",
    href: `http://localhost/workspace${search}`,
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: value },
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value,
  });
}

describe("workspaceNavigation view stability", () => {
  beforeEach(() => {
    installSessionStorage();
    setLocationSearch("");
  });

  afterEach(() => {
    installSessionStorage().clear();
    setLocationSearch("");
  });

  it("does not default missing view to admin on preserve", () => {
    const next = new URLSearchParams("tenantSlug=acme");
    preserveWorkspaceViewInParams(next);
    assert.equal(next.get("view"), "forms");
  });

  it("keeps live URL view over admin-leaning callers", () => {
    setLocationSearch("?tenantSlug=acme&view=forms");
    const next = new URLSearchParams("tenantSlug=acme");
    preserveWorkspaceViewInParams(next, "admin");
    assert.equal(next.get("view"), "forms");
  });

  it("uses session preference when URL has no view", () => {
    rememberWorkspaceViewPref("forms");
    assert.equal(readWorkspaceViewPref(), "forms");
    assert.equal(resolveStableWorkspaceViewFallback("admin"), "forms");
  });

  it("returns to forms surface after builder/library save", () => {
    const href = buildWorkspaceReturnHref("acme", { categoryId: "c1", refresh: true });
    assert.match(href, /tenantSlug=acme/);
    assert.match(href, /view=forms/);
    assert.match(href, /categoryId=c1/);
    assert.match(href, /refresh=1/);
    assert.equal(readWorkspaceViewPref(), "forms");
  });
});

describe("category tab highlight race", () => {
  it("does not clear optimism while URL still has the previous category", () => {
    assert.equal(shouldClearOptimisticCategoryHighlight("bh", "ah"), false);
    assert.equal(shouldClearOptimisticCategoryHighlight(null, "ah"), false);
  });

  it("clears optimism only after URL commits the tapped category", () => {
    assert.equal(shouldClearOptimisticCategoryHighlight("ah", "ah"), true);
  });

  it("keeps optimistic tap over lagging URL for active highlight", () => {
    assert.equal(
      resolveActiveCategoryId({
        uiActiveCategoryId: "ah",
        urlCategoryId: "bh",
        workspaceSelectedCategoryId: "bh",
      }),
      "ah"
    );
  });

  it("falls back to URL after optimism is cleared", () => {
    assert.equal(
      resolveActiveCategoryId({
        uiActiveCategoryId: null,
        urlCategoryId: "ah",
        workspaceSelectedCategoryId: "bh",
      }),
      "ah"
    );
  });
});

describe("workspaceContentFingerprint", () => {
  it("is order-independent for templates and categories", () => {
    const a = workspaceContentFingerprint({
      selectedCategoryId: "c1",
      categories: [
        { id: "c2", name: "B", sortOrder: 2 },
        { id: "c1", name: "A", sortOrder: 1 },
      ],
      templates: [
        { id: "t2", updatedAt: "2", title: "Two", categoryId: "c1" },
        { id: "t1", updatedAt: "1", title: "One", categoryId: "c1" },
      ],
    });
    const b = workspaceContentFingerprint({
      selectedCategoryId: "c1",
      categories: [
        { id: "c1", name: "A", sortOrder: 1 },
        { id: "c2", name: "B", sortOrder: 2 },
      ],
      templates: [
        { id: "t1", updatedAt: "1", title: "One", categoryId: "c1" },
        { id: "t2", updatedAt: "2", title: "Two", categoryId: "c1" },
      ],
    });
    assert.equal(a, b);
  });

  it("changes when a template is added", () => {
    const before = workspaceContentFingerprint({
      selectedCategoryId: "c1",
      categories: [{ id: "c1", name: "A", sortOrder: 1 }],
      templates: [{ id: "t1", updatedAt: "1", title: "One", categoryId: "c1" }],
    });
    const after = workspaceContentFingerprint({
      selectedCategoryId: "c1",
      categories: [{ id: "c1", name: "A", sortOrder: 1 }],
      templates: [
        { id: "t1", updatedAt: "1", title: "One", categoryId: "c1" },
        { id: "t2", updatedAt: "2", title: "Two", categoryId: "c1" },
      ],
    });
    assert.notEqual(before, after);
  });
});
