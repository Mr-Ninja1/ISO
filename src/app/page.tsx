"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileCheck2, FileUp, LockKeyhole, Sparkles, WandSparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { resolveWorkspaceUrlWithLastTenant } from "@/lib/client/appEntryNavigation";

export default function Home() {
  const router = useRouter();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user?.id) {
      router.replace(resolveWorkspaceUrlWithLastTenant() || "/workspace");
      return;
    }
    if (isCapacitorNativeApp()) router.replace("/login");
  }, [loading, router, user?.id]);

  if (loading || user?.id || isCapacitorNativeApp()) {
    return <WorkspaceLoadingShell title="Starting ISO Grid" subtitle="Preparing your workspace…" />;
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#f5f7f5] text-[#142522]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_8%,rgba(81,206,166,.2),transparent_36%),radial-gradient(ellipse_at_10%_80%,rgba(99,154,183,.12),transparent_35%)]" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="ISO Grid home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123d37] text-xs font-black tracking-tight text-white shadow-sm">ISO</span>
          <span><span className="block text-sm font-bold tracking-tight">ISO Grid</span><span className="block text-[11px] text-slate-500">Quality in motion</span></span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3" aria-label="Account navigation">
          <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-950">Sign in</Link>
          <Link href="/signup" className="rounded-xl bg-[#123d37] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d302b]">Create account</Link>
        </nav>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-4 sm:px-8 sm:pt-10">
        <Link href="/demo" className="group mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl border border-emerald-900/10 bg-white/85 px-4 py-3 text-center shadow-[0_8px_30px_rgba(17,53,46,.06)] transition hover:border-emerald-800/25 hover:bg-white sm:rounded-full sm:py-2.5">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-900"><Sparkles className="h-3 w-3"/>No account needed</span>
          <span className="text-sm font-semibold text-slate-700">New to ISO Grid? Try the demo workspace first.</span>
          <ArrowRight className="h-4 w-4 text-emerald-800 transition group-hover:translate-x-0.5"/>
        </Link>

        <section className="mx-auto grid max-w-6xl items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-emerald-950"><WandSparkles className="h-3.5 w-3.5"/>AI-powered field operations</div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] sm:text-5xl lg:text-6xl">Turn the work you do into work you can prove.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Build clear inspections, capture evidence and keep teams aligned—without turning everyday quality work into more admin.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#123d37] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(18,61,55,.2)] transition hover:-translate-y-0.5 hover:bg-[#0d302b]">Try the demo workspace<ArrowRight className="h-4 w-4"/></Link>
              <Link href="/signup" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-5 text-sm font-semibold text-slate-800 transition hover:bg-white">Create your workspace</Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">Explore sample forms, generate one with AI, and submit it locally.</p>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-emerald-200/50 via-white/10 to-sky-200/45 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_30px_90px_rgba(26,59,52,.14)] backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900"><Sparkles className="h-5 w-5"/></span><div><p className="text-sm font-semibold">AI form studio</p><p className="mt-0.5 text-xs text-slate-500">From idea to ready-to-use form</p></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-900">Live demo</span></div>
              <div className="mt-5 rounded-2xl bg-[#f5f8f6] p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Your instruction</p><p className="mt-2 text-sm leading-6 text-slate-700">“Create a daily opening inspection for a small commercial kitchen.”</p></div>
              <div className="my-3 flex items-center gap-2 px-2 text-[11px] font-medium text-emerald-900"><span className="h-px flex-1 bg-emerald-900/10"/><span className="inline-flex items-center gap-1.5"><FileUp className="h-3.5 w-3.5"/>Prompt, PDF or photo</span><span className="h-px flex-1 bg-emerald-900/10"/></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Kitchen opening check</p><p className="mt-1 text-xs text-slate-500">My forms · 8 checks</p></div><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><FileCheck2 className="h-4 w-4"/></span></div><div className="mt-4 space-y-2.5">{["Walkways are clear", "Cold storage is in range", "Handwashing station is ready"].map((label, index) => <div key={label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className={`flex h-5 w-5 items-center justify-center rounded-md border ${index === 1 ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white"}`}>{index === 1 ? <span className="text-[10px]">✓</span> : null}</span><span className="text-xs text-slate-600">{label}</span></div>)}</div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[11px] text-slate-500">Submission saved to demo session</span><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800"><LockKeyhole className="h-3 w-3"/>Private</span></div></div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>No workspace setup. No database writes. Just try it.</div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-3 border-t border-slate-200/80 pt-7 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-white/55 p-4"><p className="text-sm font-semibold">Make forms from a thought</p><p className="mt-1 text-xs leading-5 text-slate-600">Describe the job or upload a document and let AI draft the checks.</p></div>
          <div className="rounded-2xl border border-white/70 bg-white/55 p-4"><p className="text-sm font-semibold">Try it like your team would</p><p className="mt-1 text-xs leading-5 text-slate-600">Fill in a form and see the submission appear instantly in the demo.</p></div>
          <div className="rounded-2xl border border-white/70 bg-white/55 p-4"><p className="text-sm font-semibold">Start with My forms</p><p className="mt-1 text-xs leading-5 text-slate-600">Keep everything together, then add categories when the library grows.</p></div>
        </section>
      </div>
    </main>
  );
}
