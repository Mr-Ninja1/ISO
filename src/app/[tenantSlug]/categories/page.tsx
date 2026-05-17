import { notFound } from "next/navigation";
import Link from "next/link";
import { ssrTenantWithCategories } from "@/lib/data/ssrQueries";
import { CategoriesManager } from "@/components/CategoriesManager";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  if (isCapacitorBuild) {
    const { CapacitorOfflineAdminGate } = await import("@/components/capacitor/CapacitorOfflineAdminGate");
    return <CapacitorOfflineAdminGate tenantSlug={tenantSlug} title="Categories admin needs internet" />;
  }
  const tenant = await ssrTenantWithCategories(tenantSlug);

  if (!tenant) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Form Categories</h2>
          <p className="text-sm text-foreground/70">Organize your audit forms by category</p>
        </div>

        <Link
          className="text-sm underline sm:text-right"
          href={`/${tenant.slug}/templates`}
        >
          Back to templates
        </Link>
      </div>

      <CategoriesManager tenant={tenant} />
    </div>
  );
}
