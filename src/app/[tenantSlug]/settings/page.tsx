import { notFound } from "next/navigation";
import Link from "next/link";
import { ssrCategoriesForTenant, ssrTenantBySlug, ssrTemplatesForTenant } from "@/lib/data/ssrQueries";
import { TenantSettingsForm } from "@/components/TenantSettingsForm";
import { TenantCategoriesSeedSection } from "@/components/TenantCategoriesSeedSection";
import { TemplateManagementPanel } from "@/components/TemplateManagementPanel";
import { DeferredDetailsSection } from "@/components/DeferredDetailsSection";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { RouteOfflineGate } from "@/components/RouteOfflineGate";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { TenantSettingsStaffSection } from "@/components/TenantSettingsStaffSection";
import { SettingsPageClient } from "@/components/settings/SettingsPageClient";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

export default async function TenantSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  if (isCapacitorBuild) {
    return <SettingsPageClient routeSlug={tenantSlug} />;
  }

  try {
    const tenant = await ssrTenantBySlug(tenantSlug);

    if (!tenant) notFound();

    const [categories, templatesRaw] = await Promise.all([
      ssrCategoriesForTenant(tenant.id),
      ssrTemplatesForTenant(tenant.id),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c.name]));
    const templates = templatesRaw.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      title: t.title as string,
      categoryId: (t.category_id as string | null) ?? null,
      categoryName: t.category_id ? categoryById.get(t.category_id as string) || "Uncategorized" : "Uncategorized",
      updatedAt: new Date(t.updated_at as string).toISOString(),
    }));

    return (
      <RouteOfflineGate
        title="Settings needs internet"
        message="Brand settings, staff, categories, and template management are live-sync features. Open this page online so the route can load and keep its data cached for later offline use."
        hint="The individual controls stay blocked offline so changes cannot drift out of sync."
        backHref={`/workspace/forms?tenantSlug=${encodeURIComponent(tenant.slug)}`}
        backLabel="Back to workspace"
      >
        <div className="flex flex-col gap-6">
          <FeatureSyncNotice
            title="Live database sync"
            message="Brand settings, staff, categories, and template management are live-sync features. They can show cached data while offline, but changes need internet so they can update the database and stay in sync across devices."
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Brand Settings</h2>
              <p className="text-sm text-foreground/70">Manage your brand details</p>
            </div>

            <Link
              className="text-sm underline sm:text-right"
              href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenant.slug)}`}
            >
              Back to workspace
            </Link>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-foreground/20 bg-background p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href={`/${tenant.slug}/templates/new`}
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5 sm:w-auto"
            >
              Create custom form
            </Link>
            <Link
              href={`/${tenant.slug}/templates/library`}
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5 sm:w-auto"
            >
              Import from library
            </Link>
          </div>

          <DeferredDetailsSection title="Brand profile" defaultOpen>
            <TenantSettingsForm tenant={tenant} tenantSlug={tenant.slug} />
          </DeferredDetailsSection>

          <DeferredDetailsSection title="Form management">
            <TemplateManagementPanel tenantSlug={tenant.slug} templates={templates} />
          </DeferredDetailsSection>

          <DeferredDetailsSection title="Category tools">
            <TenantCategoriesSeedSection tenantSlug={tenant.slug} />
          </DeferredDetailsSection>

          <SearchParamsBoundary>
            <TenantSettingsStaffSection tenantSlug={tenant.slug} />
          </SearchParamsBoundary>
        </div>
      </RouteOfflineGate>
    );
  } catch {
    return <SettingsPageClient routeSlug={tenantSlug} />;
  }
}
