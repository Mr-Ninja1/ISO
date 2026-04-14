"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck, Sparkles, HardDriveDownload, Layers3 } from "lucide-react";

type Props = {
  eyebrow: string;
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
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(244,246,248,0.96)_32%,_rgba(226,232,240,0.9)_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-foreground/10 bg-background/80 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden border-b border-foreground/10 px-6 py-10 sm:px-10 md:border-b-0 md:border-r md:px-12 md:py-12">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(15,23,42,0.04),rgba(255,255,255,0))]" />
          <div className="absolute -right-16 top-10 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute -bottom-16 left-0 h-44 w-44 rounded-full bg-slate-400/15 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </div>

              <div className="max-w-xl space-y-4">
                <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">{title}</h1>
                <p className="max-w-lg text-base leading-7 text-foreground/70 sm:text-lg">{subtitle}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FeatureCard icon={<ShieldCheck className="h-4 w-4" />} title="Audit-ready" text="Saved forms, evidence photos, and signatures stay organized." />
                <FeatureCard icon={<HardDriveDownload className="h-4 w-4" />} title="Offline-first" text="Workspace, schemas, and drafts cache locally for native-feeling use." />
                <FeatureCard icon={<Layers3 className="h-4 w-4" />} title="Structured" text="Templates, categories, and quick actions stay aligned across devices." />
                <FeatureCard icon={<Sparkles className="h-4 w-4" />} title="Fast sync" text="Background updates keep cross-device data current when online." />
              </div>
            </div>

            <div className="grid max-w-xl gap-3 sm:grid-cols-3">
              <StatChip label="Cache-first" value="Workspace" />
              <StatChip label="Mobile ready" value="Tablet + PWA" />
              <StatChip label="Live sync" value="When online" />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10 md:px-12 md:py-12">
          <div className="w-full max-w-md">
            <div className="mb-6 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/55">{formTitle}</div>
              <h2 className="text-2xl font-semibold tracking-tight">{formSubtitle}</h2>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-background p-5 shadow-sm sm:p-6">
              {children}
            </div>

            <p className="mt-5 text-center text-sm text-foreground/65">
              {footerText} <Link href={footerHref} className="font-medium underline underline-offset-4">{footerLabel}</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-background/75 p-4 shadow-sm">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] text-foreground/70">
        {icon}
      </div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm leading-6 text-foreground/65">{text}</div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-background/80 px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.16em] text-foreground/50">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}