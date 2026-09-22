import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildWorkspaceReturnHref,
  preserveWorkspaceViewInParams,
  readWorkspaceViewPref,
  rememberWorkspaceViewPref,
  resolveStableWorkspaceViewFallback,
} from "@/lib/client/workspaceNavigation";
import { workspaceContentFingerprint } from "@/lib/client/workspaceCache";

describe("workspaceNavigation view stability", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, search: "" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    sessionStorage.clear();
  });

  it("does not default missing view to admin on preserve", () => {
    const next = new URLSearchParams("tenantSlug=acme");
    preserveWorkspaceViewInParams(next);
    expect(next.get("view")).toBe("forms");
  });

  it("keeps live URL view over admin-leaning callers", () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, search: "?tenantSlug=acme&view=forms" },
    });
    const next = new URLSearchParams("tenantSlug=acme");
    preserveWorkspaceViewInParams(next, "admin");
    expect(next.get("view")).toBe("forms");
  });

  it("uses session preference when URL has no view", () => {
    rememberWorkspaceViewPref("forms");
    expect(readWorkspaceViewPref()).toBe("forms");
    expect(resolveStableWorkspaceViewFallback("admin")).toBe("forms");
  });

  it("returns to forms surface after builder/library save", () => {
    const href = buildWorkspaceReturnHref("acme", { categoryId: "c1", refresh: true });
    expect(href).toContain("tenantSlug=acme");
    expect(href).toContain("view=forms");
    expect(href).toContain("categoryId=c1");
    expect(href).toContain("refresh=1");
    expect(readWorkspaceViewPref()).toBe("forms");
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
    expect(a).toBe(b);
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
    expect(before).not.toBe(after);
  });
});
