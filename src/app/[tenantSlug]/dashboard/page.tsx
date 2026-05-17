"use client";

import { use } from "react";
import { TenantDashboardClient } from "@/components/dashboard/TenantDashboardClient";

export default function TenantDashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return <TenantDashboardClient tenantSlug={tenantSlug} />;
}
