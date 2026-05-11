import Link from "next/link";
import { GraduationCap, PlayCircle } from "lucide-react";

type WorkspaceTrainingPageProps = {
  searchParams?: Promise<{
    tenantSlug?: string | string[];
  }>;
};

export default async function WorkspaceTrainingPage({ searchParams }: WorkspaceTrainingPageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const tenantSlug = Array.isArray(resolvedSearchParams.tenantSlug)
    ? resolvedSearchParams.tenantSlug[0] || ""
    : resolvedSearchParams.tenantSlug || "";
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
            categories, build forms, and manage auditing workflows with confidence.
          </p>

          <div className="mt-4 rounded-md border border-foreground/15 bg-foreground/[0.03] p-3 text-sm text-foreground/75">
            Soon you will be able to watch step-by-step onboarding videos directly from this page.
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-4 text-sm text-foreground/60"
              title="Coming soon"
            >
              <PlayCircle className="h-4 w-4" />
              Watch training videos
            </button>
            <Link
              href={backHref}
              className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm text-background"
            >
              Back to workspace
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

