import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/PrintButton";

export default async function AuditReportPage({
  params,
}: {
  params: { tenantSlug: string; auditId: string };
}) {
  const { tenantSlug, auditId } = params;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) notFound();

  const audit = await prisma.auditLog.findFirst({
    where: { id: auditId, tenantId: tenant.id },
  });
  if (!audit) notFound();

  const template = await prisma.formTemplate.findFirst({
    where: { id: audit.templateId, tenantId: tenant.id },
    select: { title: true },
  });
  if (!template) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Report</h2>
          <p className="text-sm text-foreground/70">{template.title}</p>
        </div>

        <PrintButton />
      </div>

      <div className="rounded-md border border-foreground/20 p-4">
        <dl className="grid gap-3">
          {Object.entries(audit.payload as Record<string, unknown>).map(
            ([key, value]) => (
              <div key={key} className="grid gap-1">
                <dt className="text-sm font-medium">{key}</dt>
                <dd className="text-sm text-foreground/80">
                  {typeof value === "string" || typeof value === "number"
                    ? String(value)
                    : JSON.stringify(value)}
                </dd>
              </div>
            )
          )}
        </dl>
      </div>

      <Link className="text-sm underline" href={`/${tenantSlug}/templates`}>
        Back to templates
      </Link>
    </div>
  );
}
