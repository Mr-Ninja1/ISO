"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
};

const NAV: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    description: "Metrics & platform settings",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/brands",
    label: "Brands",
    description: "Oversight, alerts & access",
    icon: Building2,
  },
];

type Props = {
  children: ReactNode;
  userEmail: string;
  sessionHint?: string;
  onSignOut: () => void | Promise<void>;
  onDismissSessionHint?: () => void;
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`admin-console-nav-link${active ? " admin-console-nav-link--active" : ""}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block font-medium">{item.label}</span>
        <span className="block text-[11px] font-normal leading-snug opacity-70">{item.description}</span>
      </span>
    </Link>
  );
}

export function AdminConsoleShell({
  children,
  userEmail,
  sessionHint,
  onSignOut,
  onDismissSessionHint,
}: Props) {
  const pathname = usePathname();

  return (
    <div className="admin-console-shell min-h-dvh">
      <aside className="admin-console-sidebar" aria-label="Developer console navigation">
        <div className="admin-console-sidebar-brand">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            ISO Pro
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-white">Developer console</h1>
          <p className="mt-1 text-xs leading-relaxed text-white/65">
            Platform oversight for brands, native APK, and OTA releases.
          </p>
        </div>

        <nav className="admin-console-sidebar-nav">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>

        <div className="admin-console-sidebar-footer">
          <Link href="/workspace" className="admin-console-sidebar-link">
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            Workspace
          </Link>
        </div>
      </aside>

      <div className="admin-console-main">
        <nav className="admin-console-mobile-nav" aria-label="Developer console sections">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <header className="admin-console-topbar">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Signed in as</p>
            <p className="truncate text-sm font-semibold text-foreground">{userEmail || "Developer"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/workspace"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-foreground/12 bg-background px-3 text-xs font-medium text-foreground/80 transition hover:bg-foreground/[0.04] sm:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Workspace
            </Link>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-foreground/12 bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        </header>

        {sessionHint ? (
          <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6">
            <div className="flex gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="min-w-0">{sessionHint}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {onDismissSessionHint ? (
                <button
                  type="button"
                  onClick={onDismissSessionHint}
                  className="text-xs font-semibold underline underline-offset-2"
                >
                  Dismiss
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="text-xs font-semibold underline underline-offset-2"
              >
                Sign in again
              </button>
            </div>
          </div>
        ) : null}

        <div className="admin-console-content">{children}</div>
      </div>
    </div>
  );
}
