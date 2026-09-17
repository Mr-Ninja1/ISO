export default function TenantLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading page">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-44 animate-pulse rounded bg-foreground/10" />
          <div className="h-4 w-64 max-w-[70vw] animate-pulse rounded bg-foreground/10" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-md bg-foreground/10" />
      </div>
      <div className="grid min-h-[20rem] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-border/60 bg-foreground/[0.04]" />
        ))}
      </div>
    </div>
  );
}
