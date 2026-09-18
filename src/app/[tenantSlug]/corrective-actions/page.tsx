"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const CorrectiveActionsClient = dynamic(
  () =>
    import("@/components/corrective-actions/CorrectiveActionsClient").then(
      (m) => m.CorrectiveActionsClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading corrective actions">
        <div className="h-5 w-40 animate-pulse rounded bg-foreground/8" />
        <div className="h-4 w-56 max-w-[70vw] animate-pulse rounded bg-foreground/6" />
      </div>
    ),
  },
);

export default function CorrectiveActionsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  return <CorrectiveActionsClient tenantSlug={tenantSlug} />;
}
