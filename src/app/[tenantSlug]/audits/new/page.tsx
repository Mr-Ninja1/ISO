"use client";

import { use } from "react";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { NewAuditPageClient } from "@/components/forms/NewAuditPageClient";

export default function NewAuditPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return (
    <SearchParamsBoundary>
      <NewAuditPageClient tenantSlug={tenantSlug} />
    </SearchParamsBoundary>
  );
}
