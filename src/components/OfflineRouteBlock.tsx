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
  backHref = "/dashboard",
  backLabel = "Back to lobby",
}: Props) {
  return (
    <main className="min-h-dvh bg-[linear-gradient(180deg,rgba(23,23,23,0.03)_0%,rgba(23,23,23,0.015)_35%,rgba(23,23,23,0.04)_100%)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-foreground/20 bg-background p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-foreground/70">{message}</p>
        </div>

        <div className="overflow-hidden rounded-full bg-foreground/10">
          <div className="h-2 w-2/5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-foreground" />
        </div>

        {hint ? <p className="text-xs text-foreground/60">{hint}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Link href={backHref} className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4 text-sm hover:bg-foreground/5">
            {backLabel}
          </Link>
          <Link href="/offline" className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4 text-sm hover:bg-foreground/5">
            Offline help
          </Link>
        </div>
      </div>
    </main>
  );
}