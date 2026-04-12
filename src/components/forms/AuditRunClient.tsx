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

  const [data, setData] = useState<AuditTemplatePayload | null>(() => {
    if (typeof window === "undefined") return null;
    if (!tenantSlug || !templateId) return null;
    return readAuditTemplateCache(tenantSlug, templateId);
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    if (!tenantSlug || !templateId) return true;
    return !Boolean(readAuditTemplateCache(tenantSlug, templateId));
  });
  const [error, setError] = useState("");
  const [revalidateTick, setRevalidateTick] = useState(0);
  const [online, setOnline] = useState(true);

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
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    updateOnline();

    const onOnline = () => setRevalidateTick((x) => x + 1);
    const onFocus = () => setRevalidateTick((x) => x + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setRevalidateTick((x) => x + 1);
      }
    };

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
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

    // Offline-first: never call the API while offline.
    if (!online) {
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
  }, [authLoading, user, accessToken, tenantSlug, templateId, revalidateTick, online]);

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
