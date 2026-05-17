"use client";

import Link from "next/link";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";

export function CapacitorOfflineAdminGate({
  tenantSlug,
  title,
  message,
}: {
  tenantSlug: string;
  title: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FeatureSyncNotice
        title={title}
        message={
          message ||
          "This area needs a live connection for full admin features. Your forms workspace and saved audits stay available offline from the workspace."
        }
        tone="info"
      />
      <Link
        href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
        className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-foreground/20 px-4 text-sm"
      >
        Back to workspace
      </Link>
    </div>
  );
}
