import { notFound } from "next/navigation";
import { ssrTenantBySlug } from "@/lib/data/ssrQueries";
import { isSupabaseServiceRoleConfigured } from "@/lib/supabase/serviceRole";
import { TenantHeaderNav } from "@/components/tenant/TenantHeaderNav";
import { TenantBottomTabNav } from "@/components/tenant/TenantBottomTabNav";
import { BackgroundSyncManager } from "@/components/BackgroundSyncManager";
import { LoggedInStaffBadge } from "@/components/LoggedInStaffBadge";
import { TenantDeactivatedScreen } from "@/components/TenantDeactivatedScreen";
import { WorkspaceMessageInboxButton } from "@/components/messages/TenantMessageCenter";
import { TenantDueReminderWatcher } from "@/components/tenant/TenantDueReminderWatcher";
import { TenantLayoutClient } from "@/components/tenant/TenantLayoutClient";
import { capacitorTenantStaticParams } from "@/lib/capacitor/staticExport";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { PageWayfinder } from "@/components/PageWayfinder";

type TenantHeaderMeta = {
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive?: boolean;
  deactivationReason?: string | null;
};

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

export function generateStaticParams() {
  if (!isCapacitorBuild) return [];
  return capacitorTenantStaticParams();
}

function displayNameFromSlug(slug: string) {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Workspace";
  return cleaned
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

async function findTenantWithTimeout(tenantSlug: string, timeoutMs: number) {
  return Promise.race([
    ssrTenantBySlug(tenantSlug),
    new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error("Tenant lookup timed out")), timeoutMs);
    }),
  ]);
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  if (isCapacitorBuild) {
    return <TenantLayoutClient params={params}>{children}</TenantLayoutClient>;
  }

  const { tenantSlug } = await params;
  if (!tenantSlug) notFound();

  let tenant: TenantHeaderMeta | null = null;
  let dbUnavailable = false;

  try {
    const dbTenant = await findTenantWithTimeout(tenantSlug, 1200);
    if (dbTenant) {
      tenant = {
        name: dbTenant.name,
        slug: dbTenant.slug,
        logoUrl: dbTenant.logoUrl ?? null,
        isActive: dbTenant.isActive,
        deactivationReason: dbTenant.deactivationReason,
      };
    } else {
      dbUnavailable = true;
      tenant = {
        name: displayNameFromSlug(tenantSlug),
        slug: tenantSlug,
        logoUrl: null,
        isActive: true,
      };
    }
  } catch {
    dbUnavailable = true;
    tenant = {
      name: displayNameFromSlug(tenantSlug),
      slug: tenantSlug,
      logoUrl: null,
      isActive: true,
    };
  }

  if (tenant.isActive === false) {
    return <TenantDeactivatedScreen reason={tenant.deactivationReason} />;
  }

  return (
    <div className="tenant-shell min-h-dvh">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-6 print:max-w-none print:p-0">
        <header className="sticky top-0 z-20 overflow-visible rounded-2xl border border-border/80 bg-surface/95 shadow-lg backdrop-blur-xl print:hidden">
          <div className="ws-header-accent" />
          <div className="flex flex-wrap items-start justify-between gap-3 p-3 sm:items-center sm:gap-4 sm:p-4">
            <TenantLayoutHeader tenant={tenant} dbUnavailable={dbUnavailable} />
            <TenantLayoutHeaderActions tenantSlug={tenant.slug} />
          </div>
        </header>

        <main className="flex flex-col gap-6 rounded-2xl border border-border/70 bg-surface/90 p-4 pb-20 shadow-lg sm:p-5 sm:pb-5 print:rounded-none print:border-0 print:bg-white print:p-0 print:pb-0 print:shadow-none">
          {children}
        </main>
      </div>
      <TenantDueReminderWatcher tenantSlug={tenant.slug} />
      <div className="print:hidden">
        <TenantBottomTabNav tenantSlug={tenant.slug} />
      </div>
    </div>
  );
}

function TenantLayoutHeader({
  tenant,
  dbUnavailable,
}: {
  tenant: TenantHeaderMeta;
  dbUnavailable: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--hse-copper)_35%,var(--hse-teal))] bg-gradient-to-br from-[var(--hse-sky)] to-white shadow-sm">
        {tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-8 w-8 object-contain" />
        ) : (
          <span className="text-sm font-bold text-foreground">{tenant.name[0]}</span>
        )}
      </div>
      <div className="min-w-0 flex flex-col">
        <h1 className="truncate text-base font-bold text-foreground sm:text-lg">{tenant.name}</h1>
        <p className="text-sm text-foreground/60">
          /{tenant.slug}
          {dbUnavailable ? " (offline)" : ""}
        </p>
      </div>
      <PageWayfinder tenantSlug={tenant.slug} />
    </div>
  );
}

function TenantLayoutHeaderActions({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      <div
        id="tenant-header-actions"
        className="order-3 flex w-full flex-wrap items-center justify-end gap-1.5 sm:order-1 sm:mr-2 sm:w-auto"
      />
      <div className="hidden md:block">
        <LoggedInStaffBadge tenantSlug={tenantSlug} />
      </div>
      <div className="hidden md:block">
        <SearchParamsBoundary>
          <BackgroundSyncManager />
        </SearchParamsBoundary>
      </div>
      <WorkspaceMessageInboxButton />
      <TenantHeaderNav tenantSlug={tenantSlug} />
    </div>
  );
}
