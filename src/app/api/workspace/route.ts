import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { isLiveTemplateSchema } from "@/lib/templateVersioning";
import { hasPermission, normalizeRole } from "@/lib/roleGate";

type PrismaLikeError = { code?: string; message?: string };
type WorkspaceResponse = {
  tenant: { id: string; name: string; slug: string; logoUrl: string | null };
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  selectedCategoryId: string | null;
  templates: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    categoryId: string | null;
    hasTemperatureInputs?: boolean;
    settings?: {
      dueDays?: number;
      temperatureAlertBelow?: number;
      temperatureAlertAbove?: number;
      temperatureUnit?: "C" | "F";
    };
  }>;
  isAdmin: boolean;
  role: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
  capabilities: {
    canAccessSettings: boolean;
    canCreateForms: boolean;
    canManageCategories: boolean;
    canManageStaff: boolean;
  };
};

type CachedWorkspaceEntry = { ts: number; value: WorkspaceResponse };

const globalForWorkspaceCache = globalThis as unknown as {
  workspaceResponseCache?: Map<string, CachedWorkspaceEntry>;
};

const workspaceResponseCache =
  globalForWorkspaceCache.workspaceResponseCache ?? new Map<string, CachedWorkspaceEntry>();

if (!globalForWorkspaceCache.workspaceResponseCache) {
  globalForWorkspaceCache.workspaceResponseCache = workspaceResponseCache;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        const err = new Error(`${label} timed out`);
        (err as PrismaLikeError).code = "P2024";
        reject(err);
      }, timeoutMs);
    }),
  ]);
}

function isPoolTimeoutError(error: unknown) {
  const err = error as PrismaLikeError | null;
  if (!err) return false;
  if (err.code === "P2024") return true;
  return /P2024|connection pool timeout|timed out fetching a new connection/i.test(err.message || "");
}

function schemaHasTemperatureInputs(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const obj = schema as Record<string, unknown>;
  const sections = Array.isArray(obj.sections) && obj.sections.length
    ? (obj.sections as Array<Record<string, unknown>>)
    : Array.isArray(obj.fields)
      ? [{ type: "fields", fields: obj.fields } as Record<string, unknown>]
      : [];

  for (const section of sections) {
    if (section.type === "fields" && Array.isArray(section.fields)) {
      if (section.fields.some((field) => field && typeof field === "object" && !Array.isArray(field) && (field as Record<string, unknown>).type === "temp" && (field as Record<string, unknown>).isActive !== false)) {
        return true;
      }
    }

    if (section.type === "grid" && Array.isArray(section.columns)) {
      if (section.columns.some((col) => col && typeof col === "object" && !Array.isArray(col) && (col as Record<string, unknown>).type === "temp" && (col as Record<string, unknown>).isActive !== false)) {
        return true;
      }
    }
  }

  return false;
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

async function getUserFromToken(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  // Retry once for transient network/connectivity issues (short backoff)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      return user;
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }

  return null as any;
}

