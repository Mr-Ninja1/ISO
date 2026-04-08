"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TenantHeaderNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const settingsBase = `/${tenantSlug}/settings`;
  const onSettings = pathname?.startsWith(settingsBase) ?? false;
  const onTemplates = pathname === `/${tenantSlug}/templates`;
  const onCategories = pathname === `/${tenantSlug}/categories`;

  // Hide global tenant nav on the custom form builder page to free header space.
  if (pathname === `/${tenantSlug}/templates/new`) {
    return null;
  }

  if (!onSettings) {
    return (
      <nav className="flex items-center gap-2 text-sm">
        <Link
          href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
          className="rounded-md border border-foreground/20 px-3 py-2"
        >
          Workspace
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link
        href={settingsBase}
        className={
          "rounded-md border px-3 py-2 " +
          (onSettings && !onTemplates && !onCategories
            ? "border-foreground bg-foreground text-background"
            : "border-foreground/20")
        }
      >
        Settings
      </Link>
      <Link
        href={`/${tenantSlug}/categories`}
        className={
          "rounded-md border px-3 py-2 " +
          (onCategories
            ? "border-foreground bg-foreground text-background"
            : "border-foreground/20")
        }
      >
        Categories
      </Link>
      <Link
        href={`/${tenantSlug}/templates`}
        className={
          "rounded-md border px-3 py-2 " +
          (onTemplates
            ? "border-foreground bg-foreground text-background"
            : "border-foreground/20")
        }
      >
        Templates
      </Link>
    </nav>
  );
}
