import { markWorkspaceForceRefetch } from "@/lib/client/workspaceCache";

/**
 * Ask `/workspace` (and embedded shells) to refetch `/api/workspace` + related caches.
 * Persists a force-refetch flag so the destination still refetches if it was unmounted.
 */
export function requestWorkspaceRevalidate(tenantSlug: string) {
  if (typeof window === "undefined" || !tenantSlug) return;
  markWorkspaceForceRefetch(tenantSlug);
  window.dispatchEvent(
    new CustomEvent("workspace-invalidate", {
      detail: { tenantSlug },
    })
  );
}
