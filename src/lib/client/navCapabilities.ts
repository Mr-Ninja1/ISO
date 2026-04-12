export type NavCapabilities = {
  canSeeAdminRoutes: boolean;
  canCreateForms: boolean;
};

type CacheEntry = { ts: number; value: NavCapabilities };

const TTL_MS = 5 * 60_000;
const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<NavCapabilities>>();

function keyFor(tenantSlug: string) {
  return `tenant-nav-caps:v1:${tenantSlug}`;
}

function readFromStorage(tenantSlug: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(keyFor(tenantSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || typeof parsed.ts !== "number" || !parsed.value) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToStorage(tenantSlug: string, entry: CacheEntry) {
  try {
    localStorage.setItem(keyFor(tenantSlug), JSON.stringify(entry));
  } catch {
    // ignore
  }
}

export function readCachedNavCapabilities(tenantSlug: string): NavCapabilities | null {
  const fromMemory = memory.get(tenantSlug);
  if (fromMemory && Date.now() - fromMemory.ts < TTL_MS) return fromMemory.value;

  const fromStorage = readFromStorage(tenantSlug);
  if (fromStorage && Date.now() - fromStorage.ts < TTL_MS) {
    memory.set(tenantSlug, fromStorage);
    return fromStorage.value;
  }

  return null;
}

export async function fetchNavCapabilities(accessToken: string, tenantSlug: string): Promise<NavCapabilities> {
  const cached = readCachedNavCapabilities(tenantSlug);
  if (cached) return cached;

  const existing = inflight.get(tenantSlug);
  if (existing) return existing;

  const promise = (async () => {
    const url = new URL("/api/workspace/capabilities", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error("Failed to load navigation capabilities");
    const json = (await res.json()) as {
      role?: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
      capabilities?: { canCreateForms?: boolean };
    };

    const role = json.role || "MEMBER";
    const canSeeAdminRoutes = role === "ADMIN" || role === "MANAGER";
    const value: NavCapabilities = {
      canSeeAdminRoutes,
      canCreateForms: Boolean(json.capabilities?.canCreateForms) || canSeeAdminRoutes,
    };

    const entry: CacheEntry = { ts: Date.now(), value };
    memory.set(tenantSlug, entry);
    writeToStorage(tenantSlug, entry);
    return value;
  })()
    .finally(() => {
      inflight.delete(tenantSlug);
    });

  inflight.set(tenantSlug, promise);
  return promise;
}
