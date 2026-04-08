"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TenantHeaderNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();

  // Hide global tenant nav on the custom form builder page to free header space.
  if (pathname === `/${tenantSlug}/templates/new`) {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link
        href={`/${tenantSlug}/templates`}
        className="rounded-md border border-foreground/20 px-3 py-2"
      >
        Templates
      </Link>
      <Link
        href={`/${tenantSlug}/categories`}
        className="rounded-md border border-foreground/20 px-3 py-2"
      >
        Categories
      </Link>
      <Link
        href={`/${tenantSlug}/settings`}
        className="rounded-md border border-foreground/20 px-3 py-2"
      >
        Settings
      </Link>
    </nav>
  );
}
