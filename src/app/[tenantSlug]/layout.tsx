import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TenantHeaderNav } from "@/components/tenant/TenantHeaderNav";

function displayNameFromSlug(slug: string) {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Workspace";
  return cleaned
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
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

  let tenant: { name: string; slug: string; logoUrl: string | null } | null = null;
  let dbUnavailable = false;

  try {
    const dbTenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (dbTenant) {
      tenant = {
        name: dbTenant.name,
        slug: dbTenant.slug,
        logoUrl: dbTenant.logoUrl,
      };
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

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,rgba(23,23,23,0.04)_0%,rgba(23,23,23,0.02)_40%,rgba(23,23,23,0.05)_100%)]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-6">
      <header className="sticky top-0 z-20 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-foreground/15 bg-background/95 p-4 shadow-sm backdrop-blur sm:items-center sm:gap-4">
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
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold">{tenant.name}</h1>
            <p className="text-sm text-foreground/70">/{tenant.slug}{dbUnavailable ? " (offline)" : ""}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div id="tenant-header-actions" className="mr-1 flex flex-wrap items-center justify-end gap-1.5 sm:mr-2" />
          <TenantHeaderNav tenantSlug={tenant.slug} />
        </div>
      </header>

      <main className="flex flex-col gap-6 rounded-xl border border-foreground/10 bg-background/85 p-4 shadow-sm sm:p-5">
        {children}
      </main>
      </div>
    </div>
  );
}

