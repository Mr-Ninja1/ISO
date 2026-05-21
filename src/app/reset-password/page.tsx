"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthStatusCard } from "@/components/AuthStatusCard";
import { createClient } from "@/lib/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        let sessionOk = Boolean((await supabase.auth.getSession()).data.session);
        if (cancelled) return;

        if (!sessionOk) {
          const hash = typeof window !== "undefined" ? window.location.hash : "";
          if (hash.includes("access_token") || hash.includes("type=recovery")) {
            await new Promise((r) => window.setTimeout(r, 600));
            sessionOk = Boolean((await supabase.auth.getSession()).data.session);
          }
        }

        if (cancelled) return;
        setHasSession(sessionOk);
        if (!sessionOk) {
          setError("Open the password reset link from your email to continue.");
        }
        setReady(true);
      } catch {
        if (!cancelled) {
          setError("Open the password reset link from your email to continue.");
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function updatePassword() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      setDone(true);
      window.setTimeout(() => router.replace("/login?reset=1"), 2400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to update password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthPageShell
        eyebrow="All set"
        title="Password updated"
        subtitle="Your account is ready — sign in with your new password."
        formTitle="Success"
        formSubtitle="Password changed"
        footerText="Go to"
        footerHref="/login"
        footerLabel="sign in"
      >
        <div className="space-y-5">
          <AuthStatusCard variant="success" title="Your password was updated" icon="success">
            <p>You can now sign in with your new password. Taking you to the sign-in page…</p>
          </AuthStatusCard>
          <Link
            href="/login?reset=1"
            className="ws-btn-primary inline-flex h-11 w-full items-center justify-center px-4 text-sm"
          >
            Continue to sign in
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      eyebrow="Secure recovery"
      title="Choose a new password"
      subtitle="This page opens from the reset link in your email."
      formTitle="Reset password"
      formSubtitle="Set a new password"
      footerText="Go back to"
      footerHref="/login"
      footerLabel="sign in"
    >
      <div className="space-y-4">
        {hasSession ? (
          <AuthStatusCard variant="success" title="Reset link confirmed" icon="success">
            <p>Enter a new password below. You will sign in again after saving.</p>
          </AuthStatusCard>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-[var(--hse-charcoal)]">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!hasSession}
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-500 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
            placeholder="At least 8 characters"
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
            disabled={!hasSession}
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-500 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
            placeholder="Repeat the new password"
          />
        </div>

        <button
          type="button"
          onClick={updatePassword}
          disabled={loading || !ready || !hasSession}
          className="ws-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Updating…" : "Save new password"}
        </button>

        {!hasSession ? (
          <Link
            href="/forgot-password"
            className="block text-center text-sm font-semibold text-[var(--hse-teal)] underline underline-offset-4"
          >
            Request a new reset link
          </Link>
        ) : null}
      </div>
    </AuthPageShell>
  );
}
