"use client";

import type { DueRuleMode } from "@/lib/dueRules";

export type DueRuleFormState = {
  mode: "none" | DueRuleMode;
  days: string;
  durationMinutes: string;
  fixedLocal: string;
};

const QUICK_DURATIONS = [
  { label: "5 min", minutes: 5 },
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
] as const;

type Props = {
  value: DueRuleFormState;
  onChange: (next: DueRuleFormState) => void;
  disabled?: boolean;
};

export function TemplateDueRuleFields({ value, onChange, disabled }: Props) {
  return (
    <div className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_12%,transparent)] bg-[var(--hse-cream)]/40 p-3">
      <div className="space-y-1">
        <span className="text-sm font-medium text-[var(--hse-charcoal)]">Due date &amp; time</span>
        <p className="text-xs leading-5 text-[var(--accent-soft)]">
          The countdown starts when you save — not when someone opens the form. Use minutes to test reminders quickly.
        </p>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-foreground/70">Rule type</span>
        <select
          className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
          value={value.mode}
          disabled={disabled}
          onChange={(e) => {
            const mode = e.target.value as DueRuleFormState["mode"];
            onChange({ ...value, mode });
          }}
        >
          <option value="none">No due date</option>
          <option value="duration">Time from save (minutes / hours)</option>
          <option value="days">Days from save</option>
          <option value="fixed">Specific date &amp; time</option>
        </select>
      </label>

      {value.mode === "duration" ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/70">Minutes after you save</span>
            <input
              type="number"
              min={1}
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
              value={value.durationMinutes}
              disabled={disabled}
              placeholder="e.g. 15"
              onChange={(e) => onChange({ ...value, durationMinutes: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_DURATIONS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                disabled={disabled}
                className="rounded-full border border-[var(--hse-sky-deep)] bg-white px-3 py-1 text-xs font-semibold text-[var(--hse-teal)] hover:border-[var(--hse-copper)] disabled:opacity-60"
                onClick={() =>
                  onChange({
                    ...value,
                    mode: "duration",
                    durationMinutes: String(preset.minutes),
                  })
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {value.mode === "days" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-foreground/70">Days after you save</span>
          <input
            type="number"
            min={1}
            className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
            value={value.days}
            disabled={disabled}
            placeholder="e.g. 3"
            onChange={(e) => onChange({ ...value, days: e.target.value })}
          />
        </label>
      ) : null}

      {value.mode === "fixed" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-foreground/70">Due at (local time)</span>
          <input
            type="datetime-local"
            className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
            value={value.fixedLocal}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, fixedLocal: e.target.value })}
          />
        </label>
      ) : null}
    </div>
  );
}
