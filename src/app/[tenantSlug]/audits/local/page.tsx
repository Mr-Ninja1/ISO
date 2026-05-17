"use client";

import { use } from "react";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { LocalAuditsPageClient } from "@/components/forms/LocalAuditsPageClient";

export default function LocalAuditsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return (
    <SearchParamsBoundary>
      <LocalAuditsPageClient tenantSlug={tenantSlug} />
    </SearchParamsBoundary>
  );
}
