import Link from "next/link";
import { ssrTenantBySlug } from "@/lib/data/ssrQueries";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { isLiveTemplateSchema } from "@/lib/templateVersioning";

type CategoryRow = { id: string; name: string; sortOrder: number };
type TemplateRow = {
  id: string;
  title: string;
  categoryId: string | null;
  schema: unknown;
  updatedAt: string;
};

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  if (isCapacitorBuild) {
    const { CapacitorOfflineAdminGate } = await import("@/components/capacitor/CapacitorOfflineAdminGate");
    return <CapacitorOfflineAdminGate tenantSlug={tenantSlug} title="Template admin needs internet" />;
  }
  const tenant = await ssrTenantBySlug(tenantSlug);
  if (!tenant) {
    return <div>Tenant not found</div>;
  }

  const svc = createServiceRoleSupabase();
  if (!svc) {
    return <div className="p-4 text-sm text-foreground/70">Server configuration incomplete (SUPABASE_SERVICE_ROLE_KEY).</div>;
  }

  const { data: catRows } = await svc
    .from("categories")
    .select("id, name, sort_order")
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const categories: CategoryRow[] = (catRows || []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    sortOrder: Number(c.sort_order ?? 0),
  }));

  const { data: tplRows } = await svc
    .from("form_templates")
    .select("id, title, category_id, schema, updated_at")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  const templates: TemplateRow[] = (tplRows || [])
    .filter((t) => isLiveTemplateSchema(t.schema))
    .map((t) => ({
      id: t.id as string,
      title: t.title as string,
      categoryId: (t.category_id as string | null) ?? null,
      schema: t.schema,
      updatedAt: t.updated_at as string,
    }));

  const templatesByCategoryId = new Map<string, typeof templates>();
  for (const template of templates) {
    const key = template.categoryId ?? "uncategorized";
    templatesByCategoryId.set(key, [...(templatesByCategoryId.get(key) ?? []), template]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-xl font-semibold">Templates</h2>
        <span className="text-sm text-foreground/70 sm:text-right">Seeded demo templates are ready</span>
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
            <h3 className="text-sm font-semibold text-foreground/80">Uncategorized</h3>
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
