"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SharedFormsLandingClient } from "@/components/forms/SharedFormsLandingClient";
import { apiUrl } from "@/lib/client/apiBase";
import { createClient } from "@/lib/auth";
import type { CachedAuditRow } from "@/lib/client/auditsListCache";
import type { SharedFormsLinkPayload } from "@/lib/sharedForms";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type SharedFormsConnectionState =
  | "connecting"
  | "live"
  | "offline"
  | "slow"
  | "unavailable";

type ShareResponse = {
  error?: string;
  share?: {
    title: string;
    tenantId: string;
    mode: "selected" | "today" | "all" | "live_today" | "live_all";
    createdAt: string;
    tenant: { name: string; slug: string };
    rows: CachedAuditRow[];
  };
};

function SharedFormsViewer() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<SharedFormsLinkPayload | null>(null);
  const [rows, setRows] = useState<CachedAuditRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connectionState, setConnectionState] =
    useState<SharedFormsConnectionState>("connecting");
  const [refreshing, setRefreshing] = useState(false);
  const tenantIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This shared forms link is invalid or missing its token.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadSharedForms(initial = false) {
      if (initial) setLoading(true);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const url = new URL(apiUrl("/api/shared/forms/by-token"));
        url.searchParams.set("token", token);
        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as ShareResponse;
        if (!res.ok || !json.share) {
          throw new Error(json.error || `Failed to load shared forms (${res.status})`);
        }
        if (cancelled) return;
        tenantIdRef.current = json.share.tenantId;
        setPayload({
          version: 1,
          tenantSlug: json.share.tenant.slug,
          tenantName: json.share.tenant.name,
          title: json.share.title,
          mode: json.share.mode,
          createdAt: json.share.createdAt,
          auditIds: json.share.rows.map((row) => row.id),
        });
        setRows(json.share.rows);
        setLastUpdated(new Date());
        setError("");
        setConnectionState("live");
      } catch (err: unknown) {
        if (cancelled) return;
        setConnectionState(
          navigator.onLine
            ? err instanceof DOMException && err.name === "AbortError"
              ? "slow"
              : "unavailable"
            : "offline",
        );
        if (initial) {
          setError(err instanceof Error ? err.message : "Failed to load shared forms");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadSharedForms(true);
    const refresh = () => {
      if (document.hidden || !navigator.onLine) return;
      setRefreshing(true);
      void loadSharedForms(false);
    };
    const onOnline = () => {
      setConnectionState("connecting");
      refresh();
    };
    const onOffline = () => setConnectionState("offline");
    window.addEventListener("shared-forms-refresh", refresh);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("shared-forms-refresh", refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [token]);

  useEffect(() => {
    if (!payload || !["live_today", "live_all"].includes(payload.mode)) return;
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    setConnectionState("connecting");
    channel = supabase
      .channel(`shared-forms-${payload.tenantSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_logs",
          filter: `tenant_id=eq.${tenantIdRef.current}`,
        },
        () => window.dispatchEvent(new Event("shared-forms-refresh")),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionState("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionState("unavailable");
        }
      });
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [payload]);

  if (loading) {
    return <div className="mx-auto max-w-2xl p-6 text-sm text-foreground/70">Loading shared forms…</div>;
  }
  if (!payload) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <div className="rounded-xl border border-foreground/15 bg-background p-4 text-sm text-foreground/70">{error || "This shared forms link could not be opened."}</div>
        <Link href="/workspace" className="text-sm underline">Back to workspace</Link>
      </div>
    );
  }

  return (
    <SharedFormsLandingClient
      payload={payload}
      rows={rows}
      lastUpdated={lastUpdated}
      connectionState={connectionState}
      refreshing={refreshing}
      onRefresh={() => window.dispatchEvent(new Event("shared-forms-refresh"))}
    />
  );
}

export default function SharedFormsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl p-6 text-sm text-foreground/70">Loading shared forms…</div>}>
      <SharedFormsViewer />
    </Suspense>
  );
}
