"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthStatusCard } from "@/components/AuthStatusCard";
import { createClient } from "@/lib/auth";
import { emailVerificationRedirectUrl } from "@/lib/authRedirectUrls";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
  }, []);

  async function resendVerification() {
    if (!email.trim()) {
      setError("Enter the email address you used when signing up.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: emailVerificationRedirectUrl(),
        },
      });

      if (resendError) throw resendError;
      setMessage("A new verification link has been sent. Check your inbox and spam folder.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to resend verification email.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const inboxHint = email.trim() ? (
    <>
      We sent a verification link to <strong className="font-semibold">{email.trim()}</strong>. Open
      your inbox and click the link to activate your account.
    </>
  ) : (
    <>We sent a verification link to your email address. Open your inbox and click the link to activate your account.</>
  );

  return (
    <AuthPageShell
      eyebrow="Almost there"
      title="Verify your email to continue"
      subtitle="One quick step before you can sign in to your HSE workspace."
      formTitle="Verification email"
      formSubtitle="Check your inbox"
      footerText="Already verified?"
      footerHref="/login"
      footerLabel="Sign in"
    >
      <div className="space-y-4">
        <AuthStatusCard variant="info" title="We sent you a verification link" icon="mail">
          <p>{inboxHint}</p>
          <p className="mt-2">
            The message is from ISO Pro. If it does not arrive within a few minutes, check spam or
            resend below.
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

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-[var(--hse-charcoal)]">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-500 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-emerald-100"
            placeholder="your@email.com"
          />
        </div>

        <button
          type="button"
          onClick={resendVerification}
          disabled={loading}
          className="ws-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Sending…" : "Resend verification email"}
        </button>

        <p className="text-xs leading-5 text-[var(--accent-soft)]">
          After you verify, you will see a confirmation screen and can sign in with your password.
        </p>

        <Link
          href="/signup"
          className="block text-center text-sm font-semibold text-[var(--hse-teal)] underline underline-offset-4"
        >
          Back to sign up
        </Link>
      </div>
    </AuthPageShell>
  );
}
