const PLATFORM_DEVELOPER_LS_KEY = "iso-platform-developer:v1";

export function readPlatformDeveloperFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PLATFORM_DEVELOPER_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePlatformDeveloperFlag(isDeveloper: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (isDeveloper) {
      localStorage.setItem(PLATFORM_DEVELOPER_LS_KEY, "1");
    } else {
      localStorage.removeItem(PLATFORM_DEVELOPER_LS_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearPlatformDeveloperFlag() {
  writePlatformDeveloperFlag(false);
}
