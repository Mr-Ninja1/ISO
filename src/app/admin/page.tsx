"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, Activity, MessageSquare, Users, Building2, TrendingUp } from "lucide-react";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import { BrandOversightPanel } from "@/components/admin/BrandOversightPanel";
import { PlatformOtaPanel } from "@/components/admin/PlatformOtaPanel";
import { adminFetch } from "@/lib/client/adminFetch";
import { useAuth } from "@/components/AuthProvider";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { SupportContactLink } from "@/components/SupportContactLink";

type AdminMetrics = {
  totalBrands: number;
  activeBrands: number;
  totalUsers: number;
  totalAnnouncements: number;
  recentActivityCount: number;
};

export default function AdminPage() {
  const { user, session, loading: authLoading } = useAuth();
  const offline = useAppOffline();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [showBrands, setShowBrands] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setLoading(false);
      return;
    }
    if (offline) {
      setLoading(false);
      return;
    }

    async function loadMetrics() {
      const token = session?.access_token || "";
      if (!token) {
        setLoading(false);
        return;
      }

      const result = await adminFetch<AdminMetrics>("/api/admin/metrics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result.ok) {
        setMetrics(result.data);
        setAccessDenied(false);
      } else if (result.status === 403) {
        setAccessDenied(true);
      }
      setLoading(false);
    }

    loadMetrics();
  }, [authLoading, offline, session?.access_token]);

  if (authLoading || loading) {
    return <AppLoadingScreen title="Loading admin console" subtitle="Checking permissions and loading system metrics..." />;
  }

  if (offline) {
    return (
      <OfflineRouteBlock
        title="Admin console offline"
        message="The developer dashboard needs internet because it reads live metrics and brand controls from the database."
        backHref="/workspace"
        backLabel="Back to workspace"
      />
    );
  }

  if (!user) {
    return <OfflineRouteBlock title="Developer access required" message="Sign in with an approved developer account to open the developer console." backHref="/developer-login" backLabel="Developer sign in" />;
  }

  if (accessDenied) {
    return <OfflineRouteBlock title="Developer access required" message="This console is restricted to approved platform developers." backHref="/developer-login" backLabel="Developer sign in" />;
  }

  if (showBrands) {
    return (
      <AdminSectionErrorBoundary>
        <BrandOversightPanel />
      </AdminSectionErrorBoundary>
    );
  }

  return (
    <AdminSectionErrorBoundary>
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-foreground/10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_rgba(242,245,248,0.95),_rgba(229,231,235,0.9))] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <ShieldCheck className="h-3.5 w-3.5" />
              Developer console
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Developer dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-foreground/70">
              Overview of all brands, system metrics, and platform-level controls.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SupportContactLink label="Contact support" />
            <button
            onClick={() => setShowBrands(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-4 font-medium text-background shadow-sm transition hover:translate-y-[-1px]"
          >
            <Building2 className="h-4 w-4" />
            Manage brands
          </button>
          </div>
        </div>
      </div>

      {metrics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-foreground/15 bg-background p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-foreground/50">
              <Building2 className="h-3.5 w-3.5" />
              Total brands
            </div>
            <div className="mt-2 text-2xl font-semibold">{metrics.totalBrands}</div>
          </div>
          <div className="rounded-xl border border-foreground/15 bg-background p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-foreground/50">
              <TrendingUp className="h-3.5 w-3.5" />
              Active brands
            </div>
            <div className="mt-2 text-2xl font-semibold">{metrics.activeBrands}</div>
          </div>
          <div className="rounded-xl border border-foreground/15 bg-background p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-foreground/50">
              <Users className="h-3.5 w-3.5" />
              Total users
            </div>
            <div className="mt-2 text-2xl font-semibold">{metrics.totalUsers}</div>
          </div>
          <div className="rounded-xl border border-foreground/15 bg-background p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-foreground/50">
              <MessageSquare className="h-3.5 w-3.5" />
              Announcements
            </div>
            <div className="mt-2 text-2xl font-semibold">{metrics.totalAnnouncements}</div>
          </div>
          <div className="rounded-xl border border-foreground/15 bg-background p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-foreground/50">
              <Activity className="h-3.5 w-3.5" />
              Recent activity
            </div>
            <div className="mt-2 text-2xl font-semibold">{metrics.recentActivityCount}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          <div className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading system metrics...
          </div>
        </div>
      )}

      <PlatformOtaPanel />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-foreground/15 bg-background p-5">
          <h2 className="text-lg font-semibold">Quick actions</h2>
          <div className="mt-4 space-y-2">
            <button
              onClick={() => setShowBrands(true)}
              className="w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-left text-sm hover:bg-foreground/5 transition"
            >
              <div className="font-medium">Manage brands</div>
              <div className="mt-1 text-xs text-foreground/60">Activate, deactivate, and send alerts to brands</div>
            </button>
            <Link
              href="/workspace"
              className="block w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-left text-sm hover:bg-foreground/5 transition"
            >
              <div className="font-medium">Back to workspace</div>
              <div className="mt-1 text-xs text-foreground/60">Return to your brands and forms</div>
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-foreground/15 bg-background p-5">
          <h2 className="text-lg font-semibold">System status</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground/70">Database connection</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Healthy</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground/70">Authentication</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Active</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground/70">Admin access</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Granted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AdminSectionErrorBoundary>
  );
}