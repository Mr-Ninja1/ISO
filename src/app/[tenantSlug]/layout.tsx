import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TenantHeaderNav } from "@/components/tenant/TenantHeaderNav";
import { TenantBottomTabNav } from "@/components/tenant/TenantBottomTabNav";
import { BackgroundSyncManager } from "@/components/BackgroundSyncManager";
import { LoggedInStaffBadge } from "@/components/LoggedInStaffBadge";

type TenantHeaderMeta = { name: string; slug: string; logoUrl: string | null };
type TenantHeaderCacheEntry = { ts: number; tenant: TenantHeaderMeta };

const globalForTenantHeaderCache = globalThis as unknown as {
  tenantHeaderCache?: Map<string, TenantHeaderCacheEntry>;
};

const tenantHeaderCache = globalForTenantHeaderCache.tenantHeaderCache ?? new Map<string, TenantHeaderCacheEntry>();
if (!globalForTenantHeaderCache.tenantHeaderCache) {
  globalForTenantHeaderCache.tenantHeaderCache = tenantHeaderCache;
}

function displayNameFromSlug(slug: string) {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Workspace";
  return cleaned
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

async function findTenantWithTimeout(tenantSlug: string, timeoutMs: number) {
  return Promise.race([
    prisma.tenant.findUnique({ where: { slug: tenantSlug } }),
    new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error("Tenant lookup timed out")), timeoutMs);
    }),
  ]);
}

function readTenantHeaderCache(tenantSlug: string, ttlMs: number): TenantHeaderMeta | null {
  const item = tenantHeaderCache.get(tenantSlug);
  if (!item) return null;
  if (Date.now() - item.ts > ttlMs) {
    tenantHeaderCache.delete(tenantSlug);
    return null;
  }
  return item.tenant;
}

function writeTenantHeaderCache(tenant: TenantHeaderMeta) {
  tenantHeaderCache.set(tenant.slug, { ts: Date.now(), tenant });
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  if (!tenantSlug) notFound();

  let tenant: TenantHeaderMeta | null = readTenantHeaderCache(tenantSlug, 5 * 60_000);
  let dbUnavailable = false;

  if (!tenant) {
    try {
      const dbTenant = await findTenantWithTimeout(tenantSlug, 1200);
      if (dbTenant) {
        tenant = {
          name: dbTenant.name,
          slug: dbTenant.slug,
          logoUrl: dbTenant.logoUrl,
        };
        writeTenantHeaderCache(tenant);
      } else {
        // Tenant not found (db reachable). Keep existing behavior.
        notFound();
      }
    } catch {
      dbUnavailable = true;
      // Offline/DB timeout fallback: keep route usable for cached client data.
      tenant = {
        name: displayNameFromSlug(tenantSlug),
        slug: tenantSlug,
        logoUrl: null,
      };
    }
  }

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,rgba(23,23,23,0.04)_0%,rgba(23,23,23,0.02)_40%,rgba(23,23,23,0.05)_100%)]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-6 print:max-w-none print:p-0">
      <header className="sticky top-0 z-20 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-foreground/15 bg-background/95 p-3 shadow-sm backdrop-blur sm:items-center sm:gap-4 sm:p-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-foreground/20">
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt={`${tenant.name} logo`}
                className="h-8 w-8 object-contain"
              />
            ) : (
              <span className="text-sm font-semibold">{tenant.name[0]}</span>
            )}
          </div>
          <div className="min-w-0 flex flex-col">
            <h1 className="truncate text-base font-semibold sm:text-lg">{tenant.name}</h1>
            <p className="text-sm text-foreground/70">/{tenant.slug}{dbUnavailable ? " (offline)" : ""}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <div id="tenant-header-actions" className="order-3 flex w-full flex-wrap items-center justify-end gap-1.5 sm:order-1 sm:mr-2 sm:w-auto" />
          <div className="hidden md:block">
            <LoggedInStaffBadge tenantSlug={tenant.slug} />
          </div>
          <div className="hidden md:block">
            <BackgroundSyncManager />
          </div>
          <TenantHeaderNav tenantSlug={tenant.slug} />
        </div>
      </header>

      <main className="flex flex-col gap-6 rounded-xl border border-foreground/10 bg-background/85 p-4 pb-20 shadow-sm sm:p-5 sm:pb-5 print:rounded-none print:border-0 print:bg-white print:p-0 print:pb-0 print:shadow-none">
        {children}
      </main>
      </div>
      <div className="print:hidden">
        <TenantBottomTabNav tenantSlug={tenant.slug} />
      </div>
    </div>
  );
}

