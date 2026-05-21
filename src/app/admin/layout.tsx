"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AdminAccessProvider, useAdminAccessContext } from "@/components/admin/AdminAccessContext";
import { AdminConsoleShell } from "@/components/admin/AdminConsoleShell";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAccessProvider>
      <AdminLayoutBody>{children}</AdminLayoutBody>
    </AdminAccessProvider>
  );
}

function AdminLayoutBody({ children }: { children: ReactNode }) {
  const { status, userEmail, sessionHint, signOut, clearSessionHint } = useAdminAccessContext();

  if (status === "loading") {
    return (
      <AppLoadingScreen
        title="Developer console"
        subtitle="Restoring your session and verifying platform access…"
      />
    );
  }

  if (status === "offline") {
    return (
      <OfflineRouteBlock
        title="Admin console offline"
        message="The developer dashboard needs internet because it reads live metrics and brand controls from the database."
        backHref="/workspace"
        backLabel="Back to workspace"
      />
    );
  }

  if (status === "unauthenticated") {
    return (
      <OfflineRouteBlock
        title="Developer sign in required"
        message="Your session is not active. Sign in with an approved developer account to continue."
        backHref="/developer-login"
        backLabel="Developer sign in"
      />
    );
  }

  if (status === "denied") {
    return (
      <main className="workspace-shell min-h-dvh px-4 py-10">
        <div className="ui-card mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
          <h1 className="text-xl font-semibold">Access not granted</h1>
          <p className="text-sm text-foreground/70">
            This console is restricted to approved platform developers. The account you used is not on the developer
            allowlist.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/developer-login"
              className="ui-btn-primary inline-flex h-10 items-center justify-center px-4 text-sm"
            >
              Try another account
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="ui-btn-secondary inline-flex h-10 items-center justify-center px-4 text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AdminSectionErrorBoundary>
      <AdminConsoleShell
        userEmail={userEmail}
        sessionHint={sessionHint}
        onSignOut={signOut}
        onDismissSessionHint={clearSessionHint}
      >
        {children}
      </AdminConsoleShell>
    </AdminSectionErrorBoundary>
  );
}
