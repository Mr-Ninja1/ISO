"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push("/workspace");
    }
  }, [session, router]);

  if (loading || session) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center p-6">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 p-6">
      <header className="text-center">
        <h1 className="text-4xl font-bold mb-4">Food Safety Audit Platform</h1>
        <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
          Streamline your ISO/HACCP compliance with tenant-scoped, schema-driven audit forms.
          Manage multiple brands, customize templates, and ensure food safety standards across your operations.
        </p>
      </header>

      <main className="flex flex-col items-center gap-6">
        <div className="flex gap-4">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-md bg-foreground px-6 text-background font-medium"
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

