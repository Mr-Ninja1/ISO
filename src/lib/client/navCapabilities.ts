export type NavCapabilities = {
  canSeeAdminRoutes: boolean;
  canCreateForms: boolean;
};

import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { hasPermission, normalizeRole } from "@/lib/roleGate";
import type { SupabaseClient } from "@supabase/supabase-js";

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

async function fetchNavCapabilitiesViaSupabase(
  supabase: SupabaseClient,
  tenantSlug: string
): Promise<NavCapabilities> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr || !tenant) throw new Error("Tenant not found");

  const { data: membership, error: memErr } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr || !membership) throw new Error("Forbidden");

  const role = normalizeRole(membership.role);
  const canSeeAdminRoutes = role === "ADMIN" || role === "MANAGER";
  return {
    canSeeAdminRoutes,
    canCreateForms: hasPermission(role, "forms.create") || canSeeAdminRoutes,
  };
}

export async function fetchNavCapabilities(accessToken: string, tenantSlug: string): Promise<NavCapabilities> {
  const cached = readCachedNavCapabilities(tenantSlug);
  if (cached) return cached;

  const existing = inflight.get(tenantSlug);
  if (existing) return existing;

  const promise = (async () => {
    const value = isCapacitorNativeApp()
      ? await (async () => {
          const { createClient } = await import("@/lib/auth");
          return fetchNavCapabilitiesViaSupabase(createClient(), tenantSlug);
        })()
      : await (async () => {
          const url = new URL(apiUrl("/api/workspace/capabilities"));
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
          return {
            canSeeAdminRoutes,
            canCreateForms: Boolean(json.capabilities?.canCreateForms) || canSeeAdminRoutes,
          };
        })();

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
