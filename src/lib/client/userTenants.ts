import type { SupabaseClient } from "@supabase/supabase-js";

export type UserTenantSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: string;
};

type TenantEmbed = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active?: boolean;
};

function readEmbeddedTenant(
  embedded: TenantEmbed | TenantEmbed[] | null | undefined
): TenantEmbed | null {
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded ?? null;
}

/** Load brands for the signed-in user directly from Supabase (native app path). */
export async function fetchUserTenantsViaSupabase(
  supabase: SupabaseClient
): Promise<UserTenantSummary[]> {
  const { data: rows, error } = await supabase
    .from("tenant_members")
    .select("role, tenants(id, name, slug, logo_url, is_active)")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (rows || [])
    .map((row) => {
      const tenant = readEmbeddedTenant(row.tenants as TenantEmbed | TenantEmbed[] | null);
      if (!tenant || tenant.is_active === false) return null;
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logo_url,
        role: (row.role as string) || "MEMBER",
      };
    })
    .filter((tenant): tenant is UserTenantSummary => tenant != null);
}

export function pickPrimaryTenantSlug(tenants: UserTenantSummary[]): string {
  if (!tenants.length) return "";
  const admin = tenants.find((tenant) => tenant.role === "ADMIN");
  return admin?.slug || tenants[0].slug;
}

export function tenantHasAdminRoutes(tenant: UserTenantSummary): boolean {
  return tenant.role === "ADMIN";
}

type TenantSlugEmbed = {
  id: string;
  slug: string;
  name: string;
};

function readEmbeddedSlugTenant(
  embedded: TenantSlugEmbed | TenantSlugEmbed[] | null | undefined
): TenantSlugEmbed | null {
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded ?? null;
}

/** Mirrors /api/staff/verify-pin tenant resolution without the hosted API. */
export async function resolveStaffTenantSlugViaSupabase(
  supabase: SupabaseClient,
  fallbackEmail: string,
  userId: string | null
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "";

  const { data: membershipRows, error: memErr } = await supabase
    .from("tenant_members")
    .select("tenant_id, role, tenants(id, slug, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (memErr) throw new Error(memErr.message);

  type Membership = {
    tenantId: string;
    role: string;
    tenant: { id: string; slug: string; name: string };
  };

  const memberships = (membershipRows || [])
    .map((row) => {
      const tenant = readEmbeddedSlugTenant(
        row.tenants as TenantSlugEmbed | TenantSlugEmbed[] | null
      );
      if (!tenant) return null;
      return {
        tenantId: row.tenant_id as string,
        role: row.role as string,
        tenant,
      };
    })
    .filter((membership): membership is Membership => membership != null);

  if (!memberships.length) return "";

  const adminMembership = memberships.find((membership) => membership.role === "ADMIN");
  if (adminMembership) {
    try {
      localStorage.setItem(
        "active-staff-profile:v1",
        JSON.stringify({
          tenantSlug: adminMembership.tenant.slug,
          name: (user.user_metadata as { full_name?: string } | undefined)?.full_name || user.email || "Admin",
          email: user.email || fallbackEmail,
          userId,
          ts: Date.now(),
        })
      );
    } catch {
      // ignore
    }
    return adminMembership.tenant.slug;
  }

  const memberTenantIds = memberships.map((membership) => membership.tenantId);
  const { data: pinRows } = await supabase
    .from("tenant_staff_pins")
    .select("tenant_id, full_name, email")
    .eq("user_id", user.id)
    .in("tenant_id", memberTenantIds);

  if (!pinRows?.length) {
    const fallback = memberships[0];
    try {
      localStorage.setItem(
        "active-staff-profile:v1",
        JSON.stringify({
          tenantSlug: fallback.tenant.slug,
          name: user.email || "Staff",
          email: user.email || fallbackEmail,
          userId,
          ts: Date.now(),
        })
      );
    } catch {
      // ignore
    }
    return fallback.tenant.slug;
  }

  const matched = pinRows[0] as { tenant_id: string; full_name: string; email: string };
  const membership = memberships.find((item) => item.tenantId === matched.tenant_id) || memberships[0];

  try {
    localStorage.setItem(
      "active-staff-profile:v1",
      JSON.stringify({
        tenantSlug: membership.tenant.slug,
        name: matched.full_name || matched.email || user.email || "Staff",
        email: matched.email || user.email || fallbackEmail,
        userId,
        ts: Date.now(),
      })
    );
  } catch {
    // ignore
  }

  return membership.tenant.slug;
}
