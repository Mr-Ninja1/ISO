"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import { auditReportHref } from "@/lib/client/tenantNavigation";

const AuditsListClient = dynamic(
  () => import("@/components/forms/AuditsListClient").then((m) => m.AuditsListClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading stored forms">
        <div className="h-5 w-40 animate-pulse rounded bg-foreground/8" />
        <div className="h-4 w-56 max-w-[70vw] animate-pulse rounded bg-foreground/6" />
      </div>
    ),
  },
);

export function AuditsPageClient({
  tenantSlug: routeSlug,
}: {
  tenantSlug: string;
}) {
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const auditId = searchParams.get("auditId");
  const q = (searchParams.get("q") || "").trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-foreground/10 bg-background/90 p-4 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold">Stored forms</h2>
          <p className="text-sm text-foreground/70">
            Review submitted forms and share them cleanly without exporting
            bulky PDFs.
          </p>
        </div>
      </div>

      {notice === "queued-submit" ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Submission queued while offline. It will auto-sync when your
          connection is back.
        </div>
      ) : null}

      {notice === "submitted" ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Form submitted successfully.
          {auditId ? (
            <Link
              href={auditReportHref(tenantSlug, auditId)}
              className="ml-2 underline"
            >
              View report
            </Link>
          ) : null}
        </div>
      ) : null}

      <AuditsListClient tenantSlug={tenantSlug} initialQuery={q} rows={[]} />
    </div>
  );
}
