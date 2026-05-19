"use client";

import { use } from "react";
import { TenantDashboardClient } from "@/components/dashboard/TenantDashboardClient";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";

export default function TenantDashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug: routeSlug } = use(params);
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  return <TenantDashboardClient tenantSlug={tenantSlug} />;
}
