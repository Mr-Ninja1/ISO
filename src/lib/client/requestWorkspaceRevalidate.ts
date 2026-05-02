/**
 * Ask `/workspace` (and embedded shells) to refetch `/api/workspace` + related caches.
 * Use after successful online mutations (categories, templates, etc.).
 */
export function requestWorkspaceRevalidate(tenantSlug: string) {
  if (typeof window === "undefined" || !tenantSlug) return;
  window.dispatchEvent(
    new CustomEvent("workspace-invalidate", {
      detail: { tenantSlug },
    })
  );
}
