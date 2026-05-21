import { apiUrl } from "@/lib/client/apiBase";
import {
  clearPlatformDeveloperFlag,
  readPlatformDeveloperFlag,
  writePlatformDeveloperFlag,
} from "@/lib/client/platformDeveloperFlag";

export {
  clearPlatformDeveloperFlag,
  readPlatformDeveloperFlag,
  writePlatformDeveloperFlag,
} from "@/lib/client/platformDeveloperFlag";

type DeveloperMetricsPayload = {
  totalBrands?: unknown;
};

/** True when the admin metrics API confirms platform-developer access (cached locally on success). */
export async function isPlatformDeveloperSession(accessToken: string): Promise<boolean> {
  if (!accessToken) return readPlatformDeveloperFlag();

  try {
    const res = await fetch(apiUrl("/api/admin/metrics"), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 200) {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return readPlatformDeveloperFlag();
      }
      const data = (await res.json()) as DeveloperMetricsPayload;
      const ok = typeof data.totalBrands === "number";
      writePlatformDeveloperFlag(ok);
      return ok;
    }

    if (res.status === 401 || res.status === 403) {
      writePlatformDeveloperFlag(false);
      return false;
    }

    return readPlatformDeveloperFlag();
  } catch {
    return readPlatformDeveloperFlag();
  }
}
