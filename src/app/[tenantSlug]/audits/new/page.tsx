import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { FormSchemaV1 } from "@/types/forms";
import { FormRenderer } from "@/components/forms/FormRenderer";

export default async function NewAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ templateId?: string }>;
}) {
  const { tenantSlug } = await params;
  const { templateId } = await searchParams;
  if (!templateId) notFound();

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) notFound();

  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, tenantId: tenant.id },
    select: { id: true, title: true, schema: true },
  });
  if (!template) notFound();

  const schema = template.schema as FormSchemaV1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{template.title}</h2>
        <p className="text-sm text-foreground/70">Complete the form and submit.</p>
      </div>

      <FormRenderer
        tenantSlug={tenantSlug}
        tenantName={tenant.name}
        tenantLogoUrl={tenant.logoUrl}
        templateId={template.id}
        schema={schema}
      />
    </div>
  );
}
