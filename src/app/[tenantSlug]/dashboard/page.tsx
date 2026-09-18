"use client";

import dynamic from "next/dynamic";
import { use } from "react";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";

const TenantDashboardClient = dynamic(
  () => import("@/components/dashboard/TenantDashboardClient").then((m) => m.TenantDashboardClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading dashboard">
        <div className="h-5 w-40 animate-pulse rounded bg-foreground/8" />
        <div className="h-4 w-56 max-w-[70vw] animate-pulse rounded bg-foreground/6" />
      </div>
    ),
  },
);

export default function TenantDashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug: routeSlug } = use(params);
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  return <TenantDashboardClient tenantSlug={tenantSlug} />;
}
