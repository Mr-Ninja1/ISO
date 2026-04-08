import { notFound } from "next/navigation";
import { AuditRunClient } from "@/components/forms/AuditRunClient";

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

  return <AuditRunClient tenantSlug={tenantSlug} templateId={templateId} />;
}
