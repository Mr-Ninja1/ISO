"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Megaphone, RefreshCw, Smartphone, Zap } from "lucide-react";
import { useAdminAccessContext } from "@/components/admin/AdminAccessContext";
import { AnnouncementAudienceField } from "@/components/admin/AnnouncementAudienceField";
import { AdminNetworkStatusBanner } from "@/components/admin/AdminNetworkStatusBanner";
import { adminFetch } from "@/lib/client/adminFetch";
import { useAppOffline } from "@/lib/client/useAppOffline";
import type { AnnouncementAudience } from "@/lib/platformAudience";

type PlatformSettings = {
  minNativeBuild: number;
  liveUpdateChannel: string;
  liveUpdateBundleUrl: string | null;
  latestApkUrl: string | null;
  updatedAt: string | null;
};

export function PlatformOtaPanel() {
  const { accessToken } = useAdminAccessContext();
  const offline = useAppOffline();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastOk, setBroadcastOk] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("App update available");
  const [broadcastMessage, setBroadcastMessage] = useState(
    "A new version of the app is ready. Please close the app completely and open it again to install the update. If you do not see a prompt, restart while connected to the internet."
  );
  const [broadcastAudience, setBroadcastAudience] = useState<AnnouncementAudience>("native");
  const [form, setForm] = useState<PlatformSettings>({
    minNativeBuild: 1,
    liveUpdateChannel: "production",
    liveUpdateBundleUrl: null,
    latestApkUrl: null,
    updatedAt: null,
  });

  const load = useCallback(async () => {
    if (!accessToken || offline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const result = await adminFetch<PlatformSettings>("/api/admin/platform-settings", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!result.ok) {
      if (!result.aborted) setError(result.error);
      setLoading(false);
      return;
    }
    const json = result.data;
    setForm({
      minNativeBuild: json.minNativeBuild ?? 1,
      liveUpdateChannel: json.liveUpdateChannel || "production",
      liveUpdateBundleUrl: json.liveUpdateBundleUrl ?? null,
      latestApkUrl: json.latestApkUrl ?? null,
      updatedAt: json.updatedAt ?? null,
    });
    setLoading(false);
  }, [accessToken, offline]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendUpdateBroadcast() {
    if (!accessToken || broadcasting) return;
    if (offline) {
      setError("You are offline. Reconnect before sending a broadcast.");
      return;
    }
    setBroadcasting(true);
    setError("");
    setBroadcastOk(false);
    const result = await adminFetch("/api/admin/broadcast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        delivery: "modal",
        audience: broadcastAudience,
      }),
    });
    if (!result.ok) setError(result.error);
    else setBroadcastOk(true);
    setBroadcasting(false);
  }

  async function save() {
    if (!accessToken || saving) return;
    if (offline) {
      setError("You are offline. Reconnect before saving settings.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    const result = await adminFetch<PlatformSettings>("/api/admin/platform-settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        minNativeBuild: form.minNativeBuild,
        liveUpdateChannel: form.liveUpdateChannel,
        liveUpdateBundleUrl: form.liveUpdateBundleUrl,
        latestApkUrl: form.latestApkUrl,
      }),
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      const json = result.data;
      setForm({
        minNativeBuild: json.minNativeBuild ?? form.minNativeBuild,
        liveUpdateChannel: json.liveUpdateChannel || form.liveUpdateChannel,
        liveUpdateBundleUrl: json.liveUpdateBundleUrl ?? null,
        latestApkUrl: json.latestApkUrl ?? null,
        updatedAt: json.updatedAt ?? null,
      });
      setSaved(true);
    }
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-foreground/15 bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foreground/50">
            <Smartphone className="h-3.5 w-3.5" />
            Installed app
          </div>
          <h2 className="mt-2 text-lg font-semibold">Native APK &amp; OTA settings</h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/70">
            One save stores all fields in <code className="rounded bg-foreground/5 px-1">platform_settings</code>.
            Native and OTA use different columns and do not overwrite each other — they only share this form for convenience.
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

      <div className="mt-4">
        <AdminNetworkStatusBanner
          offline={offline}
          pending={loading || saving || broadcasting}
          error={error}
          onDismissError={() => setError("")}
        />
      </div>

      {loading ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading platform settings…
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          <section className="rounded-xl border border-foreground/15 bg-foreground/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Smartphone className="h-4 w-4 text-[var(--hse-teal)]" />
              Native APK (reinstall required)
            </div>
            <p className="mt-1 text-xs text-foreground/65">
              Used by the update block screen and the mobile-web install banner. OTA cannot replace the APK shell.
            </p>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Minimum native build</span>
                <input
                  type="number"
                  min={1}
                  value={form.minNativeBuild}
                  onChange={(e) => setForm((f) => ({ ...f, minNativeBuild: Number(e.target.value) || 1 }))}
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                />
                <span className="text-xs text-foreground/60">
                  Devices below this build number are blocked until they install a newer APK.
                </span>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium">Latest APK download URL (HTTPS)</span>
                <input
                  type="url"
                  value={form.latestApkUrl || ""}
                  onChange={(e) => setForm((f) => ({ ...f, latestApkUrl: e.target.value.trim() || null }))}
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                  placeholder="https://github.com/Mr-Ninja1/ISO/releases/latest/download/iso-pro.apk"
                />
                <span className="text-xs text-foreground/60">
                  Download button on the mandatory update modal. Env fallback: NEXT_PUBLIC_ANDROID_APK_URL.
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-foreground/15 bg-foreground/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Zap className="h-4 w-4 text-[var(--hse-teal)]" />
              OTA web bundle (restart in app)
            </div>
            <p className="mt-1 text-xs text-foreground/65">
              Delivers JS/CSS updates inside existing APKs. Skipped automatically when the device build is below minimum native build.
            </p>
            <div className="mt-4 grid gap-4">
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
                <span className="font-medium">OTA manifest URL (HTTPS)</span>
                <input
                  type="url"
                  value={form.liveUpdateBundleUrl || ""}
                  onChange={(e) => setForm((f) => ({ ...f, liveUpdateBundleUrl: e.target.value.trim() || null }))}
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                  placeholder="https://isopro.me/ota/production/manifest.json"
                />
                <span className="text-xs text-foreground/60">
                  Public JSON with bundleId, bundleUrl, channel, and optional minNativeBuild.
                </span>
              </label>
            </div>
          </section>

          {form.updatedAt ? (
            <p className="text-xs text-foreground/55">Last saved: {new Date(form.updatedAt).toLocaleString()}</p>
          ) : null}

          {saved ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Platform settings saved (native APK + OTA). Installed apps pick this up on next open when online.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-4">
            <button
              type="button"
              disabled={saving || offline}
              onClick={() => void save()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save platform settings"}
            </button>
            <p className="w-full text-xs text-foreground/55 sm:w-auto sm:flex-1 sm:self-center">
              Saves native and OTA fields together. You can change only one section and still save.
            </p>
          </div>

          <div className="rounded-xl border border-foreground/15 bg-foreground/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Megaphone className="h-4 w-4" />
              Notify app users (optional)
            </div>
            <p className="mt-1 text-xs text-foreground/65">
              Separate from save above — sends an announcement. Default audience: installed app only.
            </p>
            <div className="mt-3 grid gap-2">
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm"
                placeholder="Title"
              />
              <AnnouncementAudienceField value={broadcastAudience} onChange={setBroadcastAudience} />
              <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="min-h-24 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
                placeholder="Message for app users"
              />
            </div>
            <button
              type="button"
              disabled={offline || broadcasting || !broadcastTitle.trim() || !broadcastMessage.trim()}
              onClick={() => void sendUpdateBroadcast()}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-foreground/20 px-4 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60"
            >
              {broadcasting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send broadcast (does not save settings)"
              )}
            </button>
            {broadcastOk ? (
              <p className="mt-2 text-xs text-emerald-800">Broadcast sent.</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3 text-xs text-foreground/70">
            <p className="font-medium text-foreground/85">When to change what</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                <strong>OTA only</strong> — update manifest URL after deploy; leave min native build unchanged.
              </li>
              <li>
                <strong>New APK</strong> — upload APK, set download URL + raise min native build to match the new APK build number.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
