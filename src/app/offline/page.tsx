export default function OfflinePage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-lg border border-foreground/20 bg-background p-6">
        <h1 className="text-xl font-semibold">You are offline</h1>
        <p className="mt-2 text-sm text-foreground/70">
          The app is running in offline mode. Cached workspaces and forms should still open,
          and any queued changes will sync automatically when connection returns.
        </p>
        <p className="mt-4 text-xs text-foreground/60">
          Tip: open the workspace once while online to warm all categories and form schemas for full offline navigation.
        </p>
      </div>
    </main>
  );
}
