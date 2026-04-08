"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { FormRenderer } from "@/components/forms/FormRenderer";
import {
  type AuditTemplatePayload,
  readAuditTemplateCache,
  writeAuditTemplateCache,
} from "@/lib/client/auditTemplateCache";

export function AuditRunClient({
  tenantSlug,
  templateId,
}: {
  tenantSlug: string;
  templateId: string;
}) {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token || "";

  const [data, setData] = useState<AuditTemplatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fast path: show cached form schema immediately, even before auth/network settles.
  useEffect(() => {
    if (!tenantSlug || !templateId) return;
    const cached = readAuditTemplateCache(tenantSlug, templateId);
    if (cached) {
      setData(cached);
      setLoading(false);
    }
  }, [tenantSlug, templateId]);

  useEffect(() => {
    if (!authLoading && !user && !data) {
      router.push("/login");
    }
  }, [authLoading, user, router, data]);

  useEffect(() => {
    if (authLoading || !user || !accessToken) return;
    if (!tenantSlug || !templateId) return;

    const cached = readAuditTemplateCache(tenantSlug, templateId);
    if (cached) {
      // Fetch-once behavior: if schema exists in cache, do not re-download it.
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);

    const url = new URL("/api/audit/template", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("templateId", templateId);

    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Failed to load form (${res.status})`);
        return json as AuditTemplatePayload;
      })
      .then((next) => {
        setData(next);
        writeAuditTemplateCache(tenantSlug, templateId, next);
        setError("");
      })
      .catch((err: any) => {
        setError(err?.message || "Unable to load form");
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, accessToken, tenantSlug, templateId]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="rounded-lg border border-foreground/20 bg-background p-6">
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved form and draft...
          </div>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="rounded-lg border border-foreground/20 bg-background p-6 text-sm">
          {error || "Form not found"}
        </div>
      );
    }

    return (
      <FormRenderer
        tenantSlug={tenantSlug}
        tenantName={data.tenant.name}
        tenantLogoUrl={data.tenant.logoUrl}
        templateId={data.template.id}
        schema={data.template.schema}
      />
    );
  }, [loading, data, error, tenantSlug]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground/70">Complete the form and submit.</p>
      {content}
    </div>
  );
}
