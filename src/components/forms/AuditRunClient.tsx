"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { FormRenderer } from "@/components/forms/FormRenderer";
import {
  type AuditTemplatePayload,
  readAuditTemplateCache,
  readAuditTemplateCacheAsync,
  writeAuditTemplateCache,
} from "@/lib/client/auditTemplateCache";
import { isAppOffline } from "@/lib/client/appOffline";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { apiUrl } from "@/lib/client/apiBase";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";

export function AuditRunClient({
  tenantSlug,
  templateId,
  auditId,
}: {
  tenantSlug: string;
  templateId: string;
  auditId?: string;
}) {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token || "";
  const activeTenantSlug = useResolvedTenantSlug(tenantSlug);

  const [data, setData] = useState<AuditTemplatePayload | null>(() =>
    tenantSlug && templateId ? readAuditTemplateCache(tenantSlug, templateId) : null
  );
  // Only show a loader for a true network miss — sync cache hits and IDB checks stay quiet.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revalidateTick, setRevalidateTick] = useState(0);
  const revalidateGenerationRef = useRef(0);
  const [durableCacheChecked, setDurableCacheChecked] = useState(
    () => Boolean(tenantSlug && templateId && readAuditTemplateCache(tenantSlug, templateId))
  );
  const offlineFromHook = useAppOffline();

  // Hydrate from localStorage + IndexedDB before deciding the user must sign in again.
  useEffect(() => {
    if (!activeTenantSlug || !templateId) return;
    let alive = true;

    const cached = readAuditTemplateCache(activeTenantSlug, templateId);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError("");
      setDurableCacheChecked(true);
      return;
    }

    (async () => {
      const fromDb = await readAuditTemplateCacheAsync(activeTenantSlug, templateId);
      if (!alive) return;
      if (fromDb) {
        setData(fromDb);
        writeAuditTemplateCache(activeTenantSlug, templateId, fromDb);
        setLoading(false);
        setError("");
      }
      setDurableCacheChecked(true);
    })();

    return () => {
      alive = false;
    };
  }, [activeTenantSlug, templateId]);

  useEffect(() => {
    if (!authLoading && !user && !data) {
      router.push("/login");
    }
  }, [authLoading, user, router, data]);

  useEffect(() => {
    const onOnline = () => setRevalidateTick((x) => x + 1);
    const onFocus = () => {
      if (!isAppOffline()) setRevalidateTick((x) => x + 1);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !isAppOffline()) {
        setRevalidateTick((x) => x + 1);
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!activeTenantSlug || !templateId) return;

    const generation = ++revalidateGenerationRef.current;
    const controller = new AbortController();
    let active = true;

    const cached = data ?? readAuditTemplateCache(activeTenantSlug, templateId);

    if (authLoading) return;

    if (!user) {
      if (!cached && durableCacheChecked) {
        setLoading(false);
      }
      return;
    }

    // Signed-in user with cached schema: open immediately without a live access token (offline / slow session restore).
    if (!accessToken) {
      if (cached || data) {
        setLoading(false);
        setError("");
        return;
      }
      if (!durableCacheChecked) return;
      setLoading(false);
      if (offlineFromHook || isAppOffline()) {
        setError("This form is not cached on this device yet. Open it once while online to use it offline.");
      } else {
        setError("Still restoring your session. Go back to workspace and try again, or sign in once while online.");
      }
      return;
    }

    if (!cached && !data) {
      setLoading(true);
    }

    if (offlineFromHook || isAppOffline()) {
      if (!cached && !data) {
        setLoading(false);
        setError("This form is not cached on this device yet. Open it once while online to use it offline.");
      }
      return;
    }

    // Cached schemas are authoritative for normal opens. Remote metadata checks
    // and explicit workspace refresh handle cross-device changes without slowing
    // the form interaction path with a live schema request.
    if (cached) {
      return;
    }

    const runRevalidate = () => {
      const url = new URL(apiUrl("/api/audit/template"));
      url.searchParams.set("tenantSlug", activeTenantSlug);
      url.searchParams.set("templateId", templateId);

      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error((json as { error?: string })?.error || `Failed to load form (${res.status})`);
          }
          return json as AuditTemplatePayload;
        })
        .then((next) => {
          if (!active || generation !== revalidateGenerationRef.current) return;
          setData(next);
          writeAuditTemplateCache(activeTenantSlug, templateId, next);
          setError("");
        })
        .catch((err: unknown) => {
          if (!active || generation !== revalidateGenerationRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (!cached && !data) {
            setError(err instanceof Error ? err.message : "Unable to load form");
          }
        })
        .finally(() => {
          if (active && generation === revalidateGenerationRef.current) setLoading(false);
        });
    };

    runRevalidate();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    authLoading,
    user,
    accessToken,
    activeTenantSlug,
    templateId,
    revalidateTick,
    offlineFromHook,
    data,
    durableCacheChecked,
  ]);

  useEffect(() => {
    if (!loading) return;
    const timeoutId = window.setTimeout(() => {
      setLoading(false);
      if (!data) {
        setError((prev) => prev || "Form is taking longer than expected. Check your connection and try again.");
      }
    }, 12_000);
    return () => window.clearTimeout(timeoutId);
  }, [loading, data, activeTenantSlug, templateId]);

  const content = useMemo(() => {
    if (data) {
      return (
        <FormRenderer
          tenantSlug={activeTenantSlug}
          tenantName={data.tenant.name}
          tenantLogoUrl={data.tenant.logoUrl}
          templateId={data.template.id}
          initialAuditId={auditId}
          schema={data.template.schema}
        />
      );
    }

    // Quiet while IndexedDB is still resolving — avoid a loading banner on cache-backed opens.
    if (!durableCacheChecked) {
      return null;
    }

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

    return (
      <div className="rounded-lg border border-foreground/20 bg-background p-6 text-sm">
        {error || "Form not found"}
      </div>
    );
  }, [loading, data, error, activeTenantSlug, auditId, durableCacheChecked]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-24 sm:pb-6">
      <p className="text-sm text-[var(--hse-teal-mid)]">Complete the form and submit.</p>
      {content}
    </div>
  );
}
