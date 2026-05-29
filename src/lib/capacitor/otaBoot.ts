/** Short grace window after OTA reload so recovery layers do not fight hydration. */
const OTA_RELOAD_SESSION_KEY = "iso-ota-reload-session:v1";
const OTA_BOOT_GRACE_MS = 20_000;

type OtaReloadSession = {
  bundleId: string;
  at: number;
};

export function markOtaReloadStarting(bundleId: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: OtaReloadSession = { bundleId, at: Date.now() };
    sessionStorage.setItem(OTA_RELOAD_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function isWithinOtaBootGracePeriod(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(OTA_RELOAD_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as OtaReloadSession;
    if (!parsed?.at || !parsed?.bundleId) return false;
    if (Date.now() - parsed.at > OTA_BOOT_GRACE_MS) {
      sessionStorage.removeItem(OTA_RELOAD_SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearOtaBootGracePeriod() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(OTA_RELOAD_SESSION_KEY);
  } catch {
    // ignore
  }
}
