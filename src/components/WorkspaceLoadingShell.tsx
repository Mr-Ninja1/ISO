"use client";

type Props = {
  title?: string;
  subtitle?: string;
};

/** Loading state with inline layout/colors so it renders correctly even if Tailwind CSS is late on native. */
export function WorkspaceLoadingShell({
  title = "Loading workspace",
  subtitle = "Restoring your brand and cached forms…",
}: Props) {
  return (
    <div className="iso-loading-root workspace-shell flex min-h-dvh flex-col" role="status" aria-live="polite">
      <div className="iso-loading-accent ws-header-accent" />
      <div
        className="iso-loading-header ws-header border-b px-4 py-4"
        style={{ borderColor: "rgba(0, 61, 51, 0.12)" }}
      >
        <div
          className="mx-auto flex max-w-7xl items-center gap-3"
          style={{ maxWidth: "80rem", margin: "0 auto", display: "flex", alignItems: "center", gap: "0.75rem" }}
        >
          <div
            className="h-10 w-10 animate-pulse rounded-xl"
            style={{ width: "2.5rem", height: "2.5rem", borderRadius: "0.75rem", background: "#d1e9f6" }}
          />
          <div className="space-y-2" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div
              className="h-4 w-36 animate-pulse rounded-md"
              style={{ width: "9rem", height: "1rem", borderRadius: "0.375rem", background: "#ebe3d6" }}
            />
            <div
              className="h-3 w-24 animate-pulse rounded-md"
              style={{ width: "6rem", height: "0.75rem", borderRadius: "0.375rem", background: "#d1e9f6" }}
            />
          </div>
        </div>
      </div>
      <div className="iso-loading-body mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
        <div className="iso-loading-icon flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
          <div className="iso-loading-spinner" aria-hidden />
        </div>
        <div className="text-center">
          <p className="iso-loading-title text-base font-semibold">{title}</p>
          <p className="iso-loading-subtitle mt-1 max-w-sm text-sm">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
