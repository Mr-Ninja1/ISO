"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/auth";
import { AuthPageShell } from "@/components/AuthPageShell";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn(email, password);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token || "";
      if (accessToken) {
        const verifyRes = await fetch("/api/staff/verify-pin", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
            body: JSON.stringify({}),
        });

        const verifyJson = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok) {
          throw new Error(verifyJson?.error || "PIN verification failed");
        }

        try {
          localStorage.setItem(
            "active-staff-profile:v1",
            JSON.stringify({
              tenantSlug: verifyJson?.tenantSlug || null,
              name: verifyJson?.staffName || null,
              email: verifyJson?.staffEmail || email,
              userId: session?.user?.id || null,
              ts: Date.now(),
            })
          );
        } catch {
          // ignore local storage failures
        }

        const tenantSlug = typeof verifyJson?.tenantSlug === "string" ? verifyJson.tenantSlug : "";
        if (tenantSlug) {
          router.push(`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`);
          return;
        }
      }

      // Redirect to workspace after login
      router.push("/workspace");
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Secure access"
      title="Sign in to your operational workspace."
      subtitle="Open your brand, continue drafts, review saved forms, and keep the workspace synced across devices."
      formTitle="Welcome back"
      formSubtitle="Enter your credentials to continue"
      footerText="Need an account?"
      footerHref="/signup"
      footerLabel="Create one"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground/80">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
            placeholder="your@email.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground/80">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 font-medium text-background shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </AuthPageShell>
  );
}
