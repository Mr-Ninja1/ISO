import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hashPin } from "@/lib/staffPin";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

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

async function resolveAdminTenant(sb: SupabaseClient, tenantSlug: string, userId: string) {
  const { data: tenant, error: te } = await sb.from("tenants").select("id, slug").eq("slug", tenantSlug).maybeSingle();
  if (te || !tenant) return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (me || !membership || !hasPermission(membership.role, "staff.manage")) {
    return { error: NextResponse.json({ error: "Staff management access required" }, { status: 403 }) };
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

    const sb = createSupabaseWithBearer(token);
    const adminTenant = await resolveAdminTenant(sb, tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    const { data: members } = await sb
      .from("tenant_members")
      .select("user_id, role")
      .eq("tenant_id", adminTenant.tenant.id)
      .order("created_at", { ascending: true });

    const { data: pinRows } = await sb
      .from("tenant_staff_pins")
      .select("user_id, email, full_name, pin_hash")
      .eq("tenant_id", adminTenant.tenant.id);

    const pinByUserId = new Map((pinRows || []).map((r) => [r.user_id as string, r]));

    const list = (members || []).map((m) => {
      const pin = pinByUserId.get(m.user_id as string);
      return {
        userId: m.user_id as string,
        role: m.role as string,
        email: (pin?.email as string) || "",
        fullName: (pin?.full_name as string) || "",
        hasPassword: Boolean(pin?.pin_hash),
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

    const sb = createSupabaseWithBearer(token);
    const adminTenant = await resolveAdminTenant(sb, tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    const target = await ensureSupabaseUserForEmail(email, password);

    const { data: existingMembership } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", adminTenant.tenant.id)
      .eq("user_id", target.userId)
      .maybeSingle();

    if (existingMembership?.role === "ADMIN") {
      return NextResponse.json(
        { error: "This user is an admin for this brand and cannot be assigned as staff." },
        { status: 409 }
      );
    }

    const { error: memErr } = await sb.from("tenant_members").upsert(
      {
        tenant_id: adminTenant.tenant.id,
        user_id: target.userId,
        role: role || "MEMBER",
      },
      { onConflict: "tenant_id,user_id" }
    );

    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

    const { error: pinErr } = await sb.from("tenant_staff_pins").upsert(
      {
        tenant_id: adminTenant.tenant.id,
        user_id: target.userId,
        email: target.normalizedEmail,
        full_name: normalizedFullName,
        pin_hash: hashPin(password),
      },
      { onConflict: "tenant_id,user_id" }
    );

    if (pinErr) return NextResponse.json({ error: pinErr.message }, { status: 500 });

    await recordActivity(sb, {
      tenantId: adminTenant.tenant.id,
      userId: user.id,
      action: "staff.upsert",
      entityType: "TenantMember",
      entityId: target.userId,
      details: { role: role || "MEMBER", email: target.normalizedEmail, fullName: normalizedFullName },
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
    const sb = createSupabaseWithBearer(token);
    const adminTenant = await resolveAdminTenant(sb, tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    const { data: membership } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", adminTenant.tenant.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    if (membership.role === "ADMIN") {
      return NextResponse.json({ error: "Admin accounts cannot be removed here" }, { status: 409 });
    }

    await sb.from("tenant_staff_pins").delete().eq("tenant_id", adminTenant.tenant.id).eq("user_id", userId);

    const { error: delMemErr } = await sb.from("tenant_members").delete().eq("tenant_id", adminTenant.tenant.id).eq("user_id", userId);

    if (delMemErr) return NextResponse.json({ error: delMemErr.message }, { status: 500 });

    await recordActivity(sb, {
      tenantId: adminTenant.tenant.id,
      userId: user.id,
      action: "staff.remove",
      entityType: "TenantMember",
      entityId: userId,
      details: { role: membership.role },
    });

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

    const sb = createSupabaseWithBearer(token);
    const adminTenant = await resolveAdminTenant(sb, tenantSlug, user.id);
    if (adminTenant.error) return adminTenant.error;

    const { data: membership } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", adminTenant.tenant.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    if (membership.role === "ADMIN") {
      return NextResponse.json({ error: "Admin accounts cannot be edited here" }, { status: 409 });
    }

    if (role) {
      const { error: roleErr } = await sb.from("tenant_members").update({ role }).eq("tenant_id", adminTenant.tenant.id).eq("user_id", userId);
      if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const { data: pinRow } = await sb
      .from("tenant_staff_pins")
      .select("email, full_name, pin_hash")
      .eq("tenant_id", adminTenant.tenant.id)
      .eq("user_id", userId)
      .maybeSingle();

    const nextEmail = normalizedEmail || (pinRow?.email as string | undefined);
    const nextFullName = fullName?.trim() || (pinRow?.full_name as string | undefined);
    if ((password || normalizedEmail) && !nextEmail) {
      return NextResponse.json({ error: "Email is required to save credentials" }, { status: 400 });
    }
    if ((password || fullName) && !nextFullName) {
      return NextResponse.json({ error: "Staff name is required" }, { status: 400 });
    }

    if (password || normalizedEmail || fullName) {
      const nextPinHash = password ? hashPin(password) : (pinRow?.pin_hash as string | undefined);
      if (!nextPinHash) {
        return NextResponse.json({ error: "Password is required for this staff member" }, { status: 400 });
      }

      const { error: pinUpErr } = await sb.from("tenant_staff_pins").upsert(
        {
          tenant_id: adminTenant.tenant.id,
          user_id: userId,
          email: nextEmail!,
          full_name: nextFullName!,
          pin_hash: nextPinHash,
        },
        { onConflict: "tenant_id,user_id" }
      );

      if (pinUpErr) return NextResponse.json({ error: pinUpErr.message }, { status: 500 });
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

    await recordActivity(sb, {
      tenantId: adminTenant.tenant.id,
      userId: user.id,
      action: "staff.update",
      entityType: "TenantMember",
      entityId: userId,
      details: {
        changedRole: Boolean(role),
        changedPassword: Boolean(password),
        changedEmail: Boolean(normalizedEmail),
        changedName: Boolean(fullName),
      },
    });

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
