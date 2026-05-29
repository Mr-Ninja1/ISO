"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthStatusCard } from "@/components/AuthStatusCard";
import { createClient } from "@/lib/auth";

export default function EmailVerifiedPage() {
  const [status, setStatus] = useState<"loading" | "verified" | "invalid">("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        const user = data.session?.user;
        const confirmed =
          Boolean(user?.email_confirmed_at) ||
          user?.user_metadata?.email_verified === true;

        if (confirmed || data.session) {
          setStatus("verified");
          await supabase.auth.signOut();
          return;
        }

        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (hash.includes("access_token") || hash.includes("type=signup")) {
          window.setTimeout(async () => {
            if (cancelled) return;
            const retry = await supabase.auth.getSession();
            if (retry.data.session?.user) {
              setStatus("verified");
              await supabase.auth.signOut();
            } else {
              setStatus("invalid");
            }
          }, 800);
          return;
        }

        setStatus("invalid");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthPageShell
      eyebrow="ISO Grid"
      title="Email verification"
      subtitle="Confirm your address to activate your HSE workspace account."
      formTitle="Verification"
      formSubtitle="Account activation"
      footerText="Need help?"
      footerHref="/verify-email"
      footerLabel="Resend verification"
    >
      {status === "loading" ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-[var(--accent-soft)]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--hse-teal)]" aria-hidden />
          <p>Confirming your email…</p>
        </div>
      ) : null}

      {status === "verified" ? (
        <div className="space-y-5">
          <AuthStatusCard variant="success" title="Your email is verified" icon="success">
            <p>
              Your ISO Grid account is active. Sign in with the email and password you used when you
              registered.
            </p>
          </AuthStatusCard>
          <Link
            href="/login"
            className="ws-btn-primary inline-flex h-11 w-full items-center justify-center px-4 text-sm"
          >
            Continue to sign in
          </Link>
        </div>
      ) : null}

      {status === "invalid" ? (
        <div className="space-y-5">
          <AuthStatusCard variant="warning" title="We could not confirm this link" icon="shield">
            <p>
              The link may have expired or already been used. Request a new verification email, then
              open the latest message from ISO Grid.
            </p>
          </AuthStatusCard>
          <Link
            href="/verify-email"
            className="ws-btn-primary inline-flex h-11 w-full items-center justify-center px-4 text-sm"
          >
            Resend verification email
          </Link>
          <Link
            href="/login"
            className="block text-center text-sm font-semibold text-[var(--hse-teal)] underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      ) : null}
    </AuthPageShell>
  );
}
