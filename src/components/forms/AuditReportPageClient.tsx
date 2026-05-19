"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuditReportDisplay } from "@/components/forms/AuditReportDisplay";
import { ReportSnapshotCacheWriter } from "@/components/forms/ReportSnapshotCacheWriter";
import { apiUrl } from "@/lib/client/apiBase";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { auditIdFromPathname, useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import type { FormSchemaV1 } from "@/types/forms";

export type AuditReportData = {
  id: string;
  status: string;
  createdAt: string;
  payload: Record<string, unknown>;
  tenant: { name: string; slug: string; logoUrl: string | null };
  template: { title: string; schema: FormSchemaV1 | null };
};

export function AuditReportPageClient({
  routeSlug,
  routeAuditId,
}: {
  routeSlug: string;
  routeAuditId: string;
}) {
  const pathname = usePathname();
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const auditId = useMemo(() => {
    const fromPath = auditIdFromPathname(pathname);
    if (fromPath) return fromPath;
    if (routeAuditId && routeAuditId !== "_") return routeAuditId;
    return "";
  }, [pathname, routeAuditId]);

  const { session } = useAuth();
  const offline = useAppOffline();
  const accessToken = session?.access_token || "";

  const [audit, setAudit] = useState<AuditReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantSlug || !auditId) {
      setLoading(false);
      setError("Invalid report link.");
      return;
    }

    try {
      const raw = localStorage.getItem(`audit-report-snapshot:v1:${tenantSlug}:${auditId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          title?: string;
          status?: string;
          createdAt?: string;
          tenantName?: string;
          payload?: Record<string, unknown>;
        };
        if (parsed?.payload) {
          setAudit({
            id: auditId,
            status: parsed.status || "SUBMITTED",
            createdAt: parsed.createdAt || new Date().toISOString(),
            payload: parsed.payload,
            tenant: { name: parsed.tenantName || tenantSlug, slug: tenantSlug, logoUrl: null },
            template: { title: parsed.title || "Form", schema: null },
          });
        }
      }
    } catch {
      // ignore cache read errors
    }
  }, [tenantSlug, auditId]);

  useEffect(() => {
    if (!tenantSlug || !auditId || !accessToken) {
      if (!accessToken) setLoading(false);
      return;
    }
    if (offline) {
      setLoading(false);
      if (!audit) setError("Connect to the internet to load this report, or open it once while online.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const url = new URL(apiUrl("/api/audit/report"));
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("auditId", auditId);

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Failed to load report (${res.status})`);
        return json as { audit?: AuditReportData };
      })
      .then((json) => {
        if (cancelled || !json.audit) return;
        const next = {
          ...json.audit,
          payload:
            json.audit.payload && typeof json.audit.payload === "object" && !Array.isArray(json.audit.payload)
              ? (json.audit.payload as Record<string, unknown>)
              : {},
          template: {
            title: json.audit.template?.title || "Form",
            schema: (json.audit.template?.schema as FormSchemaV1 | null) ?? null,
          },
        };
        setAudit(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load report";
        if (!audit) setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, auditId, accessToken, offline, audit]);

  if (!tenantSlug || !auditId) {
    return (
      <div className="rounded-md border border-foreground/20 p-4 text-sm">
        <p>Report link is incomplete.</p>
        <Link href="/workspace" className="mt-2 inline-block underline">
          Back to workspace
        </Link>
      </div>
    );
  }

  if (loading && !audit) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-4 text-sm text-foreground/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading report...
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          {error || "Report not available on this device yet."}
        </div>
        <Link href={`/${tenantSlug}/audits`} className="text-sm underline">
          Back to stored forms
        </Link>
      </div>
    );
  }

  const schema = audit.template.schema;
  const title = schema?.title || audit.template.title;

  return (
    <div className="flex flex-col gap-4">
      <ReportSnapshotCacheWriter
        tenantSlug={tenantSlug}
        auditId={auditId}
        title={title}
        status={audit.status}
        createdAt={audit.createdAt}
        tenantName={audit.tenant.name}
        payload={audit.payload}
      />
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/${tenantSlug}/audits`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
        >
          Back to stored forms
        </Link>
        <Link
          href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
        >
          Workspace
        </Link>
      </div>
      <AuditReportDisplay audit={audit} tenantSlug={tenantSlug} auditId={auditId} />
    </div>
  );
}
