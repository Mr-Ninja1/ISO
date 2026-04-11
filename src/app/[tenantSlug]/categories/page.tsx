import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CategoriesManager } from "@/components/CategoriesManager";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      categories: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
  });

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
