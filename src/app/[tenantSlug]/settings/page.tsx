import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TenantSettingsForm } from "@/components/TenantSettingsForm";
import { TenantCategoriesSeedSection } from "@/components/TenantCategoriesSeedSection";

export default async function TenantSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Brand Settings</h2>
          <p className="text-sm text-foreground/70">Manage your brand details</p>
        </div>

        <Link
          className="text-sm underline"
          href={`/workspace?tenantSlug=${encodeURIComponent(tenant.slug)}`}
        >
          Back to workspace
        </Link>
      </div>

      <TenantSettingsForm tenant={tenant} />

      <TenantCategoriesSeedSection tenantSlug={tenant.slug} />
    </div>
  );
}
