/** Coordinates OfflineBootstrapGate with CapacitorAppRecovery so recovery
 * does not hardNavigate while first-time brand download is legitimately blocking. */

let bootstrapBlocking = false;
let authHydrating = false;

export function setOfflineBootstrapBlocking(blocking: boolean) {
  bootstrapBlocking = blocking;
}

export function isOfflineBootstrapBlocking() {
  return bootstrapBlocking;
}

export function setAuthHydrating(hydrating: boolean) {
  authHydrating = hydrating;
}

export function isAuthHydrating() {
  return authHydrating;
}

export function shouldDeferNativeRecovery() {
  return bootstrapBlocking || authHydrating;
}
