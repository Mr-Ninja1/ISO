"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [openingTenantId, setOpeningTenantId] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (!online) {
      setLoading(false);
      return;
    }

    if (user) {
      const accessToken = session?.access_token;
      if (!accessToken) {
        setLoading(true);
        return;
      }

      setError("");
      fetch("/api/tenants", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const message = data?.error || `Failed to load brands (${res.status})`;
            throw new Error(message);
          }
          return data;
        })
        .then((data) => {
          setTenants(data.tenants || []);
          setLoading(false);
        })
        .catch((err) => {
          setError(err?.message || "Failed to load brands");
          setTenants([]);
          setLoading(false);
        });
    }
  }, [user, session?.access_token, authLoading, router, online]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } finally {
      setSigningOut(false);
    }
  }

  if (authLoading) {
    return <AppLoadingScreen title="Loading dashboard" subtitle="Fetching your brands and account context..." />;
  }

  if (user && !session) {
    return <AppLoadingScreen title="Preparing session" subtitle="Finalizing authentication..." />;
  }

  if (!online) {
    return (
      <OfflineRouteBlock
        title="Lobby requires internet"
        message="This page needs to read your brands from the database before you can choose one. Connect once to open the lobby, then the workspace and forms can run from cache."
        hint="The lobby is the brand selector, so it stays online-only to avoid loading stale account data."
        backHref="/offline"
        backLabel="Offline mode"
      />
    );
  }

  if (loading) {
    return <AppLoadingScreen title="Preparing lobby" subtitle="Fetching your brands and account context..." />;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-4xl p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Lobby</h1>
          <p className="break-all text-foreground/70">{user?.email}</p>
        </div>

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-foreground/20 px-4 py-2 disabled:opacity-60 sm:w-auto"
        >
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {signingOut ? "Signing out..." : "Sign Out"}
        </button>
      </div>

      <div className="mt-8 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-xl font-semibold">Your brands</h2>
          <Link
            href="/onboarding"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 py-2 text-background sm:w-auto"
          >
            Create New Brand
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-foreground/20 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {tenants.length === 0 ? (
          <div className="rounded-md border border-foreground/20 p-6 text-center">
            <p className="text-foreground/70">No brands yet. Create your first one or connect this account to a brand.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => {
                  setOpeningTenantId(tenant.id);
                  router.push(`/workspace/forms?tenantSlug=${encodeURIComponent(tenant.slug)}`);
                }}
                className="w-full rounded-md border border-foreground/20 p-4 text-left hover:bg-foreground/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-foreground/20">
                      {tenant.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tenant.logoUrl}
                          alt={tenant.name}
                          className="h-10 w-10 object-contain"
                        />
                      ) : (
                        <span className="font-semibold">{tenant.name[0]}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">{tenant.name}</h3>
                      <p className="text-sm text-foreground/70">/{tenant.slug}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm text-foreground/50">
                    {openingTenantId === tenant.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {openingTenantId === tenant.id ? "Opening..." : "→"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
