"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiUrl } from "@/lib/client/apiBase";

type DriveStatus = { connected: boolean; canManage: boolean; email: string | null; lastArchivedAt: string | null; lastError: string | null; archiveAfterDays: number; archivedCount: number };

export function GoogleDriveArchiveSettings({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [days, setDays] = useState("365");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const token = session?.access_token || "";

  const load = useCallback(async () => {
    if (!token || !tenantSlug) return;
    const response = await fetch(apiUrl(`/api/archive/google/status?tenantSlug=${encodeURIComponent(tenantSlug)}`), { headers: { Authorization: `Bearer ${token}` } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load archive settings");
    setStatus(json as DriveStatus);
    setDays(String(json.archiveAfterDays || 365));
  }, [token, tenantSlug]);

  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load archive settings")); }, [load]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("drive");
    if (result) setMessage(result === "connected" ? "Google Drive connected. Archiving will run during scheduled maintenance." : result === "denied" ? "Google Drive access was cancelled." : "Google Drive could not be connected. Check the server configuration and try again.");
  }, []);

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(apiUrl(path), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function connect() {
    setBusy(true); setMessage("");
    try {
      const json = await request(`/api/archive/google/connect?tenantSlug=${encodeURIComponent(tenantSlug)}`);
      window.location.assign(json.authorizationUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect Google Drive"); setBusy(false); }
  }

  async function saveAge() {
    setBusy(true); setMessage("");
    try { await request(`/api/archive/google/status?tenantSlug=${encodeURIComponent(tenantSlug)}`, { method: "PATCH", body: JSON.stringify({ archiveAfterDays: Number(days) }) }); setMessage("Archive age saved."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save archive age"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setMessage("");
    try { await request(`/api/archive/google/status?tenantSlug=${encodeURIComponent(tenantSlug)}`, { method: "DELETE" }); setMessage("Google Drive disconnected. Existing archives remain in Drive and can no longer be loaded in this app until reconnected."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not disconnect Google Drive"); }
    finally { setBusy(false); }
  }

  async function archiveNow() {
    setBusy(true); setMessage("");
    try {
      const result = await request(`/api/archive/google/status?tenantSlug=${encodeURIComponent(tenantSlug)}`, { method: "POST" });
      setMessage(result.archived ? `Archived ${result.archived} submitted form${result.archived === 1 ? "" : "s"}.` : "No forms have reached the archive age yet.");
      await load();
      window.dispatchEvent(new Event("audits-cache-invalidated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not archive forms"); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border border-foreground/15 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Google Drive form archive</h3>
          <p className="mt-1 max-w-2xl text-xs text-foreground/65">Older submitted forms move to the connected Drive account. They stay in Saved forms and load from Drive when opened. Drafts are never archived. Photo evidence already stored in Supabase Storage is retained separately.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1 rounded-md border border-foreground/15 px-2 text-xs"><RefreshCw className="h-3 w-3" />Refresh</button>
      </div>
      {!status ? <div className="mt-4 flex items-center gap-2 text-xs text-foreground/60"><Loader2 className="h-4 w-4 animate-spin" />Loading archive status…</div> : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className={status.connected ? "text-emerald-700" : "text-amber-700"}>{status.connected ? `Connected${status.email ? ` as ${status.email}` : ""}` : "Not connected"}</span>
            <span className="text-foreground/55">{status.archivedCount} archived forms</span>
            {status.lastArchivedAt ? <span className="text-foreground/55">Last archive run {new Date(status.lastArchivedAt).toLocaleString()}</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs">Archive submitted forms after
              <div className="flex items-center gap-2"><input type="number" min={30} max={3650} value={days} onChange={(event) => setDays(event.target.value)} className="h-9 w-28 rounded-md border border-foreground/20 bg-background px-2" /><span>days</span></div>
            </label>
            <button type="button" disabled={busy || !status.canManage} onClick={() => void saveAge()} className="h-9 rounded-md border border-foreground/20 px-3 text-xs font-medium disabled:opacity-50">Save age</button>
            {status.connected ? <button type="button" disabled={busy || !status.canManage} onClick={() => void disconnect()} className="h-9 rounded-md border border-foreground/20 px-3 text-xs font-medium disabled:opacity-50">Disconnect Drive</button> : <button type="button" disabled={busy || !status.canManage} onClick={() => void connect()} className="h-9 rounded-md bg-[var(--hse-teal)] px-3 text-xs font-semibold text-white disabled:opacity-50">Connect Google Drive</button>}
            {status.connected ? <button type="button" disabled={busy || !status.canManage} onClick={() => void archiveNow()} className="h-9 rounded-md border border-foreground/20 px-3 text-xs font-medium disabled:opacity-50">Archive eligible forms now</button> : null}
          </div>
          {status.lastError ? <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">Last archive error: {status.lastError}. Source forms remain safe in the database.</p> : null}
        </>
      )}
      {message ? <p className="mt-3 text-xs text-foreground/70">{message}</p> : null}
      <p className="mt-3 text-[11px] text-foreground/50">A scheduled call to <code>/api/cron/storage-maintenance</code> is required for automatic archiving. Google OAuth credentials and the token encryption key must be configured on the server.</p>
    </section>
  );
}
