const DEACTIVATED_PREFIX = "iso-tenant-deactivated:v1:";

export function tenantDeactivatedKey(tenantSlug: string) {
  return `${DEACTIVATED_PREFIX}${tenantSlug}`;
}

export function isTenantDeactivatedBlocked(tenantSlug: string) {
  if (!tenantSlug) return false;
  try {
    return sessionStorage.getItem(tenantDeactivatedKey(tenantSlug)) === "1";
  } catch {
    return false;
  }
}

export function setTenantDeactivatedBlocked(tenantSlug: string) {
  if (!tenantSlug) return;
  try {
    sessionStorage.setItem(tenantDeactivatedKey(tenantSlug), "1");
  } catch {
    // ignore
  }
}

export function clearTenantDeactivatedBlocked(tenantSlug: string) {
  if (!tenantSlug) return;
  try {
    sessionStorage.removeItem(tenantDeactivatedKey(tenantSlug));
  } catch {
    // ignore
  }
}

export function isTenantDeactivatedError(err: unknown) {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err ?? "");
  const code = (err as { code?: string })?.code;
  return code === "TENANT_DEACTIVATED" || (status === 403 && /deactivated/i.test(message));
}

/** Notify workspace shell to clear caches and leave the brand (see workspace page listener). */
export function dispatchTenantDeactivated(tenantSlug: string) {
  if (typeof window === "undefined" || !tenantSlug) return;
  setTenantDeactivatedBlocked(tenantSlug);
  try {
    if (localStorage.getItem("lastTenantSlug") === tenantSlug) {
      localStorage.removeItem("lastTenantSlug");
    }
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("iso-tenant-deactivated", { detail: { tenantSlug } }));
}
