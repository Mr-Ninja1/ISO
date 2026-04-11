import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { isLiveTemplateSchema } from "@/lib/templateVersioning";

type PrismaLikeError = { code?: string; message?: string };

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

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function getUserFromToken(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  return user;
}

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

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await withTimeout(
      prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, name: true, slug: true, logoUrl: true },
      }),
      1500,
      "Tenant lookup"
    );

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await withTimeout(
      prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, userId: user.id },
        select: { id: true, role: true },
      }),
      1500,
      "Membership lookup"
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = membership.role === "ADMIN";

    const categories = await withTimeout(
      prisma.category.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, sortOrder: true },
      }),
      2000,
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
                }))
            ),
          2500,
          "Templates lookup"
        )
      : [];

    return NextResponse.json({
      tenant,
      categories,
      selectedCategoryId,
      templates,
      isAdmin,
      role: membership.role,
    });
  } catch (error: any) {
    if (isPoolTimeoutError(error)) {
      return NextResponse.json(
        { error: "Workspace backend is busy. Using cached data where available." },
        { status: 503, headers: { "Retry-After": "2" } }
      );
    }
    console.error("/api/workspace GET error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
