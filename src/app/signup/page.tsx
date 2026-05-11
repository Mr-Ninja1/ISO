"use client";

import { useMemo, useState } from "react";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const confirmUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/login?verified=1`;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { userId } = await signUp(email, password, { emailRedirectTo: confirmUrl });

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
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="your@email.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="••••••••"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="••••••••"
          />
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <p className="text-xs leading-5 text-slate-700">
          If email verification is enabled, we will send a confirmation link to your inbox before you can continue.
        </p>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 font-medium text-white shadow-lg shadow-slate-900/20 transition-all hover:shadow-xl hover:shadow-slate-900/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Creating..." : "Create Account"}
        </button>
      </form>
    </AuthPageShell>
  );
}
