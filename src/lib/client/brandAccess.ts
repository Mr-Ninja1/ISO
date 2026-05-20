const DEACTIVATED_PREFIX = "iso-tenant-deactivated:v1:";
const DEACTIVATED_REASON_PREFIX = "iso-tenant-deactivated-reason:v1:";

export function tenantDeactivatedKey(tenantSlug: string) {
  return `${DEACTIVATED_PREFIX}${tenantSlug}`;
}

function tenantDeactivationReasonKey(tenantSlug: string) {
  return `${DEACTIVATED_REASON_PREFIX}${tenantSlug}`;
}

export function isTenantDeactivatedBlocked(tenantSlug: string) {
  if (!tenantSlug) return false;
  try {
    return sessionStorage.getItem(tenantDeactivatedKey(tenantSlug)) === "1";
  } catch {
    return false;
  }
}

export function getTenantDeactivationReason(tenantSlug: string) {
  if (!tenantSlug) return null;
  try {
    const raw = sessionStorage.getItem(tenantDeactivationReasonKey(tenantSlug));
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function setTenantDeactivatedBlocked(tenantSlug: string, reason?: string | null) {
  if (!tenantSlug) return;
  try {
    sessionStorage.setItem(tenantDeactivatedKey(tenantSlug), "1");
    if (reason?.trim()) {
      sessionStorage.setItem(tenantDeactivationReasonKey(tenantSlug), reason.trim().slice(0, 2000));
    } else {
      sessionStorage.removeItem(tenantDeactivationReasonKey(tenantSlug));
    }
  } catch {
    // ignore
  }
}

export function clearTenantDeactivatedBlocked(tenantSlug: string) {
  if (!tenantSlug) return;
  try {
    sessionStorage.removeItem(tenantDeactivatedKey(tenantSlug));
    sessionStorage.removeItem(tenantDeactivationReasonKey(tenantSlug));
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

export function deactivationReasonFromError(err: unknown) {
  const reason = (err as { deactivationReason?: string | null })?.deactivationReason;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Notify workspace shell to clear caches and leave the brand (see workspace page listener). */
export function dispatchTenantDeactivated(tenantSlug: string, reason?: string | null) {
  if (typeof window === "undefined" || !tenantSlug) return;
  setTenantDeactivatedBlocked(tenantSlug, reason);
  try {
    if (localStorage.getItem("lastTenantSlug") === tenantSlug) {
      localStorage.removeItem("lastTenantSlug");
    }
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent("iso-tenant-deactivated", { detail: { tenantSlug, reason: reason?.trim() || null } })
  );
}
