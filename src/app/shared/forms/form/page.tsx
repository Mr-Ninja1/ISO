"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuditReportDisplay } from "@/components/forms/AuditReportDisplay";
import { apiUrl } from "@/lib/client/apiBase";
import type { AuditReportData } from "@/types/auditReport";

function SharedFormViewer() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const auditId = (searchParams.get("auditId") || "").trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<AuditReportData | null>(null);

  useEffect(() => {
    if (!token || !auditId) {
      setAudit(null);
      setError("This shared form link is incomplete.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const url = new URL(apiUrl("/api/shared/forms/item"));
        url.searchParams.set("token", token);
        url.searchParams.set("auditId", auditId);
        const res = await fetch(url.toString());
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          audit?: AuditReportData;
        };
        if (!res.ok || !json.audit) {
          throw new Error(json.error || `Failed to load shared form (${res.status})`);
        }
        if (cancelled) return;
        setAudit(json.audit);
      } catch (err: unknown) {
        if (cancelled) return;
        setAudit(null);
        setError(err instanceof Error ? err.message : "Failed to load shared form");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, auditId]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center gap-2 p-6 text-sm text-foreground/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading shared form…
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <div className="rounded-xl border border-foreground/15 bg-background p-4 text-sm text-foreground/70">
          {error || "This shared form could not be opened."}
        </div>
        <Link href={token ? `/shared/forms?token=${encodeURIComponent(token)}` : "/shared/forms"} className="text-sm underline">
          Back to shared forms
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="print:hidden">
        <Link
          href={`/shared/forms?token=${encodeURIComponent(token)}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
        >
          Back to shared forms
        </Link>
      </div>
      <AuditReportDisplay audit={audit} tenantSlug={audit.tenant.slug} auditId={audit.id} />
    </div>
  );
}

export default function SharedFormPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-4xl items-center gap-2 p-6 text-sm text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading shared form…
        </div>
      }
    >
      <SharedFormViewer />
    </Suspense>
  );
}
