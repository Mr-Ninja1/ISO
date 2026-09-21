"use client";

import { useSearchParams } from "next/navigation";
import { OfflineSubmittedFormsClient } from "@/components/forms/OfflineSubmittedFormsClient";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";

export function LocalAuditsPageClient({ tenantSlug: routeSlug }: { tenantSlug: string }) {
  const searchParams = useSearchParams();
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const notice = searchParams.get("notice") || undefined;
  return <OfflineSubmittedFormsClient tenantSlug={tenantSlug} notice={notice} />;
}
