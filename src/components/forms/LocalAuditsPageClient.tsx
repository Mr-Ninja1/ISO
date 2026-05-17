"use client";

import { useSearchParams } from "next/navigation";
import { OfflineSubmittedFormsClient } from "@/components/forms/OfflineSubmittedFormsClient";

export function LocalAuditsPageClient({ tenantSlug }: { tenantSlug: string }) {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice") || undefined;
  return <OfflineSubmittedFormsClient tenantSlug={tenantSlug} notice={notice} />;
}
