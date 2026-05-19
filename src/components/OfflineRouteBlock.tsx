"use client";

import Link from "next/link";

type Props = {
  title: string;
  message: string;
  hint?: string;
  backHref?: string;
  backLabel?: string;
};

export function OfflineRouteBlock({
  title,
  message,
  hint,
  backHref = "/workspace",
  backLabel = "Back to workspace",
}: Props) {
  return (
    <main className="workspace-shell min-h-dvh px-4 py-10">
      <div className="ui-card mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-foreground/70">{message}</p>
        </div>

        <div className="overflow-hidden rounded-full bg-foreground/10">
          <div className="h-2 w-2/5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-foreground" />
        </div>

        {hint ? <p className="text-xs text-foreground/60">{hint}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Link href={backHref} className="ui-btn-secondary inline-flex h-10 items-center justify-center px-4 text-sm">
            {backLabel}
          </Link>
          <Link href="/offline" className="ui-btn-secondary inline-flex h-10 items-center justify-center px-4 text-sm">
            Offline help
          </Link>
        </div>
      </div>
    </main>
  );
}