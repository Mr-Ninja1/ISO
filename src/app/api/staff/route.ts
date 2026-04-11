import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { hashPin } from "@/lib/staffPin";

const STAFF_ROLE_VALUES = ["MANAGER", "AUDITOR", "VIEWER", "MEMBER"] as const;

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

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (or SUPABASE_SERVICE_ROLE / SUPABASE_SERVICE_KEY) and restart the server."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findSupabaseUserByEmail(email: string) {
  const admin = getSupabaseAdmin();
  const normalized = email.trim().toLowerCase();

  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);

    const users = data?.users || [];
    const found = users.find((u) => (u.email || "").toLowerCase() === normalized);
    if (found) return found;
    if (users.length < 200) break;
    page += 1;
  }

  return null;
}

async function ensureSupabaseUserForEmail(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await findSupabaseUserByEmail(normalizedEmail);
  if (existing) {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    return {
      userId: existing.id,
      createdAccount: false,
      normalizedEmail,
    };
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      createdByBrandAdmin: true,
      onboarding: "staff",
    },
  });

  if (error || !data?.user?.id) {
    throw new Error(error?.message || "Failed to create staff auth account");
  }

  return {
    userId: data.user.id,
    createdAccount: true,
    normalizedEmail,
  };
}

async function resolveAdminTenant(tenantSlug: string, userId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId },
    select: { role: true },
  });

  if (!membership || membership.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }

  return { tenant };
}

const addStaffSchema = z.object({
  tenantSlug: z.string().min(1),
  fullName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(STAFF_ROLE_VALUES).optional(),
});

const removeStaffSchema = z.object({
  tenantSlug: z.string().min(1),
  userId: z.string().uuid(),
});

const patchStaffSchema = z.object({
  tenantSlug: z.string().min(1),
  userId: z.string().uuid(),
  fullName: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(STAFF_ROLE_VALUES).optional(),
});

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

    const adminTenant = await resolveAdminTenant(tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    const members = await prisma.tenantMember.findMany({
      where: { tenantId: adminTenant.tenant.id },
      orderBy: [{ createdAt: "asc" }],
      select: { userId: true, role: true },
    });

    const pinRows = await prisma.tenantStaffPin.findMany({
      where: { tenantId: adminTenant.tenant.id },
      select: { userId: true, email: true, fullName: true, pinHash: true },
    });

    const pinByUserId = new Map(pinRows.map((r) => [r.userId, r]));

    const list = members.map((m) => {
      const pin = pinByUserId.get(m.userId);
      return {
        userId: m.userId,
        role: m.role,
        email: pin?.email || "",
        fullName: pin?.fullName || "",
        hasPin: Boolean(pin?.pinHash),
      };
    });

    return NextResponse.json({ staff: list, assignableRoles: STAFF_ROLE_VALUES });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = addStaffSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, fullName, email, password, role } = parsed.data;
    const normalizedFullName = fullName.trim();
    if (!normalizedFullName) {
      return NextResponse.json({ error: "Staff name is required" }, { status: 400 });
    }

    const adminTenant = await resolveAdminTenant(tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    const target = await ensureSupabaseUserForEmail(email, password);

    const existingMembership = await prisma.tenantMember.findUnique({
      where: {
        tenantId_userId: {
          tenantId: adminTenant.tenant.id,
          userId: target.userId,
        },
      },
      select: { role: true },
    });

    if (existingMembership?.role === "ADMIN") {
      return NextResponse.json(
        { error: "This user is an admin for this brand and cannot be assigned as staff." },
        { status: 409 }
      );
    }

    await prisma.tenantMember.upsert({
      where: {
        tenantId_userId: {
          tenantId: adminTenant.tenant.id,
          userId: target.userId,
        },
      },
      update: { role: role || "MEMBER" },
      create: {
        tenantId: adminTenant.tenant.id,
        userId: target.userId,
        role: role || "MEMBER",
      },
    });

    await prisma.tenantStaffPin.upsert({
      where: {
        tenantId_userId: {
          tenantId: adminTenant.tenant.id,
          userId: target.userId,
        },
      },
      update: {
        email: target.normalizedEmail,
        fullName: normalizedFullName,
        pinHash: hashPin(password),
      },
      create: {
        tenantId: adminTenant.tenant.id,
        userId: target.userId,
        email: target.normalizedEmail,
        fullName: normalizedFullName,
        pinHash: hashPin(password),
      },
    });

    return NextResponse.json({
      ok: true,
      userId: target.userId,
      createdAccount: target.createdAccount,
      email: target.normalizedEmail,
      fullName: normalizedFullName,
      role: role || "MEMBER",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = removeStaffSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, userId } = parsed.data;
    const adminTenant = await resolveAdminTenant(tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    await prisma.$transaction([
      prisma.tenantMember.deleteMany({ where: { tenantId: adminTenant.tenant.id, userId, role: "MEMBER" } }),
      prisma.tenantStaffPin.deleteMany({ where: { tenantId: adminTenant.tenant.id, userId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = patchStaffSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, userId, fullName, email, password, role } = parsed.data;

    if (!fullName && !email && !password && !role) {
      return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
    }

    const adminTenant = await resolveAdminTenant(tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    const membership = await prisma.tenantMember.findUnique({
      where: {
        tenantId_userId: {
          tenantId: adminTenant.tenant.id,
          userId,
        },
      },
      select: { role: true },
    });

    if (!membership) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    if (membership.role === "ADMIN") {
      return NextResponse.json({ error: "Admin accounts cannot be edited here" }, { status: 409 });
    }

    if (role) {
      await prisma.tenantMember.update({
        where: {
          tenantId_userId: {
            tenantId: adminTenant.tenant.id,
            userId,
          },
        },
        data: { role },
      });
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const pinRow = await prisma.tenantStaffPin.findUnique({
      where: {
        tenantId_userId: {
          tenantId: adminTenant.tenant.id,
          userId,
        },
      },
      select: { email: true, fullName: true, pinHash: true },
    });

    const nextEmail = normalizedEmail || pinRow?.email;
    const nextFullName = fullName?.trim() || pinRow?.fullName;
    if ((password || normalizedEmail) && !nextEmail) {
      return NextResponse.json({ error: "Email is required to save credentials" }, { status: 400 });
    }
    if ((password || fullName) && !nextFullName) {
      return NextResponse.json({ error: "Staff name is required" }, { status: 400 });
    }

    if (password || normalizedEmail || fullName) {
      const nextPinHash = password ? hashPin(password) : pinRow?.pinHash;
      if (!nextPinHash) {
        return NextResponse.json({ error: "Password is required for this staff member" }, { status: 400 });
      }

      await prisma.tenantStaffPin.upsert({
        where: {
          tenantId_userId: {
            tenantId: adminTenant.tenant.id,
            userId,
          },
        },
        update: {
          email: nextEmail!,
          fullName: nextFullName!,
          pinHash: nextPinHash,
        },
        create: {
          tenantId: adminTenant.tenant.id,
          userId,
          email: nextEmail!,
          fullName: nextFullName!,
          pinHash: nextPinHash,
        },
      });
    }

    if (password || normalizedEmail) {
      const admin = getSupabaseAdmin();
      const updatePayload: { email?: string; password?: string; email_confirm?: boolean } = {};
      if (normalizedEmail) {
        updatePayload.email = normalizedEmail;
        updatePayload.email_confirm = true;
      }
      if (password) updatePayload.password = password;

      const { error } = await admin.auth.admin.updateUserById(userId, updatePayload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      userId,
      email: nextEmail || null,
      fullName: nextFullName || null,
      passwordUpdated: Boolean(password),
      role: role || membership.role,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
