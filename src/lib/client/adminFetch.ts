import { apiUrl } from "@/lib/client/apiBase";

export type AdminFetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status?: number; aborted?: boolean };

export function normalizeAdminError(err: unknown, fallback = "Something went wrong"): string {
  let message = fallback;
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Request was cancelled.";
    if (err.message) message = err.message;
  } else if (typeof err === "string" && err.trim()) {
    message = err.trim();
  }
  return humanizeAdminApiError(message);
}

/** Supabase and gateway errors are often opaque — map them for the admin UI. */
export function humanizeAdminApiError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("auth session missing") || lower.includes("invalid jwt") || lower.includes("jwt expired")) {
    return "Your session expired. Sign out and sign in again.";
  }
  if (lower === "forbidden") return "This account is not approved for the developer console.";
  return message;
}

function networkHint(): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You appear to be offline. Reconnect, then try again.";
  }
  return "Network error or slow connection. Wait a moment and try again.";
}

/**
 * Admin console fetch — never throws; use for all developer-dashboard requests.
 */
export async function adminFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<AdminFetchResult<T>> {
  const timeoutMs = init?.timeoutMs ?? 45_000;
  const timeoutController = new AbortController();
  if (init?.signal) {
    if (init.signal.aborted) timeoutController.abort();
    else init.signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
  }
  const timeoutId =
    typeof window !== "undefined"
      ? window.setTimeout(() => timeoutController.abort(), timeoutMs)
      : undefined;

  const url = path.startsWith("http") ? path : apiUrl(path);

  try {
    const { timeoutMs: _t, signal: _s, ...rest } = init ?? {};
    const res = await fetch(url, { ...rest, signal: timeoutController.signal });
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);

    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      const raw =
        typeof json === "object" && json && "error" in json && typeof json.error === "string"
          ? json.error
          : `Request failed (${res.status})`;
      return { ok: false, error: humanizeAdminApiError(raw), status: res.status };
    }
    return { ok: true, data: json, status: res.status };
  } catch (err: unknown) {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      const aborted = timeoutController.signal.aborted && !(init?.signal?.aborted);
      return {
        ok: false,
        error: aborted ? "Request timed out. Check your connection and try again." : "Request cancelled.",
        aborted: true,
      };
    }
    return { ok: false, error: networkHint() };
  }
}
