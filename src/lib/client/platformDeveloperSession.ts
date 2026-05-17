import { apiUrl } from "@/lib/client/apiBase";

type DeveloperMetricsPayload = {
  totalBrands?: unknown;
};

/** True only when the hosted admin metrics API confirms platform-developer access. */
export async function isPlatformDeveloperSession(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;

  try {
    const res = await fetch(apiUrl("/api/admin/metrics"), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status !== 200) return false;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return false;

    const data = (await res.json()) as DeveloperMetricsPayload;
    return typeof data.totalBrands === "number";
  } catch {
    return false;
  }
}
