"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/AuthPageShell";
import { createClient } from "@/lib/auth";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
  }, []);

  const redirectUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/login?verified=1`;
  }, []);

  async function resendVerification() {
    if (!email.trim()) {
      setError("Enter the email address that you used to sign up.");
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
          emailRedirectTo: redirectUrl,
        },
      });

      if (resendError) throw resendError;
      setMessage("Verification email sent again. Check your inbox and spam folder.");
    } catch (err: any) {
      setError(err?.message || "Unable to resend verification email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Account created"
      title="Check your email to verify your account."
      subtitle={email ? `We sent a verification link to ${email}. Open that email and click the button to finish creating your account.` : "We sent a verification link to your inbox. Open that email and click the button to finish creating your account."}
      formTitle="Need another email?"
      formSubtitle="Resend the verification link if it does not arrive"
      footerText="Ready to sign in?"
      footerHref="/login"
      footerLabel="Go to login"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="text-lg font-bold text-emerald-900">Check your email to verify your account</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-700">
            We sent a verification link to your inbox. Open that email and click the button to finish creating your account.
            If you do not see it after a minute, check your spam folder or use the resend button below.
          </p>
        </div>

        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground/80">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
            placeholder="your@email.com"
          />
        </div>

        <button
          type="button"
          onClick={resendVerification}
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 font-medium text-background shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Sending..." : "Resend verification email"}
        </button>

        <p className="text-xs leading-5 text-foreground/60">
          After you click the verification link, return to the login page and sign in with your password.
        </p>

        <Link href="/signup" className="block text-center text-sm font-medium text-foreground/70 underline underline-offset-4 hover:text-foreground">
          Back to sign up
        </Link>
      </div>
    </AuthPageShell>
  );
}