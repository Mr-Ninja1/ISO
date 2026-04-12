import { OfflineLastReportClient } from "@/components/forms/OfflineLastReportClient";

export default async function OfflineLastReportPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <OfflineLastReportClient tenantSlug={tenantSlug} />;
}
