"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuthPageShell } from "@/components/AuthPageShell";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { userId } = await signUp(email, password);

      const bypassEmailConfirm =
        process.env.NEXT_PUBLIC_DEV_BYPASS_EMAIL_CONFIRMATION === "true";

      if (bypassEmailConfirm) {
        const confirmRes = await fetch("/api/dev/confirm-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, userId }),
        });

        if (!confirmRes.ok) {
          const text = await confirmRes.text();
          throw new Error(
            `Dev email confirm failed: ${text || confirmRes.statusText}`
          );
        }

        await signIn(email, password);
      }

      // Redirect to onboarding after signup
      router.push("/onboarding");
    } catch (err: any) {
      setError(err.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Start here"
      title="Create an account for your audit workflow."
      subtitle="Set up secure access for your team, then create brands, categories, and offline-ready forms."
      formTitle="Create account"
      formSubtitle="Get started in a few minutes"
      footerText="Already have an account?"
      footerHref="/login"
      footerLabel="Sign in"
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
          {loading ? "Creating..." : "Create Account"}
        </button>
      </form>
    </AuthPageShell>
  );
}
