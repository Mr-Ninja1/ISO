"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, Clock3, Loader2, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";

type CorrectiveActionStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";

type CorrectiveActionRow = {
  id: string;
  title: string;
  description: string;
  ownerName: string;
  ownerEmail: string | null;
  dueDate: string | null;
  status: CorrectiveActionStatus;
  sourceType: string | null;
  sourceId: string | null;
  evidence: { notes: string | null; photos: string[] } | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
};

type CorrectiveActionsResponse = {
  tenant: { id: string; name: string; slug: string };
  summary: {
    total: number;
    open: number;
    inProgress: number;
    closed: number;
    overdue: number;
    archived: number;
  };
  actions: CorrectiveActionRow[];
};

type DraftAction = {
  title: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  dueDate: string;
  sourceType: string;
  sourceId: string;
  evidenceNotes: string;
};

const EMPTY_DRAFT: DraftAction = {
  title: "",
  description: "",
  ownerName: "",
  ownerEmail: "",
  dueDate: "",
  sourceType: "",
  sourceId: "",
  evidenceNotes: "",
};

function statusLabel(status: CorrectiveActionStatus) {
  if (status === "OPEN") return "Open";
  if (status === "IN_PROGRESS") return "In progress";
  return "Closed";
}

function statusClass(status: CorrectiveActionStatus) {
  if (status === "OPEN") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "IN_PROGRESS") return "border-sky-300 bg-sky-50 text-sky-900";
  return "border-foreground/15 bg-foreground/[0.03] text-foreground/70";
}

function formatDueDate(value: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function filesToDataUrls(files: FileList | null) {
  if (!files || files.length === 0) return Promise.resolve<string[]>([]);

  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsDataURL(file);
        })
    )
  ).then((items) => items.filter((item) => item.length > 0));
}

