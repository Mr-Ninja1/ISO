"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/AuthPageShell";
import { createClient } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const redirectUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/reset-password`;
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
        redirectTo: redirectUrl,
      });
      if (resetError) throw resetError;
      setMessage("Password reset email sent. Follow the link in your inbox to choose a new password.");
    } catch (err: any) {
      setError(err?.message || "Unable to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Reset your password."
      subtitle="We’ll send a secure link to the email address on your account."
      formTitle="Forgot password"
      formSubtitle="Send a reset link"
      footerText="Remembered your password?"
      footerHref="/login"
      footerLabel="Back to login"
    >
      <div className="space-y-4">
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
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
            placeholder="your@email.com"
          />
        </div>

        <button
          type="button"
          onClick={sendReset}
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 font-medium text-background shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Sending..." : "Send password reset link"}
        </button>

        <Link href="/login" className="block text-center text-sm font-medium text-foreground/70 underline underline-offset-4 hover:text-foreground">
          Back to login
        </Link>
      </div>
    </AuthPageShell>
  );
}