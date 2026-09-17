export default function Loading() {
  return (
    <div className="min-h-dvh bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <div className="h-14 animate-pulse rounded-2xl border border-border/70 bg-surface/80" />
        <main className="flex min-h-[28rem] flex-col gap-4 rounded-2xl border border-border/70 bg-surface/80 p-5 shadow-sm">
          <div className="h-7 w-48 animate-pulse rounded bg-foreground/10" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-foreground/10" />
          <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-xl border border-border/60 bg-foreground/[0.04]" />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
