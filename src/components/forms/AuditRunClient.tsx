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
import { apiUrl } from "@/lib/client/apiBase";

function normalizeTenantSlug(value: string | null | undefined) {
  const slug = (value || "").trim();
  if (!slug || slug === "_" || slug === "workspace") return "";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return "";
  return slug;
}

function resolveTenantSlug(value: string) {
  const normalized = normalizeTenantSlug(value);
  if (normalized) return normalized;
  if (typeof window !== "undefined") {
    return normalizeTenantSlug(localStorage.getItem("lastTenantSlug"));
  }
  return "";
}

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
      idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(task, { timeout: 1200 });
      return;
    }
    task();
  }, delayMs);

  return () => {
    window.clearTimeout(timeoutId);
    if (idleId !== null && "cancelIdleCallback" in window) {
      (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
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
  const activeTenantSlug = resolveTenantSlug(tenantSlug);

  const [data, setData] = useState<AuditTemplatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revalidateTick, setRevalidateTick] = useState(0);
  const [durableCacheChecked, setDurableCacheChecked] = useState(false);
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
    }

    (async () => {
      const fromDb = await readAuditTemplateCacheAsync(activeTenantSlug, templateId);
      if (!alive) return;
      if (fromDb) {
        setData(fromDb);
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

    if (cached && shouldSkipTemplateRevalidate(activeTenantSlug, templateId, 5 * 60_000)) {
      return;
    }

    const runRevalidate = () => {
      const url = new URL(apiUrl("/api/audit/template"));
      url.searchParams.set("tenantSlug", activeTenantSlug);
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
            throw new Error((json as { error?: string })?.error || `Failed to load form (${res.status})`);
          }
          return json as AuditTemplatePayload;
        })
        .then((next) => {
          const shouldUpdate =
            !cached ||
            cached.template.updatedAt !== next.template.updatedAt ||
            cached.template.title !== next.template.title;
          if (shouldUpdate) setData(next);
          writeAuditTemplateCache(activeTenantSlug, templateId, next);
          markTemplateRevalidated(activeTenantSlug, templateId);
          setError("");
        })
        .catch((err: unknown) => {
          if (!cached && !data) {
            setError(err instanceof Error ? err.message : "Unable to load form");
          }
        })
        .finally(() => setLoading(false));
    };

    if (cached || data) {
      const cancel = scheduleBackgroundTask(runRevalidate, 900);
      return cancel;
    }

    runRevalidate();
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
        tenantSlug={activeTenantSlug}
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
