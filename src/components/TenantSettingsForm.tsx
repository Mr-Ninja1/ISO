"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/auth";
import { enqueueBackgroundMutation } from "@/lib/client/backgroundMutationQueue";
import { NotificationModal } from "@/components/NotificationModal";

type Props = {
  tenant: {
    id: string;
    name: string;
    logoUrl: string | null;
    slug?: string;
  };
};

export function TenantSettingsForm({ tenant }: Props) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRemoveLogoOpen, setConfirmRemoveLogoOpen] = useState(false);

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
      const objectName = `${tenant.id}/${crypto.randomUUID()}.${fileExt}`;

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
      const response = await fetch(`/api/tenants/${tenant.id}/update`, {
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
      if (!navigator.onLine) {
        enqueueBackgroundMutation({
          url: `/api/tenants/${tenant.id}/update`,
          method: "POST",
          body: { logoUrl: null, name },
          dedupeKey: `tenant-update:${tenant.id}`,
        });
        setLogoUrl("");
        setMessage("Offline: change queued and will sync automatically.");
        return;
      }

      const response = await fetch(`/api/tenants/${tenant.id}/update`, {
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
        enqueueBackgroundMutation({
          url: `/api/tenants/${tenant.id}/update`,
          method: "POST",
          body: { logoUrl: null, name },
          dedupeKey: `tenant-update:${tenant.id}`,
        });
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
      if (!navigator.onLine) {
        enqueueBackgroundMutation({
          url: `/api/tenants/${tenant.id}/update`,
          method: "POST",
          body: { name, logoUrl },
          dedupeKey: `tenant-update:${tenant.id}`,
        });
        setMessage("Offline: settings queued and will sync automatically.");
        return;
      }

      const response = await fetch(`/api/tenants/${tenant.id}/update`, {
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
        enqueueBackgroundMutation({
          url: `/api/tenants/${tenant.id}/update`,
          method: "POST",
          body: { name, logoUrl },
          dedupeKey: `tenant-update:${tenant.id}`,
        });
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
