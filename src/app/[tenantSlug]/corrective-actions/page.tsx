"use client";

import { use } from "react";
import { CorrectiveActionsClient } from "@/components/corrective-actions/CorrectiveActionsClient";

export default function CorrectiveActionsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return <CorrectiveActionsClient tenantSlug={tenantSlug} />;
}
