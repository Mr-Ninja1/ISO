"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/auth";

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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="w-full space-y-2">
        <h1 className="text-2xl font-bold">Sign In</h1>
        <p className="text-sm text-foreground/70">
          Access your food safety audit system
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2"
            placeholder="your@email.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="text-sm text-foreground/70">
        Don't have an account?{" "}
        <Link href="/signup" className="underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
