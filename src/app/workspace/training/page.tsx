"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";

export default function WorkspaceTrainingPage() {
  return (
    <SearchParamsBoundary>
      <WorkspaceTrainingPageInner />
    </SearchParamsBoundary>
  );
}

function WorkspaceTrainingPageInner() {
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenantSlug") || "";
  const backHref = tenantSlug
    ? `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`
    : "/workspace";

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-foreground/20 bg-background p-5 sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-foreground/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-foreground/65">
            <GraduationCap className="h-3.5 w-3.5" />
            Staff training
          </div>

          <h1 className="mt-3 text-xl font-semibold">Training courses coming soon</h1>
          <p className="mt-2 text-sm leading-6 text-foreground/75">
            We are preparing short practical videos to help staff and beginners learn how to create
            forms, run audits, and stay compliant in the field.
          </p>

          <Link href={backHref} className="mt-5 inline-flex text-sm underline">
            Back to workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
