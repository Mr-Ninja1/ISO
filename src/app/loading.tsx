export default function Loading() {
  return (
    <div className="min-h-[40vh] bg-background px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-foreground/8" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-foreground/6" />
      </div>
    </div>
  );
}
