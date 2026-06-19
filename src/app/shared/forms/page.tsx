"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SharedFormsLandingClient } from "@/components/forms/SharedFormsLandingClient";
import { apiUrl } from "@/lib/client/apiBase";
import type { CachedAuditRow } from "@/lib/client/auditsListCache";
import type { SharedFormsLinkPayload } from "@/lib/sharedForms";

function SharedFormsViewer() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<SharedFormsLinkPayload | null>(null);
  const [rows, setRows] = useState<CachedAuditRow[]>([]);

  useEffect(() => {
    if (!token) {
      setPayload(null);
      setRows([]);
      setError("This shared forms link is invalid or missing its token.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const url = new URL(apiUrl("/api/shared/forms/by-token"));
        url.searchParams.set("token", token);
        const res = await fetch(url.toString());
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          share?: {
            title: string;
            mode: "selected" | "today" | "all";
            createdAt: string;
            tenant: { name: string; slug: string };
            rows: CachedAuditRow[];
          };
        };
        if (!res.ok || !json.share) {
          throw new Error(
            json.error || `Failed to load shared forms (${res.status})`,
          );
        }
        if (cancelled) return;
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
      } catch (err: unknown) {
        if (cancelled) return;
        setPayload(null);
        setRows([]);
        setError(
          err instanceof Error ? err.message : "Failed to load shared forms",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-sm text-foreground/70">
        Loading shared forms…
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <div className="rounded-xl border border-foreground/15 bg-background p-4 text-sm text-foreground/70">
          {error || "This shared forms link could not be opened."}
        </div>
        <Link href="/workspace" className="text-sm underline">
          Back to workspace
        </Link>
      </div>
    );
  }

  return <SharedFormsLandingClient payload={payload} rows={rows} />;
}

export default function SharedFormsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl p-6 text-sm text-foreground/70">
          Loading shared forms…
        </div>
      }
    >
      <SharedFormsViewer />
    </Suspense>
  );
}
