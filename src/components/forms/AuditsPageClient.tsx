"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuditsListClient } from "@/components/forms/AuditsListClient";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { RefreshPageButton } from "@/components/RefreshPageButton";
import { AdminBackButton } from "@/components/forms/AdminBackButton";

export function AuditsPageClient({ tenantSlug: routeSlug }: { tenantSlug: string }) {
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const auditId = searchParams.get("auditId");
  const q = (searchParams.get("q") || "").trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Stored forms</h2>
          <p className="text-sm text-foreground/70">
            Recent submitted forms load automatically when online, including forms you submitted on this device.
            Use Load more for older history.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:items-center">
          <RefreshPageButton label="Pull to refresh" />
          <Link
            href={`/${tenantSlug}/audits/local`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
          >
            Offline queued
          </Link>
          <Link
            href={`/${tenantSlug}/audits/offline-last`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
          >
            Last offline report
          </Link>
          <AdminBackButton tenantSlug={tenantSlug} />
          <Link
            href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
          >
            Back to workspace
          </Link>
        </div>
      </div>

      <FeatureSyncNotice
        title="Saved forms"
        message="The first 50 recent submitted forms load when you open this page. Forms you submit on this device appear here too. Tap Load more for older history."
        tone="info"
      />

      {notice === "queued-submit" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Submission queued while offline. It will auto-sync when your connection is back.
        </div>
      ) : null}

      {notice === "submitted" ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Form submitted successfully.
          {auditId ? (
            <Link href={`/${tenantSlug}/audits/${encodeURIComponent(auditId)}`} className="ml-2 underline">
              View report
            </Link>
          ) : null}
        </div>
      ) : null}

      <AuditsListClient tenantSlug={tenantSlug} initialQuery={q} rows={[]} />
    </div>
  );
}
