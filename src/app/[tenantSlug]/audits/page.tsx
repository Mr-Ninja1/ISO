import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { AuditsPageClient } from "@/components/forms/AuditsPageClient";

export default async function AuditsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<{
    status?: "DRAFT" | "SUBMITTED";
    q?: string;
    notice?: string;
    auditId?: string;
  }>;
}) {
  const { tenantSlug } = await params;

  return (
    <SearchParamsBoundary>
      <AuditsPageClient tenantSlug={tenantSlug} />
    </SearchParamsBoundary>
  );
}
