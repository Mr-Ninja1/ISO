import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TenantSettingsForm } from "@/components/TenantSettingsForm";
import { TenantCategoriesSeedSection } from "@/components/TenantCategoriesSeedSection";
import { TemplateManagementPanel } from "@/components/TemplateManagementPanel";
import { StaffManagementPanel } from "@/components/StaffManagementPanel";
import { isLiveTemplateSchema } from "@/lib/templateVersioning";

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

  const [categories, templatesRaw] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.formTemplate.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, title: true, categoryId: true, updatedAt: true, schema: true },
    }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const templates = templatesRaw
    .filter((t) => isLiveTemplateSchema(t.schema))
    .map((t) => ({
      id: t.id,
      title: t.title,
      categoryId: t.categoryId,
      categoryName: t.categoryId ? (categoryById.get(t.categoryId) || "Uncategorized") : "Uncategorized",
      updatedAt: t.updatedAt.toISOString(),
    }));

  return (
    <div className="flex flex-col gap-6">
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

      <details className="rounded-md border border-foreground/20 bg-background p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold">Brand profile</summary>
        <div className="mt-4">
          <TenantSettingsForm tenant={tenant} />
        </div>
      </details>

      <details className="rounded-md border border-foreground/20 bg-background p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold">Form management</summary>
        <div className="mt-4">
          <TemplateManagementPanel tenantSlug={tenant.slug} templates={templates} />
        </div>
      </details>

      <details className="rounded-md border border-foreground/20 bg-background p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold">Category tools</summary>
        <div className="mt-4">
          <TenantCategoriesSeedSection tenantSlug={tenant.slug} />
        </div>
      </details>

      <details className="rounded-md border border-foreground/20 bg-background p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold">Brand staff management</summary>
        <div className="mt-4">
          <StaffManagementPanel tenantSlug={tenant.slug} />
        </div>
      </details>
    </div>
  );
}
