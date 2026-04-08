"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
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
  }, [user, session?.access_token, authLoading, router]);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  if (authLoading) {
    return <div className="flex min-h-dvh items-center justify-center">Loading...</div>;
  }

  if (user && !session) {
    return <div className="flex min-h-dvh items-center justify-center">Preparing your session...</div>;
  }

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center">Loading...</div>;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-4xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-foreground/70">{user?.email}</p>
        </div>

        <button
          onClick={handleSignOut}
          className="rounded-md border border-foreground/20 px-4 py-2"
        >
          Sign Out
        </button>
      </div>

      <div className="mt-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Your Brands</h2>
          <Link
            href="/onboarding"
            className="rounded-md bg-foreground px-4 py-2 text-background"
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
            <p className="text-foreground/70">No brands yet. Create your first one!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tenants.map((tenant) => (
              <Link
                key={tenant.id}
                href={`/${tenant.slug}/templates`}
                className="rounded-md border border-foreground/20 p-4 hover:bg-foreground/5"
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
                  <span className="text-sm text-foreground/50">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
