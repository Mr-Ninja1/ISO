import Link from "next/link";
import { notFound } from "next/navigation";
import { ssrAuditRowsForTenant, ssrTenantBySlug } from "@/lib/data/ssrQueries";
import { RefreshPageButton } from "@/components/RefreshPageButton";
import { AuditsListClient } from "@/components/forms/AuditsListClient";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { AdminBackButton } from "@/components/forms/AdminBackButton";

export default async function AuditsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: "DRAFT" | "SUBMITTED"; q?: string; notice?: string; auditId?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status, q, notice, auditId } = await searchParams;

  let tenant:
    | {
        id: string;
        slug: string;
        name: string;
      }
    | null = null;

  tenant = await ssrTenantBySlug(tenantSlug);

  if (!tenant) {
    if (!tenantSlug) notFound();

    return (
      <div className="flex flex-col gap-4">
        <FeatureSyncNotice
          title="Saved forms need a local cache"
          message="This device has not cached the saved forms for this brand yet, or the database is currently unreachable. Connect once to download the list, then it will stay available offline. To see fresh cross-device updates, the app needs internet to sync again."
          tone="warning"
        />
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          Open the workspace when you are back online. After the first sync, saved forms can be viewed offline from this device.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href={`/${tenantSlug}/audits/local`} className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm">
            Open offline queued forms
          </Link>
          <Link href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`} className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm">
            Back to workspace
          </Link>
        </div>
        <AuditsListClient
          tenantSlug={tenantSlug}
          initialStatus="ALL"
          initialQuery=""
          rows={[]}
        />
      </div>
    );
  }

  const hasExplicitStatus = status === "DRAFT" || status === "SUBMITTED";
  const normalizedStatus = hasExplicitStatus ? status : "ALL";
  const query = (q || "").trim();

  let rows: Array<{
    id: string;
    status: "DRAFT" | "SUBMITTED";
    templateId: string;
    createdAt: Date;
    updatedAt: Date;
    submittedAt: Date | null;
    template: { title: string };
  }> = [];

  rows = await ssrAuditRowsForTenant(tenant.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Stored forms</h2>
          <p className="text-sm text-foreground/70">Draft and submitted records across devices for {tenant.name}.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:items-center">
          <RefreshPageButton label="Pull to refresh" />
          <Link
            href={`/${tenant.slug}/audits/local`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
          >
            Offline queued
          </Link>
          <Link
            href={`/${tenant.slug}/audits/offline-last`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
          >
            Last offline report
          </Link>
          <AdminBackButton tenantSlug={tenant.slug} />
          <Link
            href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenant.slug)}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
          >
            Back to workspace
          </Link>
        </div>
      </div>

      {notice === "queued-submit" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Submission queued while offline. It will auto-sync when your connection is back.
        </div>
      ) : null}

      {notice === "submitted" ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Form submitted successfully.
          {auditId ? (
            <Link
              href={`/${tenant.slug}/audits/${encodeURIComponent(auditId)}`}
              className="ml-2 underline"
            >
              View report
            </Link>
          ) : null}
        </div>
      ) : null}

      <AuditsListClient
        tenantSlug={tenant.slug}
        initialStatus={normalizedStatus}
        initialQuery={query}
        rows={rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
