"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, TabletSmartphone } from "lucide-react";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return <AppLoadingScreen title="Loading" subtitle="Preparing your workspace..." />;
  }

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(244,246,248,0.98)_28%,_rgba(226,232,240,0.94)_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-foreground/10 bg-background/80 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative overflow-hidden px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(15,23,42,0.04),rgba(255,255,255,0))]" />
          <div className="absolute -right-16 top-16 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute -bottom-20 left-0 h-52 w-52 rounded-full bg-slate-400/15 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
                <Sparkles className="h-3.5 w-3.5" />
                ISO-ready compliance PWA
              </div>

              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                  A production-grade audit platform for service brands that work to ISO standards.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-foreground/70 sm:text-lg">
                  Cache your workspace, forms, drafts, evidence, and audit history locally, then sync cross-device updates when internet is available.
                  Designed for teams that need speed, reliability, and offline confidence across any ISO-led operation.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 font-medium text-background shadow-sm transition hover:translate-y-[-1px]"
                  href="/signup"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-full border border-foreground/15 px-6 font-medium transition hover:bg-foreground/5"
                  href="/login"
                >
                  Sign In
                </Link>
                {session ? (
                  <button
                    type="button"
                    onClick={() => router.push("/workspace")}
                    className="inline-flex h-12 items-center justify-center rounded-full border border-foreground/15 px-6 font-medium transition hover:bg-foreground/5"
                  >
                    Continue to workspace
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Offline-first" value="Workspace + drafts" icon={<TabletSmartphone className="h-4 w-4" />} />
              <Metric label="Evidence ready" value="Photos + signatures" icon={<CheckCircle2 className="h-4 w-4" />} />
              <Metric label="Admin control" value="Metrics + alerts" icon={<ShieldCheck className="h-4 w-4" />} />
            </div>
          </div>
        </section>

        <aside className="border-t border-foreground/10 px-6 py-10 sm:px-10 lg:border-t-0 lg:border-l lg:px-12 lg:py-14">
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/55">Why it works</div>
              <div className="mt-3 space-y-4">
                <InfoRow title="Workspace caching" text="Categories, form schemas, and quick actions are pulled once and reused offline." />
                <InfoRow title="Saved forms" text="Drafts and submitted forms stay available even when the connection drops." />
                <InfoRow title="Compliance flow" text="Temperature alerts, corrective actions, and audit reports stay organized." />
                <InfoRow title="Cross-device sync" text="Fresh changes update in the background when the device comes back online." />
              </div>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5">
              <div className="text-sm font-semibold">Built for ISO-led service brands</div>
              <p className="mt-2 text-sm leading-6 text-foreground/65">
                Replace the need for a native app with a fast PWA that works on tablets, supports evidence capture, and keeps your audit trail usable offline for any service brand following ISO standards.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-background/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/50">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

function InfoRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-background/80 p-4 shadow-sm">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm leading-6 text-foreground/65">{text}</div>
    </div>
  );
}

