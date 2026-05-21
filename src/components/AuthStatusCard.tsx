"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Mail, ShieldAlert } from "lucide-react";

type Variant = "success" | "info" | "warning";

const VARIANT_STYLES: Record<
  Variant,
  { border: string; bg: string; title: string; body: string; icon: string }
> = {
  success: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    title: "text-emerald-950",
    body: "text-emerald-800",
    icon: "text-emerald-600",
  },
  info: {
    border: "border-sky-200",
    bg: "bg-sky-50",
    title: "text-sky-950",
    body: "text-sky-800",
    icon: "text-sky-600",
  },
  warning: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    title: "text-amber-950",
    body: "text-amber-800",
    icon: "text-amber-600",
  },
};

type Props = {
  variant?: Variant;
  title: string;
  children: ReactNode;
  icon?: "mail" | "success" | "shield";
};

export function AuthStatusCard({ variant = "info", title, children, icon = "mail" }: Props) {
  const styles = VARIANT_STYLES[variant];
  const Icon =
    icon === "success" ? CheckCircle2 : icon === "shield" ? ShieldAlert : Mail;

  return (
    <div className={`rounded-2xl border p-5 ${styles.border} ${styles.bg}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${styles.icon}`} aria-hidden />
        <div className="min-w-0">
          <h3 className={`text-base font-bold leading-snug ${styles.title}`}>{title}</h3>
          <div className={`mt-2 text-sm leading-6 ${styles.body}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
