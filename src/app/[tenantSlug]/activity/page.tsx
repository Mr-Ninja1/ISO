"use client";

"use client";

import { use } from "react";
import { ActivityDashboardClient } from "@/components/activity/ActivityDashboardClient";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";

function ActivityPageInner({ routeSlug }: { routeSlug: string }) {
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  return <ActivityDashboardClient tenantSlug={tenantSlug} />;
}

export default function ActivityPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return (
    <SearchParamsBoundary>
      <ActivityPageInner routeSlug={tenantSlug} />
    </SearchParamsBoundary>
  );
}
