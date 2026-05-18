"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchNavCapabilities } from "@/lib/client/navCapabilities";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, TabletSmartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function Home() {
  const { session, user, loading } = useAuth();
  const router = useRouter();
  const isAuthenticated = Boolean(user?.id);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [developerClicks, setDeveloperClicks] = useState(0);
  const developerClicksRef = useRef(0);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isiOS = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;

    setIsIos(isiOS && isSafari && !isStandalone);
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // If user is authenticated, redirect straight to the appropriate area — prefer admin dashboard when allowed
  useEffect(() => {
    if (!loading && isAuthenticated) {
      const accessToken = session?.access_token || "";
      const lastTenant = (typeof window !== "undefined" && localStorage.getItem("lastTenantSlug")) || "";

      if (accessToken && lastTenant) {
        fetchNavCapabilities(accessToken, lastTenant)
          .then((caps) => {
            if (caps.canSeeAdminRoutes) router.replace("/dashboard");
            else router.replace("/workspace");
          })
          .catch(() => {
            router.replace("/workspace");
          });
      } else {
        router.replace("/workspace");
      }
    }
  }, [isAuthenticated, loading, router, session]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return;
    }

    setShowInstallHelp(true);
  };

  const handleDeveloperAccess = () => {
    developerClicksRef.current += 1;

    if (developerClicksRef.current >= 6) {
      developerClicksRef.current = 0;
      setDeveloperClicks(0);
      router.push("/developer-login");
      return;
    }

    setDeveloperClicks(developerClicksRef.current);
  };

  return (
    <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-blue-50/30 to-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04),0_20px_60px_rgb(0,0,0,0.06),0_40px_100px_rgb(0,0,0,0.08)] backdrop-blur-xl lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative overflow-hidden px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.03),rgba(147,51,234,0.02),rgba(255,255,255,0))]" />
          <div className="absolute -right-20 top-12 h-56 w-56 rounded-full bg-gradient-to-br from-blue-400/20 via-purple-400/15 to-transparent blur-3xl" />
          <div className="absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-gradient-to-tr from-emerald-400/15 via-cyan-400/10 to-transparent blur-3xl" />

          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
                <Sparkles className="h-3.5 w-3.5" />
                ISO Pro compliance PWA
              </div>

              <div className="space-y-4">
                <h1 className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                  ISO Pro is a production-grade compliance platform for service brands that work to ISO standards.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  Cache your workspace, forms, drafts, evidence, and audit history locally, then sync cross-device updates when internet is available.
                  Designed for teams that need speed, reliability, and offline confidence across any ISO-led operation.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-6 font-medium text-white shadow-lg shadow-slate-900/20 transition-all hover:shadow-xl hover:shadow-slate-900/30 hover:-translate-y-0.5"
                  href="/signup"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-6 font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md"
                  href="/login"
                >
                  Sign In
                </Link>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => router.push("/workspace")}
                    className="inline-flex h-12 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-6 font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md"
                  >
                    Continue to workspace
                  </button>
                ) : null}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDeveloperAccess}
                  className="inline-flex items-center gap-2 rounded-full border border-dashed border-foreground/20 bg-background/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-foreground/55 transition hover:border-foreground/35 hover:text-foreground/80"
                  aria-label="Access"
                  title="Access"
                >
                  Access
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Offline-first" value="Workspace + drafts" icon={<TabletSmartphone className="h-4 w-4" />} color="blue" />
              <Metric label="Evidence ready" value="Photos + signatures" icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
              <Metric label="Admin control" value="Metrics + alerts" icon={<ShieldCheck className="h-4 w-4" />} color="purple" />
            </div>
          </div>
        </section>

        <aside className="border-t border-white/40 px-6 py-10 sm:px-10 lg:border-t-0 lg:border-l lg:px-12 lg:py-14">
          <div className="flex h-full flex-col justify-between gap-6">
            <div className="rounded-[1.75rem] border border-white/60 bg-gradient-to-br from-white/90 to-slate-50/80 p-5 shadow-md backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live snapshot</div>
                  <h2 className="mt-2 text-lg font-bold text-slate-900">What the app can do</h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="rounded-full border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
                    Online
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href="/login"
                      className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md"
                    >
                      Login
                    </Link>
                    <Link
                      href="/signup"
                      className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 text-sm font-medium text-white shadow-md shadow-slate-900/20 transition-all hover:shadow-lg hover:shadow-slate-900/30"
                    >
                      Get started
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <SnapshotRow
                  title="Easy form management"
                  text="Keep audit forms organized, searchable, and ready to use across every workspace."
                  color="blue"
                />
                <SnapshotRow
                  title="Create forms fast"
                  text="Build new forms from scratch or start from a library and tailor them to each brand."
                  color="purple"
                />
                <SnapshotRow
                  title="Manage brands"
                  text="Oversee brands, settings, and access from one clean control surface."
                  color="emerald"
                />
                <SnapshotRow
                  title="Get alerts"
                  text="Send notices and stay on top of important activity as it happens."
                  color="amber"
                />
              </div>

            </div>

            <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/90 to-slate-50/80 p-5 shadow-md backdrop-blur-sm">
              <div className="text-sm font-bold text-slate-900">Built for ISO-led service brands</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                A fast PWA that keeps audit work, evidence capture, and brand oversight feeling lightweight without losing control.
              </p>
            </div>
          </div>
        </aside>
      </div>

    </main>
  );
}

