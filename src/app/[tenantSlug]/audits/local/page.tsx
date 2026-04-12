import { OfflineSubmittedFormsClient } from "@/components/forms/OfflineSubmittedFormsClient";

export default async function LocalAuditsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { tenantSlug } = await params;
  const { notice } = await searchParams;

  return <OfflineSubmittedFormsClient tenantSlug={tenantSlug} notice={notice} />;
}
