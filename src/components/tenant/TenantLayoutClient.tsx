"use client";

import { use } from "react";
import { TenantHeaderNav } from "@/components/tenant/TenantHeaderNav";
import { TenantBottomTabNav } from "@/components/tenant/TenantBottomTabNav";
import { BackgroundSyncManager } from "@/components/BackgroundSyncManager";
import { LoggedInStaffBadge } from "@/components/LoggedInStaffBadge";
import { WorkspaceMessageInboxButton } from "@/components/messages/TenantMessageCenter";
import { TenantDueReminderWatcher } from "@/components/tenant/TenantDueReminderWatcher";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { PageWayfinder } from "@/components/PageWayfinder";
import { BrandCopilotHost } from "@/components/copilot/BrandCopilotHost";
import { CopilotHeaderButton } from "@/components/copilot/CopilotHeaderButton";
import { TenantDeactivatedScreen } from "@/components/TenantDeactivatedScreen";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import { readWorkspaceCacheResolved } from "@/lib/client/workspaceCache";
import {
  getTenantDeactivationBrandName,
  getTenantDeactivationReason,
  isTenantDeactivatedBlocked,
} from "@/lib/client/brandAccess";
import { useAuth } from "@/components/AuthProvider";

function displayNameFromSlug(slug: string) {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Workspace";
  return cleaned
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

export function TenantLayoutClient({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug: routeSlug } = use(params);
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const { user, session } = useAuth();
  const userId = user?.id || session?.user?.id || null;
  const cached = tenantSlug ? readWorkspaceCacheResolved(userId, tenantSlug, null) : null;
  const name = cached?.tenant?.name || displayNameFromSlug(tenantSlug);

  if (tenantSlug && isTenantDeactivatedBlocked(tenantSlug)) {
    return (
      <TenantDeactivatedScreen
        tenantSlug={tenantSlug}
        brandName={getTenantDeactivationBrandName(tenantSlug) || name}
        reason={getTenantDeactivationReason(tenantSlug)}
      />
    );
  }

  return (
    <div className="tenant-shell">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-6 print:max-w-none print:p-0">
        <header className="sticky top-0 z-20 overflow-visible rounded-2xl border border-border/80 bg-surface/95 shadow-lg backdrop-blur-xl print:hidden">
          <div className="ws-header-accent" />
          <div className="flex flex-wrap items-start justify-between gap-3 p-3 sm:items-center sm:gap-4 sm:p-4">
            <TenantLayoutClientHeader tenantSlug={tenantSlug} name={name} />
            <TenantLayoutClientHeaderActions tenantSlug={tenantSlug} />
          </div>
        </header>

        <main className="flex flex-col gap-6 rounded-2xl border border-border/70 bg-surface/90 p-4 pb-20 shadow-lg backdrop-blur-sm sm:p-5 sm:pb-5 print:rounded-none print:border-0 print:bg-white print:p-0 print:pb-0 print:shadow-none">
          {children}
        </main>
      </div>
      <TenantDueReminderWatcher tenantSlug={tenantSlug} />
      <BrandCopilotHost tenantSlug={tenantSlug} />
      <TenantLayoutClientBottomNav tenantSlug={tenantSlug} />
    </div>
  );
}

function TenantLayoutClientHeader({ tenantSlug, name }: { tenantSlug: string; name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--hse-copper)_35%,var(--hse-teal))] bg-gradient-to-br from-[var(--hse-sky)] to-white shadow-sm">
        <span className="text-sm font-bold text-[var(--hse-teal)]">{name[0]}</span>
      </div>
      <div className="min-w-0 flex flex-col">
        <h1 className="truncate text-base font-bold text-[var(--hse-charcoal)] sm:text-lg">{name}</h1>
        <p className="text-sm text-[var(--hse-teal-mid)]">/{tenantSlug}</p>
      </div>
      <PageWayfinder tenantSlug={tenantSlug} />
    </div>
  );
}

function TenantLayoutClientHeaderActions({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      <div
        id="tenant-header-actions"
        className="order-3 flex w-full flex-wrap items-center justify-end gap-1.5 sm:order-1 sm:mr-2 sm:w-auto"
      />
      <div className="hidden sm:block">
        <CopilotHeaderButton />
      </div>
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

function TenantLayoutClientBottomNav({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="print:hidden">
      <TenantBottomTabNav tenantSlug={tenantSlug} />
    </div>
  );
}
