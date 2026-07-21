"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, GitMerge, Loader2, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { apiUrl } from "@/lib/client/apiBase";
import { useAppOffline } from "@/lib/client/useAppOffline";

type SyncStatus = {
  linked: boolean;
  group: {
    id: string;
    name: string;
    approvalMode: "manual" | "auto";
    members: Array<{ tenantId: string; name: string; slug: string }>;
  } | null;
  pendingCount: number;
};

type PendingChange = {
  id: string;
  sourceBrandName: string;
  entityType: "category" | "form_template";
  changeType: "create" | "update" | "delete";
  label: string;
  createdAt: string;
};

type Props = {
  tenantSlug: string;
  tenantId?: string;
};

function changeLabel(change: PendingChange) {
  const entity = change.entityType === "category" ? "Category" : "Form";
  const action =
    change.changeType === "create" ? "New" : change.changeType === "update" ? "Updated" : "Deleted";
  return `${action} ${entity.toLowerCase()}: ${change.label}`;
}

export function BrandSyncSection({ tenantSlug }: Props) {
  const { session } = useAuth();
  const offline = useAppOffline();
  const accessToken = session?.access_token || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || offline) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [statusRes, pendingRes] = await Promise.all([
        fetch(apiUrl(`/api/brand-sync/status?tenantSlug=${encodeURIComponent(tenantSlug)}`), {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(apiUrl(`/api/brand-sync/pending?tenantSlug=${encodeURIComponent(tenantSlug)}`), {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      const statusJson = await statusRes.json().catch(() => ({}));
      const pendingJson = await pendingRes.json().catch(() => ({}));

      if (!statusRes.ok) {
        setError(typeof statusJson.error === "string" ? statusJson.error : "Failed to load sync status");
        setLoading(false);
        return;
      }

      setStatus(statusJson as SyncStatus);
      setPending(Array.isArray(pendingJson.pending) ? pendingJson.pending : []);
    } catch {
      setError("Failed to load brand sync status.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, offline, tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolveChange(changeId: string, action: "approve" | "reject") {
    if (!accessToken || offline) return;
    setBusyId(changeId);
    setError("");

    try {
      const res = await fetch(apiUrl(`/api/brand-sync/pending/${changeId}`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Failed to update pending change");
        return;
      }
      await load();
    } catch {
      setError("Failed to update pending change.");
    } finally {
      setBusyId(null);
    }
  }

  async function pullAll() {
    if (!accessToken || offline) return;
    setPulling(true);
    setError("");

    try {
      const res = await fetch(apiUrl("/api/brand-sync/pull"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Failed to pull changes");
        return;
      }
      await load();
    } catch {
      setError("Failed to pull changes.");
    } finally {
      setPulling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking linked brand sync...
      </div>
    );
  }

  if (!status?.linked) {
    return (
      <FeatureSyncNotice
        title="Brand sync not enabled"
        message="This brand is not linked to another workspace. Contact your platform developer if you need categories and forms shared across branches."
      />
    );
  }

  const peers = (status.group?.members || []).filter((member) => member.slug !== tenantSlug);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-foreground/15 bg-background p-4">
        <div className="flex items-start gap-3">
          <GitMerge className="mt-0.5 h-5 w-5 text-foreground/60" />
          <div>
            <h3 className="font-semibold">{status.group?.name || "Linked brand group"}</h3>
            <p className="mt-1 text-sm text-foreground/70">
              Categories and forms sync with{" "}
              {peers.length > 0 ? peers.map((peer) => peer.name).join(", ") : "linked brands"}.
              Submissions, staff, and settings stay separate.
            </p>
            <p className="mt-2 text-xs text-foreground/60">
              Mode:{" "}
              {status.group?.approvalMode === "auto"
                ? "Auto-sync (changes apply immediately)"
                : "Manual approval (review changes below or pull all)"}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      ) : null}

      {status.group?.approvalMode === "manual" ? (
        <div className="rounded-xl border border-foreground/15 bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Pending sync changes</h3>
              <p className="mt-1 text-sm text-foreground/70">
                {pending.length > 0
                  ? `${pending.length} change${pending.length === 1 ? "" : "s"} waiting for your review.`
                  : "No pending changes from linked brands."}
              </p>
            </div>
            {pending.length > 0 ? (
              <button
                type="button"
                disabled={pulling || offline}
                onClick={() => void pullAll()}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
              >
                {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Pull all changes
              </button>
            ) : null}
          </div>

          {pending.length > 0 ? (
            <div className="mt-4 space-y-2">
              {pending.map((change) => (
                <div
                  key={change.id}
                  className="flex flex-col gap-3 rounded-lg border border-foreground/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-medium">{changeLabel(change)}</div>
                    <div className="mt-1 text-xs text-foreground/60">
                      From {change.sourceBrandName} · {new Date(change.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === change.id || offline}
                      onClick={() => void resolveChange(change.id, "approve")}
                      className="inline-flex h-9 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-800 disabled:opacity-50"
                    >
                      {busyId === change.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busyId === change.id || offline}
                      onClick={() => void resolveChange(change.id, "reject")}
                      className="inline-flex h-9 items-center gap-1 rounded-full border border-foreground/15 px-3 text-sm disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
