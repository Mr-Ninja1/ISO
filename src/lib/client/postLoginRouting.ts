import { apiUrl } from "@/lib/client/apiBase";
import { fetchNavCapabilities } from "@/lib/client/navCapabilities";
import { isPlatformDeveloperSession } from "@/lib/client/platformDeveloperSession";

export type PostLoginRoute = {
  path: string;
  usedOfflineFallback?: boolean;
};

function normalizeTenantSlug(value: string | null | undefined) {
  const slug = (value || "").trim();
  if (!slug || slug === "_" || slug === "workspace") return "";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return "";
  return slug;
}

function isNetworkFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|network request failed|load failed/i.test(message);
}

async function verifyStaffSession(accessToken: string, fallbackEmail: string, userId: string | null) {
  const verifyRes = await fetch(apiUrl("/api/staff/verify-pin"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const verifyJson = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) {
    throw new Error(verifyJson?.error || "PIN verification failed");
  }

  try {
    localStorage.setItem(
      "active-staff-profile:v1",
      JSON.stringify({
        tenantSlug: verifyJson?.tenantSlug || null,
        name: verifyJson?.staffName || null,
        email: verifyJson?.staffEmail || fallbackEmail,
        userId,
        ts: Date.now(),
      })
    );
  } catch {
    // ignore
  }

  return typeof verifyJson?.tenantSlug === "string" ? verifyJson.tenantSlug : "";
}

export async function resolvePostLoginRoute(
  accessToken: string,
  fallbackEmail: string,
  userId: string | null
): Promise<PostLoginRoute> {
  try {
    if (await isPlatformDeveloperSession(accessToken)) {
      return { path: "/admin" };
    }

    const tenantSlug = await verifyStaffSession(accessToken, fallbackEmail, userId);
    if (tenantSlug) {
      try {
        localStorage.setItem("lastTenantSlug", tenantSlug);
      } catch {
        // ignore
      }

      const caps = await fetchNavCapabilities(accessToken, tenantSlug).catch(() => null);
      if (caps?.canSeeAdminRoutes) {
        return {
          path: `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}&view=admin`,
        };
      }

      return { path: `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}` };
    }

    return { path: "/workspace" };
  } catch (error) {
    if (!isNetworkFetchError(error)) throw error;

    const lastTenant =
      typeof window !== "undefined" ? normalizeTenantSlug(localStorage.getItem("lastTenantSlug")) : "";
    if (lastTenant) {
      return {
        path: `/workspace?tenantSlug=${encodeURIComponent(lastTenant)}`,
        usedOfflineFallback: true,
      };
    }

    return { path: "/workspace", usedOfflineFallback: true };
  }
}
