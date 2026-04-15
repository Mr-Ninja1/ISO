import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase env for tenant creation", {
        supabaseUrl: !!supabaseUrl,
        supabaseAnonKey: !!supabaseAnonKey,
      });
      return NextResponse.json(
        { error: "Supabase environment variables are not configured." },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError) {
      console.warn("/api/tenants/create: supabase getUser error", userError.message);
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate slug from name (lowercase, replace spaces with hyphens)
    let slug = name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    if (!slug) {
      slug = `brand-${Math.random().toString(36).slice(2, 8)}`;
    }

    // Ensure slug is unique
    let attempt = 0;
    let uniqueSlug = slug;
    while (attempt < 10) {
      const existing = await prisma.tenant.findUnique({ where: { slug: uniqueSlug } });
      if (!existing) break;
      uniqueSlug = `${slug}-${++attempt}`;
    }

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: uniqueSlug,
        members: {
          create: {
            userId: user.id,
            role: "ADMIN",
          },
        },
      },
    });

    return NextResponse.json({ slug: tenant.slug, tenantId: tenant.id });
  } catch (error: any) {
    console.error("Error creating tenant:", error);
    return NextResponse.json({ error: error.message || "Failed to create tenant" }, { status: 500 });
  }
}
