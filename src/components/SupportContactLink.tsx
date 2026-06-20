"use client";

import { Mail } from "lucide-react";
import { buildGeneralSupportMailto, hasSupportEmailConfigured } from "@/lib/supportContact";

type Props = {
  className?: string;
  label?: string;
  tenantSlug?: string;
  brandName?: string;
  onNavigate?: () => void;
};

export function SupportContactLink({
  className = "",
  label = "Contact support",
  tenantSlug,
  brandName,
  onNavigate,
}: Props) {
  const href = buildGeneralSupportMailto({ tenantSlug, brandName });

  return (
    <a
      href={href}
      className={
        "inline-flex items-center gap-2 text-sm font-medium text-[var(--hse-teal)] hover:underline " +
        className
      }
      onClick={() => onNavigate?.()}
      title={hasSupportEmailConfigured() ? "Email platform support" : "Open email to contact support"}
    >
      <Mail className="h-4 w-4 shrink-0" />
      {label}
    </a>
  );
}

/** For dropdown menus — matches workspace menu item styling */
export function SupportContactMenuItem({
  tenantSlug,
  brandName,
  onClose,
}: {
  tenantSlug?: string;
  brandName?: string;
  onClose?: () => void;
}) {
  const href = buildGeneralSupportMailto({ tenantSlug, brandName });

  return (
    <a
      href={href}
      role="menuitem"
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
      onClick={() => onClose?.()}
    >
      <Mail className="h-4 w-4" />
      Contact support
    </a>
  );
}
