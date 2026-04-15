import { CorrectiveActionsClient } from "@/components/corrective-actions/CorrectiveActionsClient";

export default async function CorrectiveActionsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <CorrectiveActionsClient tenantSlug={tenantSlug} />;
}
