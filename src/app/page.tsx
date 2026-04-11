"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push("/workspace");
    }
  }, [session, router]);

  if (loading || session) {
    return <AppLoadingScreen title="Loading" subtitle="Preparing your workspace..." />;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 p-4 sm:p-6">
      <header className="rounded-2xl border border-foreground/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(250,250,250,0.82))] px-5 py-10 text-center shadow-sm sm:px-8 sm:py-14">
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Food Safety Audit Platform</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 sm:text-lg">
          Streamline your ISO/HACCP compliance with tenant-scoped, schema-driven audit forms.
          Manage multiple brands, customize templates, and ensure food safety standards across your operations.
        </p>
      </header>

      <main className="flex flex-col items-center gap-6">
        <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-md bg-foreground px-6 font-medium text-background"
            href="/signup"
          >
            Get Started
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-md border border-foreground/20 px-6 font-medium"
            href="/login"
          >
            Sign In
          </Link>
        </div>

        <div className="text-center text-sm text-foreground/60">
          <p>Join thousands of food safety professionals ensuring compliance and quality.</p>
        </div>
      </main>
    </div>
  );
}

