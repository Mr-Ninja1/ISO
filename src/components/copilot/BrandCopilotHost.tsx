"use client";

import { BrandCopilot } from "@/components/copilot/BrandCopilot";
import { useAuth } from "@/components/AuthProvider";
import { readWorkspaceCacheResolved } from "@/lib/client/workspaceCache";

export function BrandCopilotHost({ tenantSlug }: { tenantSlug: string }) {
  const { user, session } = useAuth();
  const userId = user?.id || session?.user?.id || null;
  const cached = tenantSlug ? readWorkspaceCacheResolved(userId, tenantSlug, null) : null;
  const brandName = cached?.tenant?.name;

  if (!tenantSlug) return null;

  return <BrandCopilot tenantSlug={tenantSlug} brandName={brandName} />;
}
