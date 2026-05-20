"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Loader2, Megaphone, MessageSquare, Power, PowerOff, Search, ShieldCheck, SortAsc, SortDesc, Trash2, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { NotificationModal } from "@/components/NotificationModal";

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  deactivationReason: string | null;
  memberCount: number;
  latestMessageAt: string | null;
  latestMessageTitle: string | null;
  latestMessageBody: string | null;
};

type AdminBrandsResponse = {
  brands: BrandRow[];
};

type AlertDelivery = "inbox" | "toast" | "modal";

type ComposeState = {
  brandId: string;
  title: string;
  message: string;
  delivery: AlertDelivery;
};

function AlertDeliveryField({
  value,
  onChange,
}: {
  value: AlertDelivery;
  onChange: (value: AlertDelivery) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">Delivery</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AlertDelivery)}
        className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm"
      >
        <option value="modal">Urgent — full-screen popup (recommended)</option>
        <option value="toast">Notice — slide-in alert + inbox</option>
        <option value="inbox">Inbox only — badge, sound, and inbox list</option>
      </select>
    </label>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(value: string) {
  const createdAt = new Date(value).getTime();
  const diffMs = Math.max(0, Date.now() - createdAt);
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  if (days > 365) return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}m`;
  if (days > 30) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return "< 1h";
}

type SortField = "name" | "createdAt" | "updatedAt" | "memberCount";
type SortOrder = "asc" | "desc";
type StatusFilter = "all" | "active" | "inactive";

export function BrandOversightPanel() {
  const { user, session, loading: authLoading } = useAuth();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [savingBrandId, setSavingBrandId] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [busyMessage, setBusyMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [accessDenied, setAccessDenied] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastDelivery, setBroadcastDelivery] = useState<AlertDelivery>("modal");
  const [savingBroadcast, setSavingBroadcast] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<BrandRow | null>(null);
  const [deactivateReasonInput, setDeactivateReasonInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");

  const filteredBrands = useMemo(() => {
    let result = [...brands];

    // Filter by status
    if (statusFilter === "active") {
      result = result.filter((b) => b.isActive);
    } else if (statusFilter === "inactive") {
      result = result.filter((b) => !b.isActive);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(query) ||
          b.slug.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "updatedAt":
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case "memberCount":
          comparison = a.memberCount - b.memberCount;
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [brands, statusFilter, searchQuery, sortField, sortOrder]);

  useEffect(() => {
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const token = session?.access_token || "";
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!token || !online) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    fetch("/api/admin/brands", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as AdminBrandsResponse & { error?: string };
        if (res.status === 403) {
          setAccessDenied(true);
          throw new Error(json?.error || "Forbidden");
        }
        if (!res.ok) throw new Error(json?.error || `Failed to load brand overview (${res.status})`);
        setAccessDenied(false);
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setBrands(Array.isArray(json.brands) ? json.brands : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load brand overview");
        setBrands([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, online, session?.access_token]);

  async function refreshBrands() {
    const token = session?.access_token || "";
    if (!token) return;
    const res = await fetch("/api/admin/brands", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as AdminBrandsResponse & { error?: string };
    if (res.status === 403) {
      setAccessDenied(true);
      throw new Error(json?.error || "Forbidden");
    }
    if (!res.ok) throw new Error(json?.error || `Failed to load brand overview (${res.status})`);
    setAccessDenied(false);
    setBrands(Array.isArray(json.brands) ? json.brands : []);
  }

  async function toggleBrand(brandId: string, nextActive: boolean, deactivationReason?: string | null) {
    const token = session?.access_token || "";
    if (!token) return;
    setSavingBrandId(brandId);
    setBusyMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/brands/${brandId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          isActive: nextActive,
          ...(nextActive ? {} : { deactivationReason: deactivationReason ?? null }),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 403) {
        setAccessDenied(true);
        throw new Error(json?.error || "Forbidden");
      }
      if (!res.ok) throw new Error(json?.error || `Failed to update brand (${res.status})`);
      setBusyMessage(nextActive ? "Brand reactivated." : "Brand deactivated.");
      setDeactivateTarget(null);
      setDeactivateReasonInput("");
      await refreshBrands();
    } catch (err: any) {
      setError(err?.message || "Failed to update brand status");
    } finally {
      setSavingBrandId(null);
    }
  }

  async function deleteBrand(brand: BrandRow) {
    const token = session?.access_token || "";
    if (!token) return;
    setSavingBrandId(brand.id);
    setBusyMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/brands/${brand.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ confirmSlug: deleteConfirmSlug }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 403) {
        setAccessDenied(true);
        throw new Error(json?.error || "Forbidden");
      }
      if (!res.ok) throw new Error(json?.error || `Failed to delete brand (${res.status})`);
      setBusyMessage(`Brand "${brand.name}" was permanently deleted.`);
      setDeleteTarget(null);
      setDeleteConfirmSlug("");
      await refreshBrands();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete brand");
    } finally {
      setSavingBrandId(null);
    }
  }

  async function sendMessage() {
    const token = session?.access_token || "";
    if (!token || !compose) return;
    setSavingBrandId(compose.brandId);
    setBusyMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/brands/${compose.brandId}/message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: compose.title, message: compose.message, delivery: compose.delivery }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 403) {
        setAccessDenied(true);
        throw new Error(json?.error || "Forbidden");
      }
      if (!res.ok) throw new Error(json?.error || `Failed to send alert (${res.status})`);
      setBusyMessage("Alert sent to the selected brand.");
      setCompose(null);
      await refreshBrands();
    } catch (err: any) {
      setError(err?.message || "Failed to send alert");
    } finally {
      setSavingBrandId(null);
    }
  }

  async function sendBroadcast() {
    const token = session?.access_token || "";
    if (!token) return;
    setSavingBroadcast(true);
    setBusyMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: broadcastTitle, message: broadcastMessage, delivery: broadcastDelivery }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 403) {
        setAccessDenied(true);
        throw new Error(json?.error || "Forbidden");
      }
      if (!res.ok) throw new Error(json?.error || `Failed to broadcast (${res.status})`);
      setBusyMessage("Broadcast sent to all brand workspace inboxes.");
      setBroadcastOpen(false);
      setBroadcastTitle("");
      setBroadcastMessage("");
      await refreshBrands();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send broadcast");
    } finally {
      setSavingBroadcast(false);
    }
  }

  if (authLoading) {
    return <AppLoadingScreen title="Loading admin console" subtitle="Checking permissions and loading all brands..." />;
  }

  if (!user) {
    return <OfflineRouteBlock title="Developer access required" message="Sign in with an approved developer account to open the developer console." backHref="/developer-login" backLabel="Developer sign in" />;
  }

  if (accessDenied) {
    return <OfflineRouteBlock title="Developer access required" message="This console is restricted to approved platform developers." backHref="/developer-login" backLabel="Developer sign in" />;
  }

  const activeCount = brands.filter((brand) => brand.isActive).length;
  const inactiveCount = brands.length - activeCount;
  const totalUsers = brands.reduce((sum, brand) => sum + brand.memberCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-foreground/10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_rgba(242,245,248,0.95),_rgba(229,231,235,0.9))] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <ShieldCheck className="h-3.5 w-3.5" />
              Developer console
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Brand oversight</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-700">
              Review every brand in the system, switch access on or off, and send live alerts that pop up inside the brand workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-foreground/65">
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <Users className="h-3.5 w-3.5" />
              {totalUsers} attached users
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <Power className="h-3.5 w-3.5" />
              {activeCount} active
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <PowerOff className="h-3.5 w-3.5" />
              {inactiveCount} inactive
            </span>
          </div>
        </div>
      </div>

      {busyMessage ? <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] p-4 text-sm text-foreground/70">{busyMessage}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-xl border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          <div className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading all brands...
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-foreground/15 bg-background p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or slug..."
              className="h-10 w-full rounded-lg border border-foreground/15 bg-background pl-10 pr-4 text-sm outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-foreground/30"
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-foreground/30"
            >
              <option value="createdAt">Sort by created</option>
              <option value="updatedAt">Sort by updated</option>
              <option value="name">Sort by name</option>
              <option value="memberCount">Sort by users</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-foreground/15 bg-background px-3 text-sm hover:bg-foreground/5"
              title={sortOrder === "asc" ? "Sort ascending" : "Sort descending"}
            >
              {sortOrder === "asc" ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setCompose(null);
                setBroadcastOpen(true);
                setBroadcastTitle("");
                setBroadcastMessage("");
                setBroadcastDelivery("modal");
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-foreground/15 bg-background px-3 text-sm font-medium hover:bg-foreground/5"
              title="Send one message to every brand workspace developer inbox"
            >
              <Megaphone className="h-4 w-4" />
              Broadcast all
            </button>
          </div>
        </div>
        <div className="text-xs text-foreground/60">
          Showing {filteredBrands.length} of {brands.length} brands
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredBrands.map((brand) => {
          const latestMessage = brand.latestMessageTitle || brand.latestMessageBody;
          return (
            <div key={brand.id} className="rounded-2xl border border-foreground/15 bg-background p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.03]">
                    {brand.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brand.logoUrl} alt={brand.name} className="h-10 w-10 object-contain" />
                    ) : (
                      <span className="text-sm font-semibold">{brand.name[0]}</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{brand.name}</h2>
                    <p className="text-sm text-foreground/65">/{brand.slug}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground/60">
                      <span className={brand.isActive ? "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800" : "rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-800"}>
                        {brand.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="rounded-full border border-foreground/15 bg-foreground/[0.03] px-2.5 py-1">
                        On system for {formatDuration(brand.createdAt)}
                      </span>
                      <span className="rounded-full border border-foreground/15 bg-foreground/[0.03] px-2.5 py-1">
                        {brand.memberCount} users attached
                      </span>
                    </div>
                  </div>
                </div>

                <a href={`/${brand.slug}/dashboard`} className="inline-flex items-center gap-1 rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5">
                  Open brand
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-foreground/50">Created</div>
                  <div className="mt-1 text-sm font-medium">{formatDate(brand.createdAt)}</div>
                </div>
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-foreground/50">Last updated</div>
                  <div className="mt-1 text-sm font-medium">{formatDate(brand.updatedAt)}</div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-foreground/10 bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-foreground/50">Latest system message</div>
                    <div className="mt-1 text-sm font-medium">{latestMessage || "No messages sent yet"}</div>
                  </div>
                  <MessageSquare className="h-4 w-4 text-foreground/50" />
                </div>
                {brand.latestMessageAt ? <div className="mt-2 text-xs text-foreground/60">Sent {formatDate(brand.latestMessageAt)}</div> : null}
              </div>

              {!brand.isActive && brand.deactivationReason ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Deactivation note</div>
                  <p className="mt-1 whitespace-pre-line">{brand.deactivationReason}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60"
                  disabled={savingBrandId === brand.id}
                  onClick={() => {
                    setBroadcastOpen(false);
                    setCompose({ brandId: brand.id, title: "", message: "", delivery: "modal" });
                  }}
                >
                  Send alert
                </button>
                <button
                  type="button"
                  className={brand.isActive ? "inline-flex h-10 items-center justify-center rounded-full border border-red-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" : "inline-flex h-10 items-center justify-center rounded-full border border-emerald-200 px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"}
                  disabled={savingBrandId === brand.id}
                  onClick={() => {
                    if (brand.isActive) {
                      setDeleteTarget(null);
                      setDeactivateTarget(brand);
                      setDeactivateReasonInput(brand.deactivationReason || "");
                      return;
                    }
                    void toggleBrand(brand.id, true);
                  }}
                >
                  {savingBrandId === brand.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {brand.isActive ? "Deactivate brand" : "Activate brand"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-red-300 px-4 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
                  disabled={savingBrandId === brand.id}
                  onClick={() => {
                    setDeactivateTarget(null);
                    setDeleteTarget(brand);
                    setDeleteConfirmSlug("");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete brand
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {broadcastOpen ? (
        <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close broadcast composer"
            onClick={() => !savingBroadcast && setBroadcastOpen(false)}
          />
          <div className="relative w-full max-w-xl rounded-3xl border border-foreground/10 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Broadcast to all brands</h2>
                <p className="mt-1 text-sm text-foreground/70">
                  Creates a platform-wide announcement. It appears in every brand workspace developer inbox and alongside per-brand alerts.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-foreground/10 px-3 py-1 text-sm disabled:opacity-50"
                disabled={savingBroadcast}
                onClick={() => setBroadcastOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Title</span>
                <input
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                  placeholder="e.g. Scheduled maintenance tonight"
                />
              </label>

              <AlertDeliveryField value={broadcastDelivery} onChange={setBroadcastDelivery} />

              <label className="grid gap-1 text-sm">
                <span className="font-medium">Message</span>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="min-h-32 rounded-xl border border-foreground/15 bg-background px-3 py-2"
                  placeholder="Message shown in every brand workspace inbox."
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-11 rounded-full border border-foreground/15 px-5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
                disabled={savingBroadcast}
                onClick={() => setBroadcastOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
                disabled={savingBroadcast || !broadcastTitle.trim() || !broadcastMessage.trim()}
                onClick={() => void sendBroadcast()}
              >
                {savingBroadcast ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send broadcast
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deactivateTarget ? (
        <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close deactivation dialog"
            onClick={() => !savingBrandId && setDeactivateTarget(null)}
          />
          <div className="relative w-full max-w-xl rounded-3xl border border-foreground/10 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Deactivate {deactivateTarget.name}</h2>
                <p className="mt-1 text-sm text-foreground/70">
                  Users in this brand will see your note when they try to open the workspace. Leave blank for a generic message.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-foreground/10 px-3 py-1 text-sm disabled:opacity-50"
                disabled={Boolean(savingBrandId)}
                onClick={() => setDeactivateTarget(null)}
              >
                Close
              </button>
            </div>

            <label className="mt-4 grid gap-1 text-sm">
              <span className="font-medium">Reason for deactivation (optional)</span>
              <textarea
                value={deactivateReasonInput}
                onChange={(e) => setDeactivateReasonInput(e.target.value)}
                className="min-h-28 rounded-xl border border-foreground/15 bg-background px-3 py-2"
                placeholder="e.g. Subscription ended — contact billing@isopro.me to renew."
                maxLength={2000}
              />
            </label>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-11 rounded-full border border-foreground/15 px-5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
                disabled={Boolean(savingBrandId)}
                onClick={() => setDeactivateTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full bg-red-700 px-5 text-sm font-medium text-white disabled:opacity-60"
                disabled={savingBrandId === deactivateTarget.id}
                onClick={() =>
                  void toggleBrand(
                    deactivateTarget.id,
                    false,
                    deactivateReasonInput.trim() || null
                  )
                }
              >
                {savingBrandId === deactivateTarget.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Deactivate brand
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[73] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close delete dialog"
            onClick={() => !savingBrandId && setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-xl rounded-3xl border border-red-200 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <h2 className="text-lg font-semibold text-red-900">Delete {deleteTarget.name} permanently?</h2>
                <p className="mt-1 text-sm text-foreground/70">
                  This removes the brand, categories, forms, audits, and members. This cannot be undone. Type{" "}
                  <span className="font-mono font-semibold">/{deleteTarget.slug}</span> to confirm.
                </p>
              </div>
            </div>

            <label className="mt-4 grid gap-1 text-sm">
              <span className="font-medium">Brand slug</span>
              <input
                value={deleteConfirmSlug}
                onChange={(e) => setDeleteConfirmSlug(e.target.value)}
                className="h-11 rounded-xl border border-foreground/15 bg-background px-3 font-mono text-sm"
                placeholder={deleteTarget.slug}
                autoComplete="off"
              />
            </label>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-11 rounded-full border border-foreground/15 px-5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
                disabled={Boolean(savingBrandId)}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full bg-red-700 px-5 text-sm font-medium text-white disabled:opacity-60"
                disabled={
                  savingBrandId === deleteTarget.id ||
                  deleteConfirmSlug.trim().toLowerCase() !== deleteTarget.slug.toLowerCase()
                }
                onClick={() => void deleteBrand(deleteTarget)}
              >
                {savingBrandId === deleteTarget.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {compose ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close alert composer" onClick={() => setCompose(null)} />
          <div className="relative w-full max-w-xl rounded-3xl border border-foreground/10 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Send live brand alert</h2>
                <p className="mt-1 text-sm text-foreground/70">This message will pop up in the selected brand workspace on the next sync/poll.</p>
              </div>
              <button type="button" className="rounded-full border border-foreground/10 px-3 py-1 text-sm" onClick={() => setCompose(null)}>
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Title</span>
                <input
                  value={compose.title}
                  onChange={(e) => setCompose((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                  placeholder="e.g. Please review your corrective actions"
                />
              </label>

              <AlertDeliveryField
                value={compose.delivery}
                onChange={(delivery) => setCompose((prev) => (prev ? { ...prev, delivery } : prev))}
              />

              <label className="grid gap-1 text-sm">
                <span className="font-medium">Message</span>
                <textarea
                  value={compose.message}
                  onChange={(e) => setCompose((prev) => (prev ? { ...prev, message: e.target.value } : prev))}
                  className="min-h-32 rounded-xl border border-foreground/15 bg-background px-3 py-2"
                  placeholder="Write the alert body that users will see inside the brand account."
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="h-11 rounded-full border border-foreground/15 px-5 text-sm font-medium hover:bg-foreground/5" onClick={() => setCompose(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
                disabled={savingBrandId === compose.brandId || !compose.title.trim() || !compose.message.trim()}
                onClick={sendMessage}
              >
                {savingBrandId === compose.brandId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send alert
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <NotificationModal
        open={Boolean(busyMessage)}
        title="Admin update"
        message={busyMessage}
        onClose={() => setBusyMessage("")}
      />
    </div>
  );
}