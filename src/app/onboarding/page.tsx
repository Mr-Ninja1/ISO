"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/auth";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { apiUrl } from "@/lib/client/apiBase";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const supabase = createClient();

  if (authLoading) {
    return <AppLoadingScreen title="Loading" subtitle="Checking your account…" />;
  }

  if (user && !session) {
    return <AppLoadingScreen title="Preparing session" subtitle="Finalizing sign-in…" />;
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch {
      setSigningOut(false);
    }
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
        throw new Error("Your session is not ready yet. Wait a moment and try again.");
      }

      const response = await fetch(apiUrl("/api/tenants/create"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Failed to create brand (${response.status})`);
        }
        const text = await response.text().catch(() => "");
        throw new Error(`Failed to create brand (${response.status}). ${text.slice(0, 120)}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Unexpected response from server. Please try again.");
      }

      const { slug } = await response.json();
      try {
        localStorage.setItem("lastTenantSlug", slug);
      } catch {
        // ignore
      }
      router.push(`/workspace/forms?tenantSlug=${encodeURIComponent(slug)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create brand");
    } finally {
      setLoading(false);
    }
  }

  const accountLabel = user.email?.trim() || "Your account";

  return (
    <div className="create-brand-page min-h-dvh">
      <header className="create-brand-page__header">
        <div className="create-brand-page__header-inner">
          <span className="create-brand-page__logo">ISO Pro</span>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[12rem] truncate text-xs text-[var(--accent-soft)] sm:inline">
              {accountLabel}
            </span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut || loading}
              className="create-brand-page__sign-out"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main className="create-brand-page__main">
        <div className="create-brand-page__card">
          <div className="create-brand-page__icon" aria-hidden>
            <Building2 className="h-6 w-6" strokeWidth={1.75} />
          </div>

          <h1 className="create-brand-page__title">Create your brand</h1>
          <p className="create-brand-page__lead">
            Add your organisation name to open your workspace. You can invite your team and add a logo
            later.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-[var(--hse-charcoal)]">
                Brand or organisation name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                disabled={loading || signingOut}
                className="create-brand-page__input"
                placeholder="e.g. Acme Site Services"
                autoComplete="organization"
                autoFocus
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading || signingOut || name.trim().length < 2}
              className="ws-btn-primary inline-flex h-12 w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {loading ? "Creating…" : "Continue"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
