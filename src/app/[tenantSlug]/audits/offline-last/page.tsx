"use client";

import { use } from "react";
import { OfflineLastReportClient } from "@/components/forms/OfflineLastReportClient";

export default function OfflineLastReportPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return <OfflineLastReportClient tenantSlug={tenantSlug} />;
}
