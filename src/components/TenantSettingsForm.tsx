"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/auth";
import { enqueueBackgroundMutation } from "@/lib/client/backgroundMutationQueue";
import { NotificationModal } from "@/components/NotificationModal";

type Props = {
  tenant?: {
    id: string;
    name: string;
    logoUrl: string | null;
    slug?: string;
  };
  tenantSlug?: string;
};

export function TenantSettingsForm({ tenant, tenantSlug }: Props) {
  const router = useRouter();
  const [resolvedTenant, setResolvedTenant] = useState<{ id: string; name: string; logoUrl: string | null } | null>(
    tenant ? { id: tenant.id, name: tenant.name, logoUrl: tenant.logoUrl ?? null } : null
  );

  const [name, setName] = useState(resolvedTenant?.name || "");
  const [logoUrl, setLogoUrl] = useState(resolvedTenant?.logoUrl || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRemoveLogoOpen, setConfirmRemoveLogoOpen] = useState(false);

  // If server didn't provide `tenant`, try to resolve tenant from local workspace cache v2
  // so the Settings page can open even when the server DB is temporarily unreachable.
  // tenantSlug is provided by the page fallback.
  async function resolveTenantFromCache(tenantSlugProp?: string) {
    if (!tenantSlugProp) return null;
    try {
      // look for any workspace-cache:v2:*:tenantSlug:all
      const suffix = `:${tenantSlugProp}:all`;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith("workspace-cache:v2:") && key.endsWith(suffix)) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (!parsed?.data?.tenant) continue;
          const t = parsed.data.tenant;
          if (t?.id && t?.slug === tenantSlugProp) {
            return { id: t.id, name: t.name || "", logoUrl: t.logoUrl ?? null };
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  // If caller passed tenant prop later, seed resolvedTenant
  // Also try to resolve from cache when mounted.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (tenant && tenant.id) {
        if (!mounted) return;
        setResolvedTenant({ id: tenant.id, name: tenant.name, logoUrl: tenant.logoUrl ?? null });
        setName(tenant.name);
        setLogoUrl(tenant.logoUrl || "");
        return;
      }

      // tenant may be missing; attempt cache lookup using tenantSlug prop
      const slugToTry = tenantSlug || (tenant as any)?.slug || (window as any)?.CURRENT_TENANT_SLUG || undefined;
      if (!slugToTry) return;
      const fromCache = await resolveTenantFromCache(slugToTry);
      if (!fromCache) return;
      if (!mounted) return;
      setResolvedTenant(fromCache);
      setName(fromCache.name || "");
      setLogoUrl(fromCache.logoUrl || "");
    })();
    return () => {
      mounted = false;
    };
  }, [tenant]);

  async function getAccessToken() {
    const supabase = createClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    const token = session?.access_token;
    if (!token) throw new Error("Missing session token. Please log in again.");
    return token;
  }

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessage("");
    setUploadingLogo(true);

    try {
      const supabase = createClient();
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const tenantId = resolvedTenant?.id || tenant?.id;
      if (!tenantId) {
        setMessage("Tenant information not available yet. Try again when online.");
        setUploadingLogo(false);
        e.target.value = "";
        return;
      }
      const objectName = `${tenantId}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(objectName, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("logos").getPublicUrl(objectName);
      if (!data?.publicUrl) {
        throw new Error(
          "Logo uploaded, but could not generate a public URL. Ensure the `logos` bucket is public or add a signed URL flow."
        );
      }

      setLogoUrl(data.publicUrl);

      const accessToken = await getAccessToken();
      const tenantId2 = resolvedTenant?.id || tenant?.id;
      if (!tenantId2) throw new Error("Tenant information not available");
      const response = await fetch(`/api/tenants/${tenantId2}/update`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ logoUrl: data.publicUrl, name }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json = await response.json().catch(() => ({}));
          throw new Error(json.error || `Failed to save logo (${response.status})`);
        }
        const text = await response.text().catch(() => "");
        const snippet = text.replace(/\s+/g, " ").slice(0, 200);
        throw new Error(
          `Failed to save logo (${response.status}). Server returned non-JSON response: ${snippet || "(empty)"}`
        );
      }

      router.refresh();
      setMessage("Logo saved successfully!");
    } catch (error: any) {
      setMessage(error?.message || "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!logoUrl) return;

    setMessage("");
    setUploadingLogo(true);

    try {
      const accessToken = await getAccessToken();
      const tenantId = resolvedTenant?.id || tenant?.id;
      if (!tenantId) {
        // No tenant id yet - queue a pending update keyed by slug so background sync
        // can attempt to resolve the tenant later.
        enqueueBackgroundMutation({
          url: `/api/tenants/update-pending`,
          method: "POST",
          body: { tenantSlug: tenantSlug || (tenant as any)?.slug, logoUrl: null, name },
        });
        setLogoUrl("");
        setMessage("Offline: change queued and will sync automatically when tenant info is available.");
        return;
      }

      if (!navigator.onLine) {
        enqueueBackgroundMutation({
          url: `/api/tenants/${tenantId}/update`,
          method: "POST",
          body: { logoUrl: null, name },
          dedupeKey: `tenant-update:${tenantId}`,
        });
        setLogoUrl("");
        setMessage("Offline: change queued and will sync automatically.");
        return;
      }

      const response = await fetch(`/api/tenants/${tenantId}/update`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ logoUrl: null, name }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json = await response.json().catch(() => ({}));
          throw new Error(json.error || `Failed to remove logo (${response.status})`);
        }
        const text = await response.text().catch(() => "");
        const snippet = text.replace(/\s+/g, " ").slice(0, 200);
        throw new Error(
          `Failed to remove logo (${response.status}). Server returned non-JSON response: ${snippet || "(empty)"}`
        );
      }

      setLogoUrl("");
      router.refresh();
      setMessage("Logo removed.");
    } catch (error: any) {
      const msg = String(error?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        const tenantId = resolvedTenant?.id || tenant?.id;
        if (tenantId) {
          enqueueBackgroundMutation({
            url: `/api/tenants/${tenantId}/update`,
            method: "POST",
            body: { logoUrl: null, name },
            dedupeKey: `tenant-update:${tenantId}`,
          });
        } else {
          enqueueBackgroundMutation({
            url: `/api/tenants/update-pending`,
            method: "POST",
            body: { tenantSlug: tenantSlug || (tenant as any)?.slug, logoUrl: null, name },
          });
        }
        setLogoUrl("");
        setMessage("Offline: change queued and will sync automatically.");
      } else {
        setMessage(error?.message || "Failed to remove logo");
      }
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      const tenantId = resolvedTenant?.id || tenant?.id;
      if (!navigator.onLine) {
        if (tenantId) {
          enqueueBackgroundMutation({
            url: `/api/tenants/${tenantId}/update`,
            method: "POST",
            body: { name, logoUrl },
            dedupeKey: `tenant-update:${tenantId}`,
          });
        } else {
          enqueueBackgroundMutation({
            url: `/api/tenants/update-pending`,
            method: "POST",
            body: { tenantSlug: tenantSlug || (tenant as any)?.slug, name, logoUrl },
          });
        }
        setMessage("Offline: settings queued and will sync automatically.");
        return;
      }

      if (!tenantId) throw new Error("Tenant information not available");

      const response = await fetch(`/api/tenants/${tenantId}/update`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name, logoUrl }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Update failed (${response.status})`);
        }
        const text = await response.text().catch(() => "");
        const snippet = text.replace(/\s+/g, " ").slice(0, 200);
        throw new Error(
          `Update failed (${response.status}). Server returned non-JSON response: ${snippet || "(empty)"}`
        );
      }

      setMessage("Settings updated successfully!");
      router.refresh();
      setTimeout(() => setMessage(""), 3000);
    } catch (error: any) {
      const msg = String(error?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        const tenantId = resolvedTenant?.id || tenant?.id;
        if (tenantId) {
          enqueueBackgroundMutation({
            url: `/api/tenants/${tenantId}/update`,
            method: "POST",
            body: { name, logoUrl },
            dedupeKey: `tenant-update:${tenantId}`,
          });
        } else {
          enqueueBackgroundMutation({
            url: `/api/tenants/update-pending`,
            method: "POST",
            body: { tenantSlug: tenantSlug || (tenant as any)?.slug, name, logoUrl },
          });
        }
        setMessage("Offline: settings queued and will sync automatically.");
      } else {
        setMessage(error.message || "Update failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="rounded-md border border-foreground/20 p-6 space-y-4">
        <h3 className="font-semibold">Brand Details</h3>

        <div className="space-y-2">
          <label className="text-sm font-medium">Brand Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2"
            placeholder="Your Brand Name"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Logo Upload</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleLogoFileChange}
            disabled={uploadingLogo}
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2"
          />
          <p className="text-xs text-foreground/50">
            Uploads to Supabase Storage bucket <span className="font-mono">logos</span>
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Logo URL</label>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2"
            placeholder="https://example.com/logo.png"
          />
          <p className="text-xs text-foreground/50">
            This is saved on the brand and used in navigation.
          </p>
          {logoUrl && (
            <div className="mt-3">
              <p className="text-sm font-medium mb-2">Preview:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo preview" className="h-16 w-16 object-contain" />
              <button
                type="button"
                onClick={() => setConfirmRemoveLogoOpen(true)}
                disabled={uploadingLogo}
                className="mt-3 rounded-md border border-foreground/20 px-3 py-2 text-sm"
              >
                {uploadingLogo ? "Working..." : "Remove Logo"}
              </button>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.includes("success")
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || uploadingLogo}
        className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save Settings"}
      </button>
      </form>
      <NotificationModal
        open={confirmRemoveLogoOpen}
        title="Remove logo?"
        message="This will remove the current brand logo from settings."
        tone="warning"
        actionLabel="Remove"
        actionTone="danger"
        onAction={async () => {
          setConfirmRemoveLogoOpen(false);
          await handleRemoveLogo();
        }}
        onClose={() => setConfirmRemoveLogoOpen(false)}
      />
    </>
  );
}
