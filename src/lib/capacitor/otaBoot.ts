/** Grace window after OTA LiveUpdate.reload() so recovery / boot shells do not fight hydration.
 * Uses localStorage so the flag survives WebView reloads (sessionStorage often does not).
 */
const OTA_RELOAD_GRACE_KEY = "iso-ota-boot-grace:v1";
const OTA_RELOAD_BUNDLE_KEY = "iso-ota-reload-bundle:v1";
const OTA_BOOT_GRACE_MS = 45_000;

type OtaReloadSession = {
  bundleId: string;
  at: number;
};

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function readJson(key: string): OtaReloadSession | null {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as OtaReloadSession;
      if (parsed?.at && parsed?.bundleId) return parsed;
    } catch {
      // try next store
    }
  }
  return null;
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function markOtaReloadStarting(bundleId: string) {
  if (typeof window === "undefined") return;
  const payload: OtaReloadSession = { bundleId, at: Date.now() };
  writeJson(OTA_RELOAD_GRACE_KEY, payload);
  writeJson(OTA_RELOAD_BUNDLE_KEY, payload);
}

export function isWithinOtaBootGracePeriod(): boolean {
  if (typeof window === "undefined") return false;
  const parsed = readJson(OTA_RELOAD_GRACE_KEY);
  if (!parsed) return false;
  if (Date.now() - parsed.at > OTA_BOOT_GRACE_MS) {
    removeKey(OTA_RELOAD_GRACE_KEY);
    return false;
  }
  return true;
}

export function clearOtaBootGracePeriod() {
  if (typeof window === "undefined") return;
  removeKey(OTA_RELOAD_GRACE_KEY);
}

/** After a reload, mark the bundle we restarted into as active — does not end boot grace. */
export function consumeOtaReloadSessionBundleId(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = readJson(OTA_RELOAD_BUNDLE_KEY);
  removeKey(OTA_RELOAD_BUNDLE_KEY);
  if (!parsed?.bundleId) return null;
  if (Date.now() - parsed.at > OTA_BOOT_GRACE_MS) return null;
  return parsed.bundleId;
}
