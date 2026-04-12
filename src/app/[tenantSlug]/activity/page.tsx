import { ActivityDashboardClient } from "@/components/activity/ActivityDashboardClient";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  return <ActivityDashboardClient tenantSlug={tenantSlug} />;
}
