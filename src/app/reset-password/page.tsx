"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/AuthPageShell";
import { createClient } from "@/lib/auth";

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!data.session) {
          setError("Open the password reset link from your email first.");
        }
        setReady(true);
      } catch {
        if (cancelled) return;
        setError("Open the password reset link from your email first.");
        setReady(true);
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
    setMessage("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Password updated. You can sign in now.");
    } catch (err: any) {
      setError(err?.message || "Unable to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Secure recovery"
      title="Choose a new password."
      subtitle="This page works after you open the reset link from your email."
      formTitle="Reset password"
      formSubtitle="Set a new secret"
      footerText="Go back to"
      footerHref="/login"
      footerLabel="login"
    >
      <div className="space-y-4">
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground/80">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
            placeholder="At least 8 characters"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground/80">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
            placeholder="Repeat the new password"
          />
        </div>

        <button
          type="button"
          onClick={updatePassword}
          disabled={loading || !ready}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 font-medium text-background shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Updating..." : "Update password"}
        </button>

        <Link href="/login" className="block text-center text-sm font-medium text-foreground/70 underline underline-offset-4 hover:text-foreground">
          Back to login
        </Link>
      </div>
    </AuthPageShell>
  );
}