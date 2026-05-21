"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

type Props = {
  userEmail?: string | null;
  onSignOut: () => void | Promise<void>;
  signingOut?: boolean;
};

export function AuthFlowHeader({ userEmail, onSignOut, signingOut }: Props) {
  return (
    <header className="auth-flow-header">
      <div className="auth-flow-header__inner">
        <Link href="/login" className="auth-flow-header__brand">
          <span className="auth-hse-badge__mark" aria-hidden>
            HSE
          </span>
          <span className="font-bold tracking-tight text-[var(--hse-charcoal)]">ISO Pro</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3" aria-label="Account">
          {userEmail ? (
            <span className="hidden max-w-[12rem] truncate text-xs text-[var(--accent-soft)] sm:inline">
              {userEmail}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_18%,transparent)] bg-white px-3 text-xs font-semibold text-[var(--hse-teal)] transition hover:bg-[var(--hse-sky)] disabled:opacity-60 sm:text-sm"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </div>
    </header>
  );
}
