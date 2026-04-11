"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreVertical } from "lucide-react";

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
      <>
        <nav className="hidden items-center gap-2 text-sm sm:flex">
          <Link
            href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
            className="rounded-md border border-foreground/20 px-3 py-2"
          >
            Workspace
          </Link>
        </nav>
        <details className="relative sm:hidden">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-foreground/20">
            <MoreVertical className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 top-11 z-30 min-w-44 rounded-md border border-foreground/20 bg-background p-1 shadow-sm">
            <Link
              href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
              className="block rounded-md px-3 py-2 text-sm hover:bg-foreground/5"
            >
              Workspace
            </Link>
          </div>
        </details>
      </>
    );
  }

  return (
    <>
      <nav className="hidden items-center gap-2 text-sm sm:flex">
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

      <details className="relative sm:hidden">
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-foreground/20">
          <MoreVertical className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 top-11 z-30 min-w-44 rounded-md border border-foreground/20 bg-background p-1 shadow-sm">
          <Link
            href={settingsBase}
            className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onSettings && !onTemplates && !onCategories ? "bg-foreground text-background" : "")}
          >
            Settings
          </Link>
          <Link
            href={`/${tenantSlug}/categories`}
            className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onCategories ? "bg-foreground text-background" : "")}
          >
            Categories
          </Link>
          <Link
            href={`/${tenantSlug}/templates`}
            className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onTemplates ? "bg-foreground text-background" : "")}
          >
            Templates
          </Link>
          <Link
            href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
            className="mt-1 block rounded-md px-3 py-2 text-sm hover:bg-foreground/5"
          >
            Workspace
          </Link>
        </div>
      </details>
    </>
  );
}