export function CorrectiveActionsClient({ tenantSlug }: { tenantSlug: string }) {
  const { session, loading: authLoading } = useAuth();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CorrectiveActionsResponse | null>(null);
  const [view, setView] = useState<"all" | "active" | "archive">("active");
  const [draft, setDraft] = useState<DraftAction>(EMPTY_DRAFT);
  const [fileCount, setFileCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

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

  async function loadActions() {
    const token = session?.access_token || "";
    if (!token || !tenantSlug) return;

    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/corrective-actions", window.location.origin);
      url.searchParams.set("tenantSlug", tenantSlug);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as CorrectiveActionsResponse & { error?: string };
      if (!res.ok) throw new Error(json?.error || `Failed to load corrective actions (${res.status})`);
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load corrective actions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!online) {
      setLoading(false);
      return;
    }
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    loadActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, online, session?.access_token, tenantSlug]);

  const filteredActions = useMemo(() => {
    const actions = data?.actions || [];
    if (view === "archive") return actions.filter((action) => action.status === "CLOSED");
    if (view === "active") return actions.filter((action) => action.status !== "CLOSED");
    return actions;
  }, [data?.actions, view]);

  const stats = data?.summary || { total: 0, open: 0, inProgress: 0, closed: 0, overdue: 0, archived: 0 };

  async function handleCreateAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = session?.access_token || "";
    if (!token) return;

    setSaving(true);
    setError("");

    try {
      const files = (event.currentTarget.elements.namedItem("evidencePhotos") as HTMLInputElement | null)?.files || null;
      setUploading(Boolean(files && files.length));
      const evidencePhotos = await filesToDataUrls(files);

      const res = await fetch("/api/corrective-actions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          title: draft.title,
          description: draft.description,
          ownerName: draft.ownerName,
          ownerEmail: draft.ownerEmail,
          dueDate: draft.dueDate,
          sourceType: draft.sourceType,
          sourceId: draft.sourceId,
          evidenceNotes: draft.evidenceNotes,
          evidencePhotos,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json?.error || `Failed to create corrective action (${res.status})`);

      setDraft(EMPTY_DRAFT);
      setFileCount(0);
      event.currentTarget.reset();
      await loadActions();
    } catch (err: any) {
      setError(err?.message || "Failed to create corrective action");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  async function updateStatus(actionId: string, status: CorrectiveActionStatus) {
    const token = session?.access_token || "";
    if (!token) return;

    setEditId(actionId);
    setError("");
    try {
      const row = data?.actions.find((action) => action.id === actionId);
      if (!row) return;

      const res = await fetch("/api/corrective-actions", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          actionId,
          title: row.title,
          description: row.description,
          ownerName: row.ownerName,
          ownerEmail: row.ownerEmail || "",
          dueDate: row.dueDate || "",
          sourceType: row.sourceType || "",
          sourceId: row.sourceId || "",
          evidenceNotes: row.evidence?.notes || "",
          status,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json?.error || `Failed to update corrective action (${res.status})`);
      await loadActions();
    } catch (err: any) {
      setError(err?.message || "Failed to update corrective action");
    } finally {
      setEditId(null);
    }
  }

  if (!online) {
    return (
      <OfflineRouteBlock
        title="Corrective actions need internet"
        message="This workflow reads and writes live records, so you need an online connection to manage status and archive actions."
        hint="Closed actions stay in the archive tab for history, so nothing is deleted when an action is completed."
        backHref={`/${tenantSlug}/dashboard`}
        backLabel="Back to dashboard"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-foreground/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(242,245,248,0.98),_rgba(229,231,235,0.93))] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <ShieldAlert className="h-3.5 w-3.5" />
              Corrective actions
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Track follow-up work and archive completed actions</h1>
            <p className="mt-1 max-w-2xl text-sm text-foreground/70">
              Create corrective actions from incidents, audits, or temperature exceptions. Closed actions move into the archive tab instead of being deleted.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-foreground/65">
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <Clock3 className="h-3.5 w-3.5" />
              {stats.overdue} overdue
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background px-3 py-1">
              <Archive className="h-3.5 w-3.5" />
              {stats.archived} archived
            </span>
          </div>
        </div>
      </div>

      <FeatureSyncNotice
        title="Corrective actions require a live connection"
        message="Completed actions are preserved in the archive tab, so you keep status history without deleting records."
      />

      {loading ? (
        <div className="rounded-xl border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          <div className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading corrective actions...
          </div>
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Open" value={String(stats.open)} icon={<Clock3 className="h-4 w-4" />} />
        <StatCard title="In progress" value={String(stats.inProgress)} icon={<Loader2 className="h-4 w-4" />} />
        <StatCard title="Overdue" value={String(stats.overdue)} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard title="Archive" value={String(stats.archived)} icon={<Archive className="h-4 w-4" />} />
      </div>

      <section className="rounded-xl border border-foreground/20 bg-background p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">New corrective action</h2>
            <p className="mt-1 text-sm text-foreground/60">Use this form for follow-up work. Once the action is closed, it appears in the archive tab as part of the record history.</p>
          </div>
          <div className="inline-flex rounded-full border border-foreground/15 bg-foreground/[0.03] p-1 text-xs font-medium">
            <button type="button" onClick={() => setView("active")} className={tabButtonClass(view === "active")}>
              Active
            </button>
            <button type="button" onClick={() => setView("archive")} className={tabButtonClass(view === "archive")}>
              Archive
            </button>
            <button type="button" onClick={() => setView("all")} className={tabButtonClass(view === "all")}>
              All
            </button>
          </div>
        </div>

        <form className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2" onSubmit={handleCreateAction}>
          <Field label="Title" required>
            <input required className={inputClass()} value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Follow up on out-of-spec temperature" />
          </Field>
          <Field label="Owner name" required>
            <input required className={inputClass()} value={draft.ownerName} onChange={(e) => setDraft((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="Person responsible" />
          </Field>
          <Field label="Owner email">
            <input className={inputClass()} value={draft.ownerEmail} onChange={(e) => setDraft((prev) => ({ ...prev, ownerEmail: e.target.value }))} placeholder="owner@company.com" />
          </Field>
          <Field label="Due date">
            <input type="date" className={inputClass()} value={draft.dueDate} onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))} />
          </Field>
          <Field label="Source type">
            <input className={inputClass()} value={draft.sourceType} onChange={(e) => setDraft((prev) => ({ ...prev, sourceType: e.target.value }))} placeholder="Incident / Audit / Temperature" />
          </Field>
          <Field label="Source reference">
            <input className={inputClass()} value={draft.sourceId} onChange={(e) => setDraft((prev) => ({ ...prev, sourceId: e.target.value }))} placeholder="Optional ticket, audit, or incident id" />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Description" required>
              <textarea required className={textareaClass()} rows={4} value={draft.description} onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))} placeholder="What needs to be corrected and why" />
            </Field>
          </div>
          <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
            <Field label="Evidence notes">
              <textarea className={textareaClass()} rows={3} value={draft.evidenceNotes} onChange={(e) => setDraft((prev) => ({ ...prev, evidenceNotes: e.target.value }))} placeholder="Optional notes, references, or follow-up details" />
            </Field>
            <Field label="Evidence photos">
              <div className="rounded-xl border border-dashed border-foreground/20 p-3">
                <input
                  type="file"
                  name="evidencePhotos"
                  accept="image/*"
                  multiple
                  className="block w-full text-sm text-foreground/70 file:mr-3 file:rounded-full file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-sm file:font-medium file:text-background"
                  onChange={(e) => setFileCount(e.currentTarget.files?.length || 0)}
                />
                <div className="mt-2 text-xs text-foreground/60">
                  {uploading ? "Uploading photos..." : fileCount > 0 ? `${fileCount} file(s) selected` : "Photos will be uploaded and archived with the action."}
                </div>
              </div>
            </Field>
          </div>
          <div className="lg:col-span-2 flex justify-end gap-2">
            <button type="button" className="h-11 rounded-full border border-foreground/15 px-4 text-sm" onClick={() => { setDraft(EMPTY_DRAFT); setFileCount(0); }} disabled={saving}>
              Reset
            </button>
            <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Saving..." : "Create action"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-foreground/20 bg-background p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Actions</h2>
            <p className="text-xs text-foreground/60">Archive is the closed state. Nothing is deleted when the action is completed.</p>
          </div>
          <Link href={`/${tenantSlug}/dashboard`} className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground">
            Open dashboard
          </Link>
        </div>

        <div className="mt-4 grid gap-3">
          {filteredActions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.02] p-6 text-sm text-foreground/60">No corrective actions match this view yet.</div>
          ) : (
            filteredActions.map((action) => (
              <article key={action.id} className="rounded-2xl border border-foreground/15 bg-background p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{action.title}</h3>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(action.status)}`}>
                        {statusLabel(action.status)}
                      </span>
                      {action.isOverdue ? (
                        <span className="inline-flex rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800">
                          Overdue
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-foreground/70">{action.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground/60">
                      <span className="rounded-full border border-foreground/15 px-2 py-1">Owner: {action.ownerName}{action.ownerEmail ? ` (${action.ownerEmail})` : ""}</span>
                      <span className="rounded-full border border-foreground/15 px-2 py-1">Due: {formatDueDate(action.dueDate)}</span>
                      {action.sourceType ? <span className="rounded-full border border-foreground/15 px-2 py-1">Source: {action.sourceType}{action.sourceId ? ` / ${action.sourceId}` : ""}</span> : null}
                      {action.evidence?.photos?.length ? <span className="rounded-full border border-foreground/15 px-2 py-1">{action.evidence.photos.length} evidence photo(s)</span> : null}
                    </div>
                    {action.evidence?.notes ? <div className="mt-3 rounded-xl border border-foreground/15 bg-foreground/[0.02] p-3 text-sm text-foreground/70">{action.evidence.notes}</div> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {action.status === "OPEN" ? (
                      <button type="button" disabled={editId === action.id} onClick={() => updateStatus(action.id, "IN_PROGRESS")} className="inline-flex h-10 items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 text-sm font-medium text-sky-900 disabled:opacity-60">
                        {editId === action.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Start
                      </button>
                    ) : null}
                    {action.status !== "CLOSED" ? (
                      <button type="button" disabled={editId === action.id} onClick={() => updateStatus(action.id, "CLOSED")} className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground/15 bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60">
                        {editId === action.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                        Archive
                      </button>
                    ) : (
                      <button type="button" disabled={editId === action.id} onClick={() => updateStatus(action.id, "IN_PROGRESS")} className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground/15 px-4 text-sm font-medium disabled:opacity-60">
                        {editId === action.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restore
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-wide text-foreground/50">Created {new Date(action.createdAt).toLocaleDateString()} · Updated {new Date(action.updatedAt).toLocaleDateString()} {action.closedAt ? `· Closed ${new Date(action.closedAt).toLocaleDateString()}` : ""}</div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function inputClass() {
  return "h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm outline-none ring-0 focus:border-foreground/30";
}

function textareaClass() {
  return "w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-foreground/30";
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-foreground/70">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function tabButtonClass(active: boolean) {
  return "rounded-full px-4 py-2 transition " + (active ? "bg-foreground text-background" : "text-foreground/65 hover:bg-foreground/5");
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-foreground/20 bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-sm text-foreground/70">
        <span>{title}</span>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
