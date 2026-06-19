"use client";

import { useMemo, useState } from "react";
import {
  CheckSquare,
  Copy,
  Link2,
  ListChecks,
  Loader2,
  Radio,
  Send,
  Share2,
  X,
} from "lucide-react";
import type { CachedAuditRow } from "@/lib/client/auditsListCache";
import {
  buildShareTitle,
  todayAuditRows,
  type SharedFormsMode,
} from "@/lib/sharedForms";
import { adminFetch } from "@/lib/client/adminFetch";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  tenantSlug: string;
  tenantName?: string;
  rows: CachedAuditRow[];
  selectedIds: string[];
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  onClearSelection: () => void;
  onSelectionModeChange?: (value: boolean) => void;
};

async function shareOrCopy(url: string, title: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url, text: title });
      return "shared";
    } catch {
      // fall through
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return "copied";
  }

  window.prompt("Copy this shared forms link", url);
  return "prompted";
}

export function StoredFormsShareMenu({
  tenantSlug,
  tenantName,
  rows,
  selectedIds,
  selectionMode,
  onToggleSelectionMode,
  onClearSelection,
}: Props) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState<SharedFormsMode | null>(null);
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number>(7);

  const todayRows = useMemo(() => todayAuditRows(rows), [rows]);

  async function handleShare(mode: SharedFormsMode) {
    const auditIds =
      mode === "selected"
        ? selectedIds
        : mode === "today"
          ? todayRows.map((row) => row.id)
          : rows.map((row) => row.id);

    if (!auditIds.length) {
      setMessage(
        mode === "selected"
          ? "Select at least one form first."
          : mode === "today"
            ? "No forms from today are available yet."
            : "There are no submitted forms to share yet.",
      );
      return;
    }

    setSharing(mode);
    setMessage("");
    setShareUrl("");
    try {
      const title = buildShareTitle(
        mode,
        tenantName || tenantSlug,
        auditIds.length,
      );
      const token = session?.access_token || "";
      const resultRes = await adminFetch<{ share?: { href?: string } }>(
        "/api/shared/forms",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            tenantSlug,
            title,
            mode,
            auditIds,
            expiresInDays,
          }),
        },
      );
      if (!resultRes.ok) {
        throw new Error(resultRes.error || "Could not create share link");
      }
      if (!resultRes.data?.share?.href) {
        throw new Error("Could not create share link");
      }
      const url = `${window.location.origin}${resultRes.data.share.href}`;
      setShareUrl(url);
      const result = await shareOrCopy(url, title);
      setMessage(
        result === "shared"
          ? "Shared review link ready."
          : result === "copied"
            ? "Review link copied. Send it to view forms in the browser."
            : "Review link created. You can copy it below.",
      );
      if (mode === "selected") onClearSelection();
    } catch {
      setMessage("Could not create the review link right now.");
    } finally {
      setSharing(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
      >
        <Share2 className="h-4 w-4" />
        Share forms
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-foreground/15 bg-background p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Share forms</h3>
              <p className="mt-1 text-xs text-foreground/60">
                Create a clean browser review link instead of exporting bulky
                PDFs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 hover:bg-foreground/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            <div className="rounded-lg border border-foreground/15 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/55">
                Snapshot links
              </div>
              <p className="mt-1 text-xs text-foreground/60">
                Snapshot links freeze the chosen forms at the moment you share
                them.
              </p>

              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onToggleSelectionMode();
                    setOpen(false);
                  }}
                  className="flex items-start gap-3 rounded-lg border border-foreground/15 p-3 text-left hover:bg-foreground/5"
                >
                  <CheckSquare className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-medium">
                      {selectionMode
                        ? "Selection mode is active"
                        : "Select forms to share"}
                    </span>
                    <span className="block text-xs text-foreground/60">
                      Pick exactly which reports go into one review link from
                      the list below.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={sharing === "today" || todayRows.length === 0}
                  onClick={() => void handleShare("today")}
                  className="flex items-start gap-3 rounded-lg border border-foreground/15 p-3 text-left hover:bg-foreground/5 disabled:opacity-50"
                >
                  {sharing === "today" ? (
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                  ) : (
                    <ListChecks className="mt-0.5 h-4 w-4" />
                  )}
                  <span>
                    <span className="block text-sm font-medium">
                      Share today’s forms
                    </span>
                    <span className="block text-xs text-foreground/60">
                      {todayRows.length} form{todayRows.length === 1 ? "" : "s"}{" "}
                      from today in one browser link.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={sharing === "all" || rows.length === 0}
                  onClick={() => void handleShare("all")}
                  className="flex items-start gap-3 rounded-lg border border-foreground/15 p-3 text-left hover:bg-foreground/5 disabled:opacity-50"
                >
                  {sharing === "all" ? (
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mt-0.5 h-4 w-4" />
                  )}
                  <span>
                    <span className="block text-sm font-medium">
                      Share all visible forms
                    </span>
                    <span className="block text-xs text-foreground/60">
                      Send the current saved-forms list as a grouped read-only
                      portal.
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-foreground/15 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/55">
                Live links
              </div>
              <p className="mt-1 text-xs text-foreground/60">
                Live links refresh from the database whenever the receiver opens
                them.
              </p>

              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  disabled={sharing === "live_today"}
                  onClick={() => void handleShare("live_today")}
                  className="flex items-start gap-3 rounded-lg border border-foreground/15 p-3 text-left hover:bg-foreground/5 disabled:opacity-50"
                >
                  {sharing === "live_today" ? (
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Radio className="mt-0.5 h-4 w-4" />
                  )}
                  <span>
                    <span className="block text-sm font-medium">
                      Live today’s forms
                    </span>
                    <span className="block text-xs text-foreground/60">
                      Receiver can open the same link daily and always see
                      today’s submitted forms.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={sharing === "live_all"}
                  onClick={() => void handleShare("live_all")}
                  className="flex items-start gap-3 rounded-lg border border-foreground/15 p-3 text-left hover:bg-foreground/5 disabled:opacity-50"
                >
                  {sharing === "live_all" ? (
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Radio className="mt-0.5 h-4 w-4" />
                  )}
                  <span>
                    <span className="block text-sm font-medium">
                      Live saved forms
                    </span>
                    <span className="block text-xs text-foreground/60">
                      Receiver always sees the latest submitted forms from this
                      brand.
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-foreground/15 p-3">
              <label className="grid gap-1 text-xs">
                <span className="font-semibold uppercase tracking-[0.16em] text-foreground/55">
                  Link expiry
                </span>
                <select
                  value={expiresInDays}
                  onChange={(e) =>
                    setExpiresInDays(Number(e.target.value) || 7)
                  }
                  className="h-9 rounded-md border border-foreground/20 bg-background px-3 text-sm"
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
            </div>

            <div className="rounded-lg border border-dashed border-foreground/15 p-3 text-xs text-foreground/60">
              Recipients open a read-only review page in the browser. No
              editing, no admin controls, just organised forms.
            </div>
          </div>
        </div>
      ) : null}

      {selectionMode ? (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Selection mode is active. Choose forms from the list, then return here
          to create a selected share link.
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="mt-2 rounded-md border border-foreground/15 bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Share selected forms</div>
              <div className="text-xs text-foreground/60">
                {selectedIds.length} selected form
                {selectedIds.length === 1 ? "" : "s"} ready to share.
              </div>
            </div>
            <button
              type="button"
              disabled={sharing === "selected"}
              onClick={() => void handleShare("selected")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-60"
            >
              {sharing === "selected" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Share selected
            </button>
          </div>
        </div>
      ) : null}

      {shareUrl ? (
        <div className="mt-2 grid gap-2 rounded-md border border-sky-300 bg-sky-50 p-3 text-xs text-sky-950">
          <div className="font-medium">Share link ready</div>
          <div className="break-all rounded border border-sky-200 bg-white px-2 py-2 text-[11px]">
            {shareUrl}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(shareUrl);
                setMessage("Review link copied.");
              }}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-sky-300 bg-white px-3 text-xs hover:bg-sky-100"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </button>
            <button
              type="button"
              onClick={() => setShareUrl("")}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-sky-300 bg-white px-3 text-xs hover:bg-sky-100"
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <Copy className="h-3.5 w-3.5" />
          {message}
        </div>
      ) : null}
    </div>
  );
}
