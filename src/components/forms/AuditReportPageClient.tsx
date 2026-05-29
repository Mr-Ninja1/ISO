"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PdfGeneratorButton } from "@/components/forms/PdfGeneratorButton";
import { collectReportEvidencePhotos } from "@/lib/reportEvidence";
import { useAuth } from "@/components/AuthProvider";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import type { AuditReportData } from "@/types/auditReport";
import { AuditReportDisplay } from "@/components/forms/AuditReportDisplay";
import { ReportSnapshotCacheWriter } from "@/components/forms/ReportSnapshotCacheWriter";
import { apiUrl } from "@/lib/client/apiBase";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { resolveAuditId, resolveTenantSlug } from "@/lib/client/resolveTenantSlug";
import { buildAuditReportHref, buildTenantHref } from "@/lib/client/tenantHref";
import {
  buildReportFromDeviceStores,
  enrichReportWithCachedTemplateSchema,
  parseReportSnapshotFromLocalStorage,
} from "@/lib/client/loadLocalAuditReport";
import type { FormSchemaV1 } from "@/types/forms";
import { normalizeFormSchema } from "@/lib/normalizeFormSchema";

export type { AuditReportData };

export function AuditReportPageClient({
  routeSlug,
  routeAuditId,
}: {
  routeSlug: string;
  routeAuditId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantSlug = useMemo(
    () =>
      resolveTenantSlug({
        routeParam: routeSlug,
        pathname,
        querySlug: searchParams.get("tenantSlug"),
      }),
    [routeSlug, pathname, searchParams]
  );
  const auditId = useMemo(() => {
    const resolved = resolveAuditId(pathname, searchParams.toString());
    if (resolved) return resolved;
    const fromQuery = (searchParams.get("auditId") || "").trim();
    if (fromQuery && fromQuery !== "_") return fromQuery;
    if (routeAuditId && routeAuditId !== "_") return routeAuditId;
    return "";
  }, [pathname, searchParams, routeAuditId]);

  const { session } = useAuth();
  const offline = useAppOffline();
  const accessToken = getWorkspaceAccessToken(session);

  const [audit, setAudit] = useState<AuditReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantSlug || !auditId) {
      setLoading(false);
      setError("Invalid report link.");
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError("");

      const fromStorage = parseReportSnapshotFromLocalStorage(tenantSlug, auditId);
      const fromDevice = (await buildReportFromDeviceStores(tenantSlug, auditId)) ?? null;
      let localDisplayable = Boolean(fromStorage || fromDevice);

      const applyLocal = async (row: AuditReportData | null) => {
        if (!row || cancelled) return;
        const enriched = await enrichReportWithCachedTemplateSchema(tenantSlug, row.templateId, row);
        setAudit(enriched);
      };

      if (fromStorage) await applyLocal(fromStorage);
      if (!cancelled && fromDevice && (!fromStorage || !fromStorage.template?.schema)) {
        await applyLocal(fromDevice);
      }

      if (offline || !accessToken) {
        if (!cancelled) {
          setLoading(false);
          if (!localDisplayable) {
            setError("This form is not available offline on this device. Open it once while online after submitting, or stay offline and open it right after you submit.");
          }
        }
        return;
      }

      try {
        const url = new URL(apiUrl("/api/audit/report"));
        url.searchParams.set("tenantSlug", tenantSlug);
        url.searchParams.set("auditId", auditId);

        const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
        const json = (await res.json().catch(() => ({}))) as { audit?: AuditReportData & { templateId?: string }; error?: string };
        if (!res.ok) {
          throw new Error(json?.error || `Failed to load report (${res.status})`);
        }
        if (cancelled || !json.audit) {
          if (!localDisplayable) throw new Error("Report data missing from server.");
          return;
        }

        localDisplayable = true;
        const next: AuditReportData = {
          ...json.audit,
          templateId: json.audit.templateId,
          payload:
            json.audit.payload && typeof json.audit.payload === "object" && !Array.isArray(json.audit.payload)
              ? (json.audit.payload as Record<string, unknown>)
              : {},
          template: {
            title: json.audit.template?.title || "Form",
            schema: (json.audit.template?.schema as FormSchemaV1 | null) ?? null,
          },
        };

        const withSchema =
          next.template.schema || !next.templateId
            ? next
            : await enrichReportWithCachedTemplateSchema(tenantSlug, next.templateId, next);

        if (!cancelled) {
          setAudit(withSchema);
          setError("");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load report";
        if (!localDisplayable) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, auditId, accessToken, offline]);

  const schemaReady = useMemo(() => {
    if (!audit?.template?.schema) return false;
    const normalized = normalizeFormSchema(audit.template.schema);
    return Boolean(normalized.sections?.length || normalized.fields?.length);
  }, [audit]);

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
        Loading report…
      </div>
    );
  }

  if (audit && !schemaReady) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-4 text-sm text-foreground/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing report…
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          {error || "Report not available on this device yet."}
        </div>
        <Link href={buildTenantHref(tenantSlug, "audits")} className="text-sm underline">
          Back to stored forms
        </Link>
      </div>
    );
  }

  const schema = audit.template.schema;
  const title = schema?.title || audit.template.title;
  const evidencePhotos = collectReportEvidencePhotos(schema, audit.payload);

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
          href={buildTenantHref(tenantSlug, "audits")}
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
        <PdfGeneratorButton
          formTitle={title}
          tenantSlug={tenantSlug}
          evidencePhotos={evidencePhotos}
        />
      </div>
      <AuditReportDisplay audit={audit} tenantSlug={tenantSlug} auditId={auditId} />
    </div>
  );
}
