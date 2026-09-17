"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/auth";

export function AccountSettingsPanel() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  async function updateEmail() {
    const nextEmail = email.trim().toLowerCase();
    setError("");
    setMessage("");

    if (!nextEmail || !nextEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (nextEmail === user?.email?.toLowerCase()) {
      setError("Enter a different email address.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ email: nextEmail });
      if (updateError) throw updateError;
      setMessage("Check your email addresses to confirm the change. Your new email will be active after confirmation.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to change your email address.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-foreground/20 bg-background p-4">
      <div>
        <h3 className="text-base font-semibold">Account email</h3>
        <p className="mt-1 text-sm text-foreground/70">Change the email address you use to sign in.</p>
      </div>

      {message ? <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="account-email" className="text-sm font-medium">
            Email address
          </label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading || !user}
            className="mt-1 h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm outline-none focus:border-foreground/50 disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={updateEmail}
          disabled={loading || !user}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-4 text-sm hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Updating..." : "Change email"}
        </button>
      </div>
    </div>
  );
}