// Configurable timeouts (ms) for workspace DB lookups - increase on slow networks
const TENANT_LOOKUP_TIMEOUT = parseInt(process.env.TENANT_LOOKUP_TIMEOUT_MS || "3000", 10);
const MEMBERSHIP_LOOKUP_TIMEOUT = parseInt(process.env.MEMBERSHIP_LOOKUP_TIMEOUT_MS || "3000", 10);
const CATEGORIES_LOOKUP_TIMEOUT = parseInt(process.env.CATEGORIES_LOOKUP_TIMEOUT_MS || "5000", 10);
const TEMPLATES_LOOKUP_TIMEOUT = parseInt(process.env.TEMPLATES_LOOKUP_TIMEOUT_MS || "8000", 10);

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get("tenantSlug") || "";
    const requestedCategoryId = url.searchParams.get("categoryId");

    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const staleCached = readCachedWorkspace(tenantSlug, requestedCategoryId, 10 * 60_000);

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await withTimeout(
      prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, name: true, slug: true, logoUrl: true },
      }),
      TENANT_LOOKUP_TIMEOUT,
      "Tenant lookup"
    );

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await withTimeout(
      prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, userId: user.id },
        select: { id: true, role: true },
      }),
      MEMBERSHIP_LOOKUP_TIMEOUT,
      "Membership lookup"
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedRole = normalizeRole(membership.role);
    const isAdmin = normalizedRole === "ADMIN";
    const capabilities = {
      canAccessSettings: hasPermission(normalizedRole, "settings.view"),
      canCreateForms: hasPermission(normalizedRole, "forms.create"),
      canManageCategories: hasPermission(normalizedRole, "categories.manage"),
      canManageStaff: hasPermission(normalizedRole, "staff.manage"),
    };

    const categories = await withTimeout(
      prisma.category.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, sortOrder: true },
      }),
      CATEGORIES_LOOKUP_TIMEOUT,
      "Categories lookup"
    );

    let selectedCategoryId: string | null = requestedCategoryId;
    if (categories.length === 0) {
      selectedCategoryId = null;
    } else {
      const found = selectedCategoryId
        ? categories.some((c) => c.id === selectedCategoryId)
        : false;
      if (!selectedCategoryId || !found) {
        selectedCategoryId = categories[0].id;
      }
    }

    const templates = selectedCategoryId
      ? await withTimeout(
          prisma.formTemplate
            .findMany({
              where: { tenantId: tenant.id, categoryId: selectedCategoryId },
              orderBy: [{ updatedAt: "desc" }],
              select: { id: true, title: true, updatedAt: true, categoryId: true, schema: true },
            })
            .then((rows) =>
              rows
                .filter((t) => isLiveTemplateSchema(t.schema))
                .map((t) => ({
                  id: t.id,
                  title: t.title,
                  updatedAt: t.updatedAt,
                  categoryId: t.categoryId,
                    hasTemperatureInputs: schemaHasTemperatureInputs(t.schema),
                    settings:
                      t.schema && typeof t.schema === "object" && !Array.isArray(t.schema) && (t.schema as any).meta
                        ? {
                            dueDays:
                              typeof (t.schema as any).meta?.dueDays === "number" ? (t.schema as any).meta.dueDays : undefined,
                            temperatureAlertBelow:
                              typeof (t.schema as any).meta?.temperatureAlertBelow === "number"
                                ? (t.schema as any).meta.temperatureAlertBelow
                                : undefined,
                            temperatureAlertAbove:
                              typeof (t.schema as any).meta?.temperatureAlertAbove === "number"
                                ? (t.schema as any).meta.temperatureAlertAbove
                                : undefined,
                            temperatureUnit:
                              (t.schema as any).meta?.temperatureUnit === "F" || (t.schema as any).meta?.temperatureUnit === "C"
                                ? (t.schema as any).meta.temperatureUnit
                                : undefined,
                          }
                        : undefined,
                }))
            ),
            TEMPLATES_LOOKUP_TIMEOUT,
            "Templates lookup"
        )
      : [];

    const response: WorkspaceResponse = {
      tenant,
      categories,
      selectedCategoryId,
      templates,
      isAdmin,
      role: normalizedRole,
      capabilities,
    };

    writeCachedWorkspace(tenantSlug, requestedCategoryId, response);

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=120",
      },
    });
  } catch (error: any) {
    if (isPoolTimeoutError(error)) {
      const url = new URL(req.url);
      const tenantSlug = url.searchParams.get("tenantSlug") || "";
      const requestedCategoryId = url.searchParams.get("categoryId");
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

      return NextResponse.json(
        { error: "Workspace backend is busy. Using cached data where available." },
        { status: 503, headers: { "Retry-After": "2" } }
      );
    }
    console.error("/api/workspace GET error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
