import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Food Safety Audit PWA</h1>
        <p className="text-foreground/70">
          Tenant-scoped, schema-driven forms for ISO/HACCP audits.
        </p>
      </header>

      <main className="flex flex-col gap-3">
        <div className="space-y-2">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-md bg-foreground px-4 text-background"
            href="/dashboard"
          >
            Go to Dashboard
          </Link>
        </div>

        <div className="space-y-2 pt-4">
          <p className="text-sm text-foreground/70">Don't have an account?</p>
          <div className="flex gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4"
              href="/signup"
            >
              Sign Up
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4"
              href="/login"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

