"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuthPageShell } from "@/components/AuthPageShell";
import { apiUrl } from "@/lib/client/apiBase";

export default function DeveloperLoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [secureClicks, setSecureClicks] = useState(0);
  const secureClicksRef = useRef(0);

  const handleDeveloperAccess = () => {
    secureClicksRef.current += 1;
    if (secureClicksRef.current >= 6) {
      secureClicksRef.current = 0;
      setSecureClicks(0);
      router.push("/admin");
      return;
    }
    setSecureClicks(secureClicksRef.current);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { session } = await signIn(email, password);
      const accessToken = session.access_token || "";
      if (!accessToken) {
        throw new Error("Unable to start a developer session.");
      }

      const developerRes = await fetch(apiUrl("/api/admin/metrics"), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!developerRes.ok) {
        if (developerRes.status === 403) {
          throw new Error("This email is not approved for the developer console.");
        }
        const payload = await developerRes.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to verify developer access.");
      }

      router.push("/admin");
    } catch (err: any) {
      setError(err?.message || "Developer sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Developer access"
      onEyebrowClick={handleDeveloperAccess}
      eyebrowTitle={secureClicks > 0 ? `${6 - secureClicks} clicks left` : "Open developer console"}
      title="Sign in to the developer console."
      subtitle="Use an approved developer email to oversee all brands, live alerts, and platform-wide settings."
      formTitle="Developer sign in"
      formSubtitle="Enter your developer credentials"
      footerText="Need staff login instead?"
      footerHref="/login"
      footerLabel="Go to normal login"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="developer-email" className="text-sm font-medium text-foreground/80">Email</label>
          <input
            id="developer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="developer-password" className="text-sm font-medium text-foreground/80">Password</label>
          <input
            id="developer-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3.5 text-sm outline-none transition placeholder:text-foreground/35 focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 font-medium text-background shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Signing in..." : "Enter developer console"}
        </button>
      </form>
    </AuthPageShell>
  );
}