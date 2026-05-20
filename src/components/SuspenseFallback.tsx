export function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center p-6 text-sm"
      style={{
        minHeight: "40vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontSize: "0.875rem",
        color: "#0d5c52",
      }}
      role="status"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          className="iso-loading-spinner"
          style={{
            width: "1.25rem",
            height: "1.25rem",
            border: "2px solid #d1e9f6",
            borderTopColor: "#003d33",
            borderRadius: "50%",
            animation: "iso-spin 0.8s linear infinite",
          }}
          aria-hidden
        />
        Loading…
      </div>
    </div>
  );
}