function Metric({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color?: string }) {
  const colorClasses = {
    blue: "bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/50",
    emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200/50",
    purple: "bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200/50",
  };
  const iconColorClasses = {
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    purple: "text-purple-600",
  };
  const bgClass = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;
  const iconClass = iconColorClasses[color as keyof typeof iconColorClasses] || iconColorClasses.blue;

  return (
    <div className={`rounded-2xl border ${bgClass} p-4 shadow-sm transition-all hover:shadow-md`}>
      <div className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] ${iconClass}`}>
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function SnapshotRow({ title, text, color }: { title: string; text: string; color?: string }) {
  const colorClasses = {
    blue: "bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/50",
    emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200/50",
    purple: "bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200/50",
    amber: "bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200/50",
  };
  const dotColorClasses = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    purple: "bg-purple-500",
    amber: "bg-amber-500",
  };
  const bgClass = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;
  const dotClass = dotColorClasses[color as keyof typeof dotColorClasses] || dotColorClasses.blue;

  return (
    <div className={`rounded-2xl border ${bgClass} p-4 shadow-sm transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass} shadow-sm`} />
      </div>
      <div className="mt-1 text-sm leading-6 text-slate-600">{text}</div>
    </div>
  );
}

function InstallPwaBanner({
  deferredPrompt,
  isIos,
  isInstalled,
  showInstallHelp,
  onInstallClick,
}: {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isIos: boolean;
  isInstalled: boolean;
  showInstallHelp: boolean;
  onInstallClick: () => void;
}) {
  if (isInstalled) {
    return (
      <div className="rounded-3xl border border-foreground/10 bg-white/85 px-4 py-3 text-sm shadow-sm backdrop-blur-sm">
        <div className="font-semibold text-slate-900">App installed</div>
        <div className="mt-1 text-slate-600">Launch ISO Pro from your home screen or app launcher.</div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-foreground/10 bg-white/85 px-4 py-3 text-sm shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="font-semibold text-slate-900">Install ISO Pro</div>
          <div className="mt-1 text-slate-600">Quick access, offline-ready, home-screen support.</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {deferredPrompt ? (
            <button
              type="button"
              onClick={onInstallClick}
              className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Install App
            </button>
          ) : isIos ? (
            <button
              type="button"
              onClick={onInstallClick}
              className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Show instructions
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstallClick}
              className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              Open browser menu
            </button>
          )}
        </div>
      </div>

      {showInstallHelp && !deferredPrompt ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          {isIos ? (
            <p>On iPhone Safari, tap Share → Add to Home Screen.</p>
          ) : (
            <p>Use your browser menu and choose “Install app” or “Add to Home Screen”.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

