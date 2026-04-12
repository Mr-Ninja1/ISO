type Props = {
  title: string;
  message: string;
  tone?: "info" | "warning";
};

export function FeatureSyncNotice({ title, message, tone = "info" }: Props) {
  const toneClass =
    tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-blue-300 bg-blue-50 text-blue-900";

  return (
    <div className={`rounded-md border p-3 text-sm ${toneClass}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm opacity-90">{message}</div>
    </div>
  );
}
