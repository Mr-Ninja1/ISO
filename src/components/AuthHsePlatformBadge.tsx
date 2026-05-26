"use client";

import { PRODUCT_NAME } from "@/lib/branding";

export function AuthHsePlatformBadge() {
  return (
    <div className="auth-hse-badge" role="presentation">
      <div className="auth-hse-badge__brand">
        <span className="auth-hse-badge__mark" aria-hidden>
          HSE
        </span>
        <span>{PRODUCT_NAME}</span>
      </div>
      <p className="auth-hse-badge__tagline">Health, Safety &amp; Environment platform</p>
      <p className="text-xs leading-5 text-[var(--accent-soft)]">
        Inspections, evidence, and corrective actions — built for teams in the field.
      </p>
    </div>
  );
}
