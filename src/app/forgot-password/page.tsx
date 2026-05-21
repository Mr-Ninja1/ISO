"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthStatusCard } from "@/components/AuthStatusCard";
import { createClient } from "@/lib/auth";
import { passwordResetRedirectUrl } from "@/lib/authRedirectUrls";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sent") === "1") {
      setSent(true);
      setEmail(params.get("email") ?? "");
    }
  }, []);

  async function sendReset() {
    if (!email.trim()) {
      setError("Enter the email address tied to your account.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirectUrl(),
      });
      if (resetError) throw resetError;
      const trimmed = email.trim();
      window.history.replaceState(
        null,
        "",
        `/forgot-password?sent=1&email=${encodeURIComponent(trimmed)}`
      );
      setSent(true);
      setMessage("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to send reset email.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function resendReset() {
    await sendReset();
  }

  const inboxHint = email.trim() ? (
    <>
      If an account exists for <strong className="font-semibold">{email.trim()}</strong>, you will
      receive a password reset link shortly.
    </>
  ) : (
    <>If an account exists for that address, you will receive a password reset link shortly.</>
  );

  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Reset your password securely"
      subtitle="We will email you a one-time link to choose a new password."
      formTitle={sent ? "Email sent" : "Forgot password"}
      formSubtitle={sent ? "Check your inbox" : "Request a reset link"}
      footerText="Remembered your password?"
      footerHref="/login"
      footerLabel="Back to sign in"
    >
      {sent ? (
        <div className="space-y-4">
          <AuthStatusCard variant="info" title="Check your email" icon="mail">
            <p>{inboxHint}</p>
            <p className="mt-2">
              Open the message from ISO Pro and tap <strong className="font-semibold">Reset password</strong>.
              The link opens a secure page where you can set a new password.
            </p>
          </AuthStatusCard>

          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <button
            type="button"
            onClick={resendReset}
            disabled={loading}
            className="ws-btn-ghost inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Sending…" : "Resend reset email"}
          </button>

          <Link
            href="/login"
            className="ws-btn-primary inline-flex h-11 w-full items-center justify-center px-4 text-sm"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-[var(--hse-charcoal)]">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-500 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-emerald-100"
              placeholder="your@email.com"
            />
          </div>

          <button
            type="button"
            onClick={sendReset}
            disabled={loading}
            className="ws-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Sending…" : "Send password reset link"}
          </button>

          <Link
            href="/login"
            className="block text-center text-sm font-semibold text-[var(--hse-teal)] underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </AuthPageShell>
  );
}
