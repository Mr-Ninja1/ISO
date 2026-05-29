/** Fired when AuthProvider finishes initial session hydration (native OTA checks use this). */
export const ISO_AUTH_READY_EVENT = "iso-auth-ready";

export function dispatchAuthReady() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ISO_AUTH_READY_EVENT));
}
