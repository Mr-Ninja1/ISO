type Props = {
  title: string;
  message: string;
  tone?: "info" | "warning";
};

export function FeatureSyncNotice({ title, message, tone = "info" }: Props) {
  const toneClass =
    tone === "warning"
      ? "border-amber-300/80 bg-amber-50 text-amber-900"
      : "border-foreground/20 bg-foreground/5 text-foreground";

  return (
    <div className={`rounded-md border p-3 text-sm ${toneClass}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm opacity-90">{message}</div>
    </div>
  );
}
