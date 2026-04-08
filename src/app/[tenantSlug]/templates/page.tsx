import Link from "next/link";
import type { Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    return <div>Tenant not found</div>;
  }

  const categories: Category[] = await prisma.category.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const templates = await prisma.formTemplate.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ updatedAt: "desc" }],
  });

  const templatesByCategoryId = new Map<string, typeof templates>();
  for (const template of templates) {
    const key = template.categoryId ?? "uncategorized";
    templatesByCategoryId.set(key, [
      ...(templatesByCategoryId.get(key) ?? []),
      template,
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Templates</h2>
        <span className="text-sm text-foreground/70">
          Seeded demo templates are ready
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {categories.map((cat) => (
          <section key={cat.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground/80">{cat.name}</h3>
            <div className="grid gap-2">
              {(templatesByCategoryId.get(cat.id) ?? []).map((t) => (
                <Link
                  key={t.id}
                  className="rounded-md border border-foreground/20 p-4"
                  href={`/${tenantSlug}/audits/new?templateId=${t.id}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium">{t.title}</div>
                    <span className="text-sm text-foreground/70">Run</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {(templatesByCategoryId.get("uncategorized") ?? []).length ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground/80">
              Uncategorized
            </h3>
            <div className="grid gap-2">
              {(templatesByCategoryId.get("uncategorized") ?? []).map((t) => (
                <Link
                  key={t.id}
                  className="rounded-md border border-foreground/20 p-4"
                  href={`/${tenantSlug}/audits/new?templateId=${t.id}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium">{t.title}</div>
                    <span className="text-sm text-foreground/70">Run</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

