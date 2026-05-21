"use client";

import type { AnnouncementAudience } from "@/lib/platformAudience";

export function AnnouncementAudienceField({
  value,
  onChange,
  hint,
}: {
  value: AnnouncementAudience;
  onChange: (value: AnnouncementAudience) => void;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">Audience</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AnnouncementAudience)}
        className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm"
      >
        <option value="all">All users — website and installed app</option>
        <option value="native">Installed app only — Capacitor APK (not website)</option>
        <option value="web">Website only — browser (not installed app)</option>
      </select>
      {hint ? <span className="text-xs text-foreground/60">{hint}</span> : null}
    </label>
  );
}
