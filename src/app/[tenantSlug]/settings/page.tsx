import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TenantSettingsForm } from "@/components/TenantSettingsForm";
import { TenantCategoriesSeedSection } from "@/components/TenantCategoriesSeedSection";
import { TemplateManagementPanel } from "@/components/TemplateManagementPanel";
import { StaffManagementPanel } from "@/components/StaffManagementPanel";
import { DeferredDetailsSection } from "@/components/DeferredDetailsSection";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";

export default async function TenantSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  try {
    const { tenantSlug } = await params;
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) notFound();

    const [categories, templatesRaw] = await Promise.all([
      prisma.category.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.formTemplate.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ updatedAt: "desc" }],
        select: { id: true, title: true, categoryId: true, updatedAt: true },
      }),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c.name]));
    const templates = templatesRaw.map((t) => ({
      id: t.id,
      title: t.title,
      categoryId: t.categoryId,
      categoryName: t.categoryId ? (categoryById.get(t.categoryId) || "Uncategorized") : "Uncategorized",
      updatedAt: t.updatedAt.toISOString(),
    }));

    return (
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
          href={`/workspace?tenantSlug=${encodeURIComponent(tenant.slug)}`}
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
          <TenantSettingsForm tenant={tenant} />
        </DeferredDetailsSection>

        <DeferredDetailsSection title="Form management">
          <TemplateManagementPanel tenantSlug={tenant.slug} templates={templates} />
        </DeferredDetailsSection>

        <DeferredDetailsSection title="Category tools">
          <TenantCategoriesSeedSection tenantSlug={tenant.slug} />
        </DeferredDetailsSection>

        <DeferredDetailsSection title="Brand staff management">
          <StaffManagementPanel tenantSlug={tenant.slug} />
        </DeferredDetailsSection>
      </div>
    );
  } catch {
    return (
      <OfflineRouteBlock
        title="Settings need internet"
        message="Brand settings, staff, categories, and templates read from the database. Connect to the internet before opening this page so it can load safely and stay in sync."
        hint="This page is intentionally blocked offline to avoid slow DB calls and stale brand changes."
        backHref="/dashboard"
        backLabel="Back to lobby"
      />
    );
  }
}
