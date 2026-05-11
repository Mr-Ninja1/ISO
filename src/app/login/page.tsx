"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/auth";
import { AuthPageShell } from "@/components/AuthPageShell";

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
      await signIn(email, password);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token || "";
      if (accessToken) {
        const developerRes = await fetch("/api/admin/metrics", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (developerRes.ok) {
          router.push("/admin");
          return;
        }

        const verifyRes = await fetch("/api/staff/verify-pin", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
            body: JSON.stringify({}),
        });

        const verifyJson = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok) {
          throw new Error(verifyJson?.error || "PIN verification failed");
        }

        try {
          localStorage.setItem(
            "active-staff-profile:v1",
            JSON.stringify({
              tenantSlug: verifyJson?.tenantSlug || null,
              name: verifyJson?.staffName || null,
              email: verifyJson?.staffEmail || email,
              userId: session?.user?.id || null,
              ts: Date.now(),
            })
          );
        } catch {
          // ignore local storage failures
        }

        const tenantSlug = typeof verifyJson?.tenantSlug === "string" ? verifyJson.tenantSlug : "";
        if (tenantSlug) {
          router.push(`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`);
          return;
        }
      }

      // Redirect to workspace after login
      router.push("/workspace/forms");
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Secure access"
      onEyebrowClick={handleSecureAccessClick}
      eyebrowTitle={secureAccessClicks > 0 ? `${6 - secureAccessClicks} clicks left` : "Developer access"}
      title="Sign in to your operational workspace."
      subtitle="Open your brand, continue drafts, review saved forms, and keep the workspace synced across devices."
      formTitle="Welcome back"
      formSubtitle="Enter your credentials to continue"
      footerText="Need an account?"
      footerHref="/signup"
      footerLabel="Create one"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {banner.verified ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Your email has been verified. You can sign in now.
          </div>
        ) : null}
        {banner.reset ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            Your password was updated. Sign in with your new password.
          </div>
        ) : null}

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

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 font-medium text-white shadow-lg shadow-slate-900/20 transition-all hover:shadow-xl hover:shadow-slate-900/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <div className="flex items-center justify-between gap-3 text-sm">
          <Link href="/forgot-password" className="font-semibold text-slate-900 underline underline-offset-4 hover:text-black">
            Forgot password?
          </Link>
          <Link href="/verify-email" className="font-semibold text-slate-900 underline underline-offset-4 hover:text-black">
            Need verification?
          </Link>
        </div>

        <Link href="/developer-login" className="block text-center text-sm font-semibold text-slate-900 underline underline-offset-4 hover:text-black">
          Developer sign in
        </Link>
      </form>
    </AuthPageShell>
  );
}
