"use client";

import dynamic from "next/dynamic";
import { use } from "react";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";

const ActivityDashboardClient = dynamic(
  () => import("@/components/activity/ActivityDashboardClient").then((m) => m.ActivityDashboardClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading activity">
        <div className="h-5 w-40 animate-pulse rounded bg-foreground/8" />
        <div className="h-4 w-56 max-w-[70vw] animate-pulse rounded bg-foreground/6" />
      </div>
    ),
  },
);

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
