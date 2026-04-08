import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TenantHeaderNav } from "@/components/tenant/TenantHeaderNav";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  if (!tenantSlug) notFound();
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) notFound();

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4">
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
            <p className="text-sm text-foreground/70">/{tenant.slug}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div id="tenant-header-actions" className="mr-1 flex flex-wrap items-center justify-end gap-1.5 sm:mr-2" />
          <TenantHeaderNav tenantSlug={tenant.slug} />
        </div>
      </header>

      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}

