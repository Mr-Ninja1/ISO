"use client";

import { notFound, useSearchParams } from "next/navigation";
import { AuditRunClient } from "@/components/forms/AuditRunClient";

export function NewAuditPageClient({ tenantSlug }: { tenantSlug: string }) {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId") || "";
  const auditId = searchParams.get("auditId") || undefined;
  if (!templateId) notFound();

  return <AuditRunClient tenantSlug={tenantSlug} templateId={templateId} auditId={auditId} />;
}
