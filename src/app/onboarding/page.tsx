"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/auth";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  if (authLoading) return <div className="flex min-h-dvh items-center justify-center">Loading...</div>;

  if (user && !session) {
    return <div className="flex min-h-dvh items-center justify-center">Preparing your session...</div>;
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();

      const accessToken = freshSession?.access_token ?? session?.access_token;
      if (!accessToken) {
        throw new Error("Your session isn’t ready yet. Please wait a moment and try again.");
      }
      const response = await fetch("/api/tenants/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Failed to create tenant (${response.status})`);
        }

        const text = await response.text().catch(() => "");
        const snippet = text.replace(/\s+/g, " ").slice(0, 200);
        throw new Error(
          `Failed to create tenant (${response.status}). Server returned non-JSON response: ${snippet || "(empty)"}`
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text().catch(() => "");
        const snippet = text.replace(/\s+/g, " ").slice(0, 200);
        throw new Error(
          `Unexpected response from server (expected JSON): ${snippet || "(empty)"}`
        );
      }

      const { slug } = await response.json();
      try {
        localStorage.setItem("lastTenantSlug", slug);
      } catch {
        // ignore
      }
      router.push(`/workspace?tenantSlug=${encodeURIComponent(slug)}`);
    } catch (err: any) {
      setError(err.message || "Failed to create tenant");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="w-full space-y-2">
        <h1 className="text-2xl font-bold">Create Your Brand</h1>
        <p className="text-sm text-foreground/70">
          Enter your brand/company name to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Brand/Company Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2"
            placeholder="Acme Foods"
          />
          <p className="text-xs text-foreground/50">This is your brand display name</p>
        </div>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Brand"}
        </button>
      </form>
    </div>
  );
}
