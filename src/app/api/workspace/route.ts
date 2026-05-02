import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchWorkspaceViaSupabase } from "@/lib/data/fetchWorkspaceViaSupabase";

type WorkspaceResponse = Awaited<ReturnType<typeof fetchWorkspaceViaSupabase>>;

type CachedWorkspaceEntry = { ts: number; value: WorkspaceResponse };

const globalForWorkspaceCache = globalThis as unknown as {
  workspaceResponseCache?: Map<string, CachedWorkspaceEntry>;
};

const workspaceResponseCache =
  globalForWorkspaceCache.workspaceResponseCache ?? new Map<string, CachedWorkspaceEntry>();

if (!globalForWorkspaceCache.workspaceResponseCache) {
  globalForWorkspaceCache.workspaceResponseCache = workspaceResponseCache;
}

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function workspaceCacheKey(tenantSlug: string, requestedCategoryId: string | null) {
  return `${tenantSlug}:${requestedCategoryId || "all"}`;
}

function readCachedWorkspace(tenantSlug: string, requestedCategoryId: string | null, ttlMs: number) {
  const entry = workspaceResponseCache.get(workspaceCacheKey(tenantSlug, requestedCategoryId));
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) return null;
  return entry.value;
}

function writeCachedWorkspace(tenantSlug: string, requestedCategoryId: string | null, value: WorkspaceResponse) {
  workspaceResponseCache.set(workspaceCacheKey(tenantSlug, requestedCategoryId), {
    ts: Date.now(),
    value,
  });
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenantSlug") || "";
  const requestedCategoryId = url.searchParams.get("categoryId");

  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  try {
    const response = await fetchWorkspaceViaSupabase(supabase, tenantSlug, requestedCategoryId);
    writeCachedWorkspace(tenantSlug, requestedCategoryId, response);

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=120",
      },
    });
  } catch (error: unknown) {
    const err = error as Error & { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;

    if (status >= 500 && status < 600) {
      const staleCached = readCachedWorkspace(tenantSlug, requestedCategoryId, 30 * 60_000);
      if (staleCached) {
        return NextResponse.json(staleCached, {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=10, stale-while-revalidate=120",
            "X-Workspace-Cache": "stale",
          },
        });
      }
    }

    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (status === 404) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    console.error("/api/workspace GET error", error);
    return NextResponse.json({ error: err.message || "Server error" }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
