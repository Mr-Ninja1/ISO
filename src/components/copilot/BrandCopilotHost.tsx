"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { readWorkspaceCacheResolved } from "@/lib/client/workspaceCache";
import { shouldShowBrandCopilot } from "@/lib/copilot/visibility";

const BrandCopilot = dynamic(
  () => import("@/components/copilot/BrandCopilot").then((m) => m.BrandCopilot),
  { ssr: false },
);

export function BrandCopilotHost({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname() || "/";
  const offline = useAppOffline();
  const { user, session } = useAuth();
  const userId = user?.id || session?.user?.id || null;
  const cached = tenantSlug ? readWorkspaceCacheResolved(userId, tenantSlug, null) : null;
  const brandName = cached?.tenant?.name;

  if (!tenantSlug || !shouldShowBrandCopilot(pathname, offline)) return null;

  return <BrandCopilot tenantSlug={tenantSlug} brandName={brandName} />;
}
