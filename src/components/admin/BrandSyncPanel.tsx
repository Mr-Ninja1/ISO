"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  GitMerge,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { NotificationModal } from "@/components/NotificationModal";
import { AdminNetworkStatusBanner } from "@/components/admin/AdminNetworkStatusBanner";
import { adminFetch } from "@/lib/client/adminFetch";
import { useAppOffline } from "@/lib/client/useAppOffline";

type BrandOption = {
  id: string;
  name: string;
  slug: string;
};

type SyncMember = {
  tenantId: string;
  name: string;
  slug: string;
};

type SyncGroup = {
  id: string;
  name: string;
  approvalMode: "manual" | "auto";
  createdAt: string;
  updatedAt: string;
  members: SyncMember[];
};

type Props = {
  brands: BrandOption[];
  onBack: () => void;
};

export function BrandSyncPanel({ brands, onBack }: Props) {
  const { session, loading: authLoading } = useAuth();
  const offline = useAppOffline();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<SyncGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [approvalMode, setApprovalMode] = useState<"manual" | "auto">("manual");
  const [runInitialMerge, setRunInitialMerge] = useState(true);

  const linkedTenantIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      for (const member of group.members) ids.add(member.tenantId);
    }
    return ids;
  }, [groups]);

  const availableBrands = useMemo(
    () => brands.filter((b) => !linkedTenantIds.has(b.id)),
    [brands, linkedTenantIds]
  );

  async function loadGroups() {
    const token = session?.access_token || "";
    if (!token || offline) return;

    setLoading(true);
    setError("");
    const result = await adminFetch<{ groups: SyncGroup[] }>("/api/admin/brand-sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGroups(Array.isArray(result.data.groups) ? result.data.groups : []);
  }

  useEffect(() => {
    if (authLoading || offline) {
      setLoading(false);
      return;
    }
    void loadGroups();
  }, [authLoading, offline, session?.access_token]);

  function toggleTenant(id: string) {
    setSelectedTenantIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }

  async function createGroup() {
    const token = session?.access_token || "";
    if (!token || offline) return;
    if (!groupName.trim()) {
      setError("Enter a name for this sync group.");
      return;
    }
    if (selectedTenantIds.length < 2) {
      setError("Select at least two brands to link.");
      return;
    }

    setBusy(true);
    setError("");
    const result = await adminFetch<{
      groupId: string;
      mergeSummary?: {
        categoriesCopied: number;
        templatesCopied: number;
      };
    }>("/api/admin/brand-sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: groupName.trim(),
        tenantIds: selectedTenantIds,
        approvalMode,
        runInitialMerge,
      }),
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const copied = result.data.mergeSummary;
    const mergeNote =
      runInitialMerge && copied
        ? ` Initial merge copied ${copied.categoriesCopied} categor${copied.categoriesCopied === 1 ? "y" : "ies"} and ${copied.templatesCopied} form${copied.templatesCopied === 1 ? "" : "s"}.`
        : "";
    setBusyMessage(`Sync group created.${mergeNote}`);
    setCreateOpen(false);
    setGroupName("");
    setSelectedTenantIds([]);
    setApprovalMode("manual");
    setRunInitialMerge(true);
    await loadGroups();
  }

  async function updateGroupApproval(group: SyncGroup, nextMode: "manual" | "auto") {
    const token = session?.access_token || "";
    if (!token || offline) return;

    setBusy(true);
    const result = await adminFetch(`/api/admin/brand-sync/${group.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ approvalMode: nextMode }),
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBusyMessage(
      nextMode === "auto"
        ? `${group.name} now auto-syncs new category and form changes.`
        : `${group.name} now requires approval before syncing changes.`
    );
    await loadGroups();
  }

  async function rerunMerge(group: SyncGroup) {
    const token = session?.access_token || "";
    if (!token || offline) return;
    if (!window.confirm(`Run merge again for "${group.name}"? This copies missing categories and forms across linked brands.`)) {
      return;
    }

    setBusy(true);
    const result = await adminFetch<{ summary: { categoriesCopied: number; templatesCopied: number } }>(
      `/api/admin/brand-sync/${group.id}/merge`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    const summary = result.data.summary;
    setBusyMessage(
      `Merge complete — copied ${summary.categoriesCopied} categor${summary.categoriesCopied === 1 ? "y" : "ies"} and ${summary.templatesCopied} form${summary.templatesCopied === 1 ? "" : "s"}.`
    );
  }

  async function dissolveGroup(group: SyncGroup) {
    const token = session?.access_token || "";
    if (!token || offline) return;
    if (
      !window.confirm(
        `Dissolve "${group.name}"? Brands will stop sharing categories and forms. Existing data in each brand stays as-is.`
      )
    ) {
      return;
    }

    setBusy(true);
    const result = await adminFetch(`/api/admin/brand-sync/${group.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBusyMessage(`Dissolved sync group "${group.name}".`);
    await loadGroups();
  }

  if (authLoading || loading) {
    return <AppLoadingScreen title="Loading brand sync" subtitle="Fetching linked brand workspaces..." />;
  }

  if (offline) {
    return (
      <OfflineRouteBlock
        title="Brand sync offline"
        message="Linking and merging brand workspaces needs internet."
        backHref="/admin"
        backLabel="Back to developer console"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminNetworkStatusBanner offline={offline} error={error} onDismissError={() => setError("")} />

      <div className="rounded-2xl border border-foreground/10 bg-background p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to brand management
            </button>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <GitMerge className="h-3.5 w-3.5" />
              Brand workspace sync
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Link brand workspaces</h1>
            <p className="mt-2 max-w-3xl text-sm text-foreground/70">
              For restaurant branches or duplicate accounts that share the same forms and categories.
              Link brands to sync only categories and form templates — submissions, staff, and settings stay separate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={busy || availableBrands.length < 2}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            Link brands
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/20 bg-foreground/5 p-8 text-center">
          <GitMerge className="mx-auto h-8 w-8 text-foreground/40" />
          <h2 className="mt-3 text-lg font-semibold">No linked brand groups yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-foreground/70">
            When two branches created separate accounts, link them here so categories and forms stay in sync without
            merging submissions or staff.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <div key={group.id} className="rounded-xl border border-foreground/15 bg-background p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{group.name}</h2>
                  <p className="mt-1 text-sm text-foreground/70">
                    {group.approvalMode === "auto"
                      ? "Auto-sync — new changes apply immediately to linked brands."
                      : "Manual approval — linked brands must approve or pull each change."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void updateGroupApproval(
                        group,
                        group.approvalMode === "auto" ? "manual" : "auto"
                      )
                    }
                    className="inline-flex h-9 items-center rounded-full border border-foreground/15 px-3 text-sm hover:bg-foreground/5 disabled:opacity-50"
                  >
                    {group.approvalMode === "auto" ? "Switch to manual" : "Switch to auto"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void rerunMerge(group)}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-foreground/15 px-3 text-sm hover:bg-foreground/5 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-run merge
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void dissolveGroup(group)}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-red-200 px-3 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Dissolve
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {group.members.map((member) => (
                  <span
                    key={member.tenantId}
                    className="inline-flex items-center rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1 text-sm"
                  >
                    {member.name}
                    <span className="ml-2 text-xs text-foreground/50">/{member.slug}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close link brands dialog"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-foreground/10 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <h2 className="text-lg font-semibold">Link brand workspaces</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Select brands that should share categories and forms. Everything else stays independent.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Group name</span>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                  placeholder="e.g. Downtown + Uptown branches"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium">Sync mode</span>
                <select
                  value={approvalMode}
                  onChange={(e) => setApprovalMode(e.target.value as "manual" | "auto")}
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                >
                  <option value="manual">Manual approval — recommended for most cases</option>
                  <option value="auto">Auto-sync — changes apply immediately</option>
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-foreground/15 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={runInitialMerge}
                  onChange={(e) => setRunInitialMerge(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Merge existing categories and forms now</span>
                  <span className="mt-1 block text-foreground/70">
                    Copies anything missing between the selected brands so both sides start with the same library.
                  </span>
                </span>
              </label>

              <div className="grid gap-2">
                <span className="text-sm font-medium">Brands to link</span>
                {availableBrands.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    All brands are already in a sync group. Dissolve an existing group first to relink.
                  </div>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-foreground/15 p-3">
                    {availableBrands.map((brand) => (
                      <label key={brand.id} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedTenantIds.includes(brand.id)}
                          onChange={() => toggleTenant(brand.id)}
                        />
                        <span>
                          {brand.name}
                          <span className="ml-2 text-xs text-foreground/50">/{brand.slug}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-11 rounded-full border border-foreground/15 px-5 text-sm"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || availableBrands.length < 2}
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
                onClick={() => void createGroup()}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                Link brands
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <NotificationModal
        open={Boolean(busyMessage)}
        title="Brand sync update"
        message={busyMessage}
        onClose={() => setBusyMessage("")}
      />
    </div>
  );
}
