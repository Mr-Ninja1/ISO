"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  onEyebrowClick?: () => void;
  eyebrowTitle?: string;
  title: string;
  subtitle: string;
  /** Optional identity block on the platform description panel (e.g. login HSE badge). */
  brandBadge?: ReactNode;
  /** Optional row above the form title (e.g. sign out, account). */
  formHeader?: ReactNode;
  formTitle: string;
  formSubtitle: string;
  children: ReactNode;
  footerText: string;
  footerHref: string;
  footerLabel: string;
};

const HSE_POINTS = [
  "Structured inspections and corrective actions",
  "Offline-capable for sites without signal",
  "One workspace per brand, audit-ready records",
] as const;

export function AuthPageShell({
  eyebrow,
  onEyebrowClick,
  eyebrowTitle,
  title,
  subtitle,
  brandBadge,
  formHeader,
  formTitle,
  formSubtitle,
  children,
  footerText,
  footerHref,
  footerLabel,
}: Props) {
  return (
    <main className="auth-shell min-h-dvh px-4 py-6 sm:px-6 lg:px-8">
      <div className="auth-shell-card mx-auto grid w-full max-w-5xl overflow-hidden md:min-h-[calc(100dvh-3rem)] md:grid-cols-[1fr_0.95fr]">
        <section className="auth-shell-brand relative order-1 border-b border-[color-mix(in_srgb,var(--hse-teal)_10%,transparent)] md:order-1 md:border-b-0 md:border-r">
          <div className="ws-header-accent absolute inset-x-0 top-0" />
          <div className="relative flex h-full flex-col justify-center px-6 py-10 sm:px-10 md:py-12">
            {onEyebrowClick ? (
              <button
                type="button"
                onClick={onEyebrowClick}
                title={eyebrowTitle}
                className="auth-eyebrow mb-4 w-fit text-left transition hover:text-[var(--hse-copper)]"
              >
                {eyebrow}
              </button>
            ) : (
              <p className="auth-eyebrow mb-4">{eyebrow}</p>
            )}

            {brandBadge ? <div className="mb-6 max-w-md">{brandBadge}</div> : null}

            {!brandBadge ? (
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--hse-teal-mid)]">
                Health, Safety &amp; Environment
              </p>
            ) : null}
            <h1
              className={`max-w-md text-2xl font-bold tracking-tight text-[var(--hse-charcoal)] text-balance sm:text-3xl ${brandBadge ? "" : "mt-2"}`}
            >
              {title}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-7 text-[var(--accent-soft)] sm:text-[15px]">{subtitle}</p>

            <ul className="mt-8 max-w-md space-y-2.5">
              {HSE_POINTS.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm text-[var(--accent-soft)]">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--hse-copper)]" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-shell-form order-2 flex items-center justify-center px-6 py-10 sm:px-10 md:order-2 md:py-12">
          <div className="w-full max-w-sm">
            {formHeader ? <div className="mb-5">{formHeader}</div> : null}
            <div className="mb-6 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hse-teal-mid)]">{formTitle}</p>
              <h2 className="text-lg font-semibold text-[var(--hse-charcoal)]">{formSubtitle}</h2>
            </div>

            <div className="auth-form-panel">{children}</div>

            <p className="mt-5 text-center text-sm text-[var(--accent-soft)]">
              {footerText}{" "}
              <Link href={footerHref} className="auth-link">
                {footerLabel}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
