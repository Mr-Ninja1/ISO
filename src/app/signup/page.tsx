"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuthPageShell } from "@/components/AuthPageShell";
import { apiUrl } from "@/lib/client/apiBase";
import { emailVerificationRedirectUrl } from "@/lib/authRedirectUrls";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { userId } = await signUp(email, password, {
        emailRedirectTo: emailVerificationRedirectUrl(),
      });

      const bypassEmailConfirm =
        process.env.NEXT_PUBLIC_DEV_BYPASS_EMAIL_CONFIRMATION === "true";

      if (bypassEmailConfirm) {
        const confirmRes = await fetch(apiUrl("/api/dev/confirm-email"), {
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
        router.push("/onboarding");
        return;
      }

      router.push(`/verify-email?email=${encodeURIComponent(email)}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`);
    } catch (err: any) {
      setError(err.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="ISO Pro"
      title="Create your ISO Pro account"
      subtitle="Set up your organisation, brands, and HSE checklists. Your team can inspect offline from day one."
      formTitle="Create account"
      formSubtitle="Join ISO Pro"
      footerText="Already have an account?"
      footerHref="/login"
      footerLabel="Sign in"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-[var(--hse-charcoal)]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-500 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="your@email.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-[var(--hse-charcoal)]">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-500 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-[var(--hse-charcoal)]">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-500 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="ws-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthPageShell>
  );
}
