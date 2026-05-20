import { capacitorAuditStaticParams } from "@/lib/capacitor/staticExport";
import { AuditReportPageClient } from "@/components/forms/AuditReportPageClient";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

export function generateStaticParams() {
  if (!isCapacitorBuild) return [];
  return capacitorAuditStaticParams();
}

/** Always client-loaded (bearer + /api/audit/report) — reliable on Azure; matches native app. */
export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; auditId: string }>;
}) {
  const { tenantSlug, auditId } = await params;
  return <AuditReportPageClient routeSlug={tenantSlug} routeAuditId={auditId} />;
}
