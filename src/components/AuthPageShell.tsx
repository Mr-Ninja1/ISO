"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck, Sparkles, HardDriveDownload, Layers3 } from "lucide-react";

type Props = {
  eyebrow: string;
  onEyebrowClick?: () => void;
  eyebrowTitle?: string;
  title: string;
  subtitle: string;
  formTitle: string;
  formSubtitle: string;
  children: ReactNode;
  footerText: string;
  footerHref: string;
  footerLabel: string;
};

export function AuthPageShell({
  eyebrow,
  onEyebrowClick,
  eyebrowTitle,
  title,
  subtitle,
  formTitle,
  formSubtitle,
  children,
  footerText,
  footerHref,
  footerLabel,
}: Props) {
  return (
    <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-blue-50/30 to-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04),0_20px_60px_rgb(0,0,0,0.06),0_40px_100px_rgb(0,0,0,0.08)] backdrop-blur-xl md:grid-cols-[1.05fr_0.95fr]">
        <section className="order-2 relative overflow-hidden border-t border-white/40 px-5 py-8 sm:px-10 md:order-1 md:border-b-0 md:border-r md:border-t-0 md:px-12 md:py-12">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.03),rgba(147,51,234,0.02),rgba(255,255,255,0))]" />
          <div className="absolute -right-20 top-12 h-56 w-56 rounded-full bg-gradient-to-br from-blue-400/20 via-purple-400/15 to-transparent blur-3xl" />
          <div className="absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-gradient-to-tr from-emerald-400/15 via-cyan-400/10 to-transparent blur-3xl" />

          <div className="relative flex h-full flex-col justify-between gap-6 md:gap-10">
            <div className="space-y-4 md:space-y-6">
              {onEyebrowClick ? (
                <button
                  type="button"
                  onClick={onEyebrowClick}
                  title={eyebrowTitle}
                  className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60 transition hover:border-foreground/20 hover:text-foreground/80"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {eyebrow}
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
                  <Sparkles className="h-3.5 w-3.5" />
                  {eyebrow}
                </div>
              )}

              <div className="max-w-xl space-y-3 md:space-y-4">
                <h1 className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-2xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">{title}</h1>
                <p className="max-w-lg text-sm leading-6 text-slate-600 sm:text-lg md:text-base md:leading-7">{subtitle}</p>
              </div>

              <div className="hidden gap-3 sm:grid sm:grid-cols-2">
                <FeatureCard icon={<ShieldCheck className="h-4 w-4" />} title="Audit-ready" text="Saved forms, evidence photos, and signatures stay organized." />
                <FeatureCard icon={<HardDriveDownload className="h-4 w-4" />} title="Offline-first" text="Workspace, schemas, and drafts cache locally for native-feeling use." />
                <FeatureCard icon={<Layers3 className="h-4 w-4" />} title="Structured" text="Templates, categories, and quick actions stay aligned across devices." />
                <FeatureCard icon={<Sparkles className="h-4 w-4" />} title="Fast sync" text="Background updates keep cross-device data current when online." />
              </div>

              <div className="grid gap-3 sm:hidden">
                <FeatureCard icon={<ShieldCheck className="h-4 w-4" />} title="Audit-ready" text="Saved forms, evidence, and signatures stay organized." />
                <FeatureCard icon={<HardDriveDownload className="h-4 w-4" />} title="Offline-first" text="Workspace and drafts cache locally for fast use." />
              </div>
            </div>

            <div className="grid max-w-xl gap-3 sm:grid-cols-3">
              <StatChip label="Cache-first" value="Workspace" />
              <StatChip label="Mobile ready" value="Tablet + PWA" />
              <StatChip label="Live sync" value="When online" />
            </div>
          </div>
        </section>

        <section className="order-1 flex items-center justify-center px-5 py-8 sm:px-10 md:order-2 md:px-12 md:py-12">
          <div className="w-full max-w-md">
            <div className="mb-5 space-y-2 md:mb-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{formTitle}</div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{formSubtitle}</h2>
            </div>

            <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-md backdrop-blur-sm sm:p-6">
              {children}
            </div>

            <p className="mt-4 text-center text-sm text-slate-700 md:mt-5">
              {footerText}{" "}
              <Link href={footerHref} className="font-semibold text-slate-900 underline underline-offset-4 hover:text-black">
                {footerLabel}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/50 p-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 sm:p-4">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/60 bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-600 shadow-sm">
        {icon}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-800">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-600">{text}</div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/50 px-4 py-3 shadow-sm transition-all hover:shadow-md">
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}