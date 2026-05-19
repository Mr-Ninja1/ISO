"use client";

import { useSearchParams } from "next/navigation";
import { DeferredDetailsSection } from "@/components/DeferredDetailsSection";
import { StaffManagementPanel } from "@/components/StaffManagementPanel";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";

export function TenantSettingsStaffSection({ tenantSlug: routeSlug }: { tenantSlug: string }) {
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const searchParams = useSearchParams();
  const focusStaff = searchParams.get("focus") === "staff";

  return (
    <DeferredDetailsSection title="Brand staff management" defaultOpen={focusStaff}>
      <StaffManagementPanel tenantSlug={tenantSlug} />
    </DeferredDetailsSection>
  );
}
