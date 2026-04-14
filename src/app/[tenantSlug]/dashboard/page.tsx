import { TenantDashboardClient } from "@/components/dashboard/TenantDashboardClient";

export default async function TenantDashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <TenantDashboardClient tenantSlug={tenantSlug} />;
}