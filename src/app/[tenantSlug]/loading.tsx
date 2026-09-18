export default function TenantLoading() {
  return (
    <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading page">
      <div className="h-5 w-40 animate-pulse rounded bg-foreground/8" />
      <div className="h-4 w-56 max-w-[70vw] animate-pulse rounded bg-foreground/6" />
    </div>
  );
}
