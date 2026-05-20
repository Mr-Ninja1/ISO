"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiUrl } from "@/lib/client/apiBase";

type PlatformSettings = {
  minNativeBuild: number;
  liveUpdateChannel: string;
  liveUpdateBundleUrl: string | null;
  updatedAt: string | null;
};

export function PlatformOtaPanel() {
  const { session } = useAuth();
  const accessToken = session?.access_token || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<PlatformSettings>({
    minNativeBuild: 1,
    liveUpdateChannel: "production",
    liveUpdateBundleUrl: null,
    updatedAt: null,
  });

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/admin/platform-settings"), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as PlatformSettings & { error?: string };
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
      setForm({
        minNativeBuild: json.minNativeBuild ?? 1,
        liveUpdateChannel: json.liveUpdateChannel || "production",
        liveUpdateBundleUrl: json.liveUpdateBundleUrl ?? null,
        updatedAt: json.updatedAt ?? null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load OTA settings");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!accessToken || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(apiUrl("/api/admin/platform-settings"), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          minNativeBuild: form.minNativeBuild,
          liveUpdateChannel: form.liveUpdateChannel,
          liveUpdateBundleUrl: form.liveUpdateBundleUrl,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as PlatformSettings & { error?: string };
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      setForm({
        minNativeBuild: json.minNativeBuild ?? form.minNativeBuild,
        liveUpdateChannel: json.liveUpdateChannel || form.liveUpdateChannel,
        liveUpdateBundleUrl: json.liveUpdateBundleUrl ?? null,
        updatedAt: json.updatedAt ?? null,
      });
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save OTA settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-foreground/15 bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foreground/50">
            <Smartphone className="h-3.5 w-3.5" />
            Native app & OTA
          </div>
          <h2 className="mt-2 text-lg font-semibold">Live update controls</h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/70">
            Point sideloaded APKs at a hosted manifest. Devices download the web bundle zip and prompt users to restart.
            Bump min native build when users must reinstall a new APK (plugin or Capacitor changes).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-foreground/15 px-3 text-sm hover:bg-foreground/5 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading platform settings…
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Minimum native build (APK reinstall gate)</span>
            <input
              type="number"
              min={1}
              value={form.minNativeBuild}
              onChange={(e) => setForm((f) => ({ ...f, minNativeBuild: Number(e.target.value) || 1 }))}
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
            />
            <span className="text-xs text-foreground/60">
              Set to the latest APK build number. Older installs see “App update required”.
            </span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">OTA channel</span>
            <input
              type="text"
              value={form.liveUpdateChannel}
              onChange={(e) => setForm((f) => ({ ...f, liveUpdateChannel: e.target.value }))}
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
              placeholder="production"
            />
            <span className="text-xs text-foreground/60">Must match the channel in your hosted manifest.json.</span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Manifest URL (HTTPS)</span>
            <input
              type="url"
              value={form.liveUpdateBundleUrl || ""}
              onChange={(e) => setForm((f) => ({ ...f, liveUpdateBundleUrl: e.target.value.trim() || null }))}
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
              placeholder="https://isopro.me/ota/production/manifest.json"
            />
            <span className="text-xs text-foreground/60">
              Public JSON manifest with bundleId, bundleUrl, channel, and optional minNativeBuild.
            </span>
          </label>

          {form.updatedAt ? (
            <p className="text-xs text-foreground/55">Last saved: {new Date(form.updatedAt).toLocaleString()}</p>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          {saved ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              OTA settings saved. Online devices check within a few hours or on next app open.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save OTA settings"}
            </button>
          </div>

          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3 text-xs text-foreground/70">
            <p className="font-medium text-foreground/85">Release checklist</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>
                Build web bundle: <code className="rounded bg-background px-1">npm run build:capacitor</code>
              </li>
              <li>
                Package OTA zip: <code className="rounded bg-background px-1">npm run package:ota</code>
              </li>
              <li>
                Publish to site: <code className="rounded bg-background px-1">npm run publish:ota:public</code> then deploy
              </li>
              <li>Or one shot: <code className="rounded bg-background px-1">npm run release:ota</code> (build + package + publish)</li>
              <li>Paste manifest URL above and save</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
