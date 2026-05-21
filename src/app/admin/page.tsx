"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Building2, Loader2, MessageSquare, TrendingUp, Users } from "lucide-react";
import { PlatformOtaPanel } from "@/components/admin/PlatformOtaPanel";
import { adminFetch } from "@/lib/client/adminFetch";
import { useAdminAccessContext } from "@/components/admin/AdminAccessContext";

type AdminMetrics = {
  totalBrands: number;
  activeBrands: number;
  totalUsers: number;
  totalAnnouncements: number;
  recentActivityCount: number;
};

export default function AdminDashboardPage() {
  const { accessToken } = useAdminAccessContext();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    void (async () => {
      const result = await adminFetch<AdminMetrics>("/api/admin/metrics", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (cancelled) return;
      if (result.ok) {
        setMetrics(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-console-page-hero">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Dashboard</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-700">
            System-wide metrics, native APK policy, and OTA distribution for installed apps.
          </p>
        </div>
        <Link href="/admin/brands" className="admin-console-primary-btn">
          <Building2 className="h-4 w-4" aria-hidden />
          Manage brands
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-foreground/15 bg-background p-4 text-sm text-foreground/70">
          <div className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading system metrics…
          </div>
        </div>
      ) : metrics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard icon={Building2} label="Total brands" value={metrics.totalBrands} />
          <MetricCard icon={TrendingUp} label="Active brands" value={metrics.activeBrands} />
          <MetricCard icon={Users} label="Total users" value={metrics.totalUsers} />
          <MetricCard icon={MessageSquare} label="Announcements" value={metrics.totalAnnouncements} />
          <MetricCard icon={Activity} label="Recent activity" value={metrics.recentActivityCount} />
        </div>
      ) : null}

      <PlatformOtaPanel />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-foreground/15 bg-background p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Quick actions</h3>
          <div className="mt-4 space-y-2">
            <Link href="/admin/brands" className="admin-console-action-row">
              <span className="font-medium">Brand oversight</span>
              <span className="mt-1 block text-xs text-foreground/60">
                Activate, deactivate, message brands, and broadcast alerts
              </span>
            </Link>
            <Link href="/workspace" className="admin-console-action-row">
              <span className="font-medium">Return to workspace</span>
              <span className="mt-1 block text-xs text-foreground/60">Open your tenant workspace and forms</span>
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-foreground/15 bg-background p-5 shadow-sm">
          <h3 className="text-lg font-semibold">System status</h3>
          <div className="mt-4 space-y-3 text-sm">
            <StatusRow label="Database connection" status="Healthy" />
            <StatusRow label="Authentication" status="Active" />
            <StatusRow label="Developer access" status="Granted" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-foreground/15 bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-foreground/50">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground/70">{label}</span>
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
        {status}
      </span>
    </div>
  );
}
