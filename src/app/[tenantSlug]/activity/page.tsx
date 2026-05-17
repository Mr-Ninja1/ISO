"use client";

import { use } from "react";
import { ActivityDashboardClient } from "@/components/activity/ActivityDashboardClient";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";

export default function ActivityPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return (
    <SearchParamsBoundary>
      <ActivityDashboardClient tenantSlug={tenantSlug} />
    </SearchParamsBoundary>
  );
}
