"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Download } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthHsePlatformBadge } from "@/components/AuthHsePlatformBadge";
import { resolvePostLoginRoute } from "@/lib/client/postLoginRouting";
import { AndroidApkDownloadTrigger } from "@/components/AndroidApkDownloadTrigger";
import { useAndroidMobileWebInstall } from "@/hooks/useAndroidMobileWebInstall";
import { useInstalledNativeShell } from "@/hooks/useInstalledNativeShell";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ verified: boolean; reset: boolean }>({ verified: false, reset: false });
  const [secureAccessClicks, setSecureAccessClicks] = useState(0);
  const secureAccessClicksRef = useRef(0);
  const installedShell = useInstalledNativeShell();
  const { visible, apkUrl } = useAndroidMobileWebInstall();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setBanner({
      verified: params.get("verified") === "1",
      reset: params.get("reset") === "1",
    });
  }, []);

  const handleSecureAccessClick = () => {
    secureAccessClicksRef.current += 1;

    if (secureAccessClicksRef.current >= 6) {
      secureAccessClicksRef.current = 0;
      setSecureAccessClicks(0);
      router.push("/developer-login");
      return;
    }

    setSecureAccessClicks(secureAccessClicksRef.current);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { session, user: signedInUser } = await signIn(email, password);
      const route = await resolvePostLoginRoute(
        session.access_token,
        signedInUser.email || email,
        signedInUser.id
      );
      router.replace(route.path);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      if (/failed to fetch|networkerror|network request failed/i.test(message)) {
        setError("Cannot reach the server. Check your internet connection and try again.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="ISO Pro"
      onEyebrowClick={handleSecureAccessClick}
      eyebrowTitle={secureAccessClicks > 0 ? `${6 - secureAccessClicks} clicks left` : "Developer access"}
      title="HSE management for your organisation"
      subtitle="Inspections, evidence, and corrective actions in one workspace—online or offline in the field."
      brandBadge={<AuthHsePlatformBadge />}
      formTitle="Sign in"
      formSubtitle="Access your HSE workspace"
      footerText="New to ISO Pro?"
      footerHref="/signup"
      footerLabel="Create an account"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {banner.verified ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            Your email has been verified. You can sign in now.
          </div>
        ) : null}
        {banner.reset ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Your password was updated. Sign in with your new password.
          </div>
        ) : null}

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
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-400 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] disabled:bg-slate-50 disabled:text-slate-500"
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
            className="h-11 w-full rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-white px-3.5 text-sm text-[var(--hse-charcoal)] outline-none transition placeholder:text-slate-400 focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="ws-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="flex items-center justify-between gap-3 text-sm">
          <Link
            href="/forgot-password"
            className="font-semibold text-[var(--hse-teal)] underline underline-offset-4 hover:text-[var(--hse-teal-mid)]"
          >
            Forgot password?
          </Link>
          <Link
            href="/verify-email"
            className="font-semibold text-[var(--hse-teal)] underline underline-offset-4 hover:text-[var(--hse-teal-mid)]"
          >
            Verify email
          </Link>
        </div>

        {!installedShell && visible ? (
          <div className="mt-4 border-t border-[color-mix(in_srgb,var(--hse-teal)_10%,transparent)] pt-4">
            <AndroidApkDownloadTrigger
              apkUrl={apkUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--hse-teal)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--hse-teal)] transition hover:bg-[color-mix(in_srgb,var(--hse-teal)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] focus:outline-none focus:ring-2 focus:ring-[var(--hse-teal)] focus:ring-offset-2"
            >
              <Download className="h-4 w-4" />
              Download ISO Pro for Android
            </AndroidApkDownloadTrigger>
          </div>
        ) : null}
      </form>
    </AuthPageShell>
  );
}
