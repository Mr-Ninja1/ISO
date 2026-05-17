"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuditsListClient } from "@/components/forms/AuditsListClient";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";

export function AuditsPageCapacitor({ tenantSlug }: { tenantSlug: string }) {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const auditId = searchParams.get("auditId");

  return (
    <div className="flex flex-col gap-4">
      <FeatureSyncNotice
        title="Stored forms on this device"
        message="Draft and submitted records shown here use your local cache. Connect when you can to sync with other devices."
        tone="info"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href={`/${tenantSlug}/audits/local`}
          className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
        >
          Open offline queued forms
        </Link>
        <Link
          href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
          className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
        >
          Back to workspace
        </Link>
      </div>

      {notice === "queued-submit" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Submission queued while offline. It will auto-sync when your connection is back.
        </div>
      ) : null}

      {notice === "submitted" ? (
        <AuditsPageCapacitorSubmittedNotice tenantSlug={tenantSlug} auditId={auditId} />
      ) : null}

      <AuditsListClient tenantSlug={tenantSlug} initialStatus="ALL" initialQuery="" rows={[]} />
    </div>
  );
}

function AuditsPageCapacitorSubmittedNotice({
  tenantSlug,
  auditId,
}: {
  tenantSlug: string;
  auditId: string | null;
}) {
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
      Form submitted successfully.
      {auditId ? (
        <Link href={`/${tenantSlug}/audits/${encodeURIComponent(auditId)}`} className="ml-2 underline">
          View report
        </Link>
      ) : null}
    </div>
  );
}
