"use client";

import { useEffect, useMemo, useState } from "react";
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

function templateRevalidateCooldownKey(tenantSlug: string, templateId: string) {
  return `audit-template-revalidate-cooldown:v1:${tenantSlug}:${templateId}`;
}

function shouldSkipTemplateRevalidate(tenantSlug: string, templateId: string, ttlMs: number) {
  try {
    const raw = localStorage.getItem(templateRevalidateCooldownKey(tenantSlug, templateId));
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < ttlMs;
  } catch {
    return false;
  }
}

function markTemplateRevalidated(tenantSlug: string, templateId: string) {
  try {
    localStorage.setItem(templateRevalidateCooldownKey(tenantSlug, templateId), String(Date.now()));
  } catch {
    // ignore
  }
}

function scheduleBackgroundTask(task: () => void, delayMs: number) {
  let idleId: number | null = null;
  const timeoutId = window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      idleId = (window as any).requestIdleCallback(task, { timeout: 1200 });
      return;
    }
    task();
  }, delayMs);

  return () => {
    window.clearTimeout(timeoutId);
    if (idleId !== null && "cancelIdleCallback" in window) {
      (window as any).cancelIdleCallback(idleId);
    }
  };
}

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

  // Important: avoid reading localStorage during initial render.
  // Otherwise SSR renders "loading" but the client immediately renders the cached form,
  // triggering a hydration mismatch warning.
  const [data, setData] = useState<AuditTemplatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revalidateTick, setRevalidateTick] = useState(0);
  /** Named distinctly from `isAppOffline()` to avoid TDZ/minifier/HMR edge cases. */
  const offlineFromHook = useAppOffline();

  // Fast path: show cached form schema immediately, even before auth/network settles.
  useEffect(() => {
    if (!tenantSlug || !templateId) return;
    let alive = true;

    const cached = readAuditTemplateCache(tenantSlug, templateId);
    if (cached) {
      setData(cached);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    // Durable cache path (IndexedDB) – async after mount.
    (async () => {
      const fromDb = await readAuditTemplateCacheAsync(tenantSlug, templateId);
      if (!alive || !fromDb) return;
      setData(fromDb);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [tenantSlug, templateId]);

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
    if (authLoading || !user || !accessToken) return;
    if (!tenantSlug || !templateId) return;

    const cached = readAuditTemplateCache(tenantSlug, templateId);
    if (cached) {
      // Stale-while-revalidate: keep cached schema visible while refreshing quietly.
      setData(cached);
      setLoading(false);
      setError("");
    } else {
      setLoading(true);
    }

    // Offline-first: never call the API while offline (browser or shell-forced).
    if (offlineFromHook) {
      if (!cached) {
        setLoading(false);
        setError("This form is not cached on this device yet. Open it once while online to use it offline.");
      }
      return;
    }

    if (cached && shouldSkipTemplateRevalidate(tenantSlug, templateId, 5 * 60_000)) {
      return;
    }

    const runRevalidate = () => {
      const url = new URL("/api/audit/template", window.location.origin);
      url.searchParams.set("tenantSlug", tenantSlug);
      url.searchParams.set("templateId", templateId);

      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status === 401 && cached) {
              return cached;
            }
            throw new Error(json?.error || `Failed to load form (${res.status})`);
          }
          return json as AuditTemplatePayload;
        })
        .then((next) => {
          const shouldUpdate =
            !cached ||
            cached.template.updatedAt !== next.template.updatedAt ||
            cached.template.title !== next.template.title;
          if (shouldUpdate) setData(next);
          writeAuditTemplateCache(tenantSlug, templateId, next);
          markTemplateRevalidated(tenantSlug, templateId);
          setError("");
        })
        .catch((err: any) => {
          if (!cached) {
            setError(err?.message || "Unable to load form");
          }
        })
        .finally(() => setLoading(false));
    };

    if (cached) {
      const cancel = scheduleBackgroundTask(runRevalidate, 900);
      return cancel;
    }

    runRevalidate();
  }, [authLoading, user, accessToken, tenantSlug, templateId, revalidateTick, offlineFromHook]);

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
        initialAuditId={auditId}
        schema={data.template.schema}
      />
    );
  }, [loading, data, error, tenantSlug, auditId]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-24 sm:pb-6">
      <p className="text-sm text-foreground/70">Complete the form and submit.</p>
      {content}
    </div>
  );
}
