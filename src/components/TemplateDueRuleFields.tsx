"use client";

import type { DueRuleMode } from "@/lib/dueRules";

export type DueRuleFormState = {
  mode: "none" | DueRuleMode;
  days: string;
  durationMinutes: string;
  fixedLocal: string;
  time: string;
  weekday: string;
  dayOfMonth: string;
  monthlyMode: "day" | "last";
};

const QUICK_DURATIONS = [
  { label: "5 min", minutes: 5 },
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
] as const;

const FREQUENCY_PRESETS = [
  { label: "Daily", days: "1" },
  { label: "Weekly", days: "7" },
  { label: "Monthly", days: "30" },
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
          Optional admin setting. If left empty, the form still works normally with no due reminders.
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
          <option value="daily">Daily at time</option>
          <option value="weekly">Weekly on weekday</option>
          <option value="monthly">Monthly schedule</option>
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
        <div className="grid gap-2">
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
          <div className="flex flex-wrap gap-2">
            {FREQUENCY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                className="rounded-full border border-[var(--hse-sky-deep)] bg-white px-3 py-1 text-xs font-semibold text-[var(--hse-teal)] hover:border-[var(--hse-copper)] disabled:opacity-60"
                onClick={() =>
                  onChange({
                    ...value,
                    mode: "days",
                    days: preset.days,
                  })
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
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

      {value.mode === "daily" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-foreground/70">Time of day</span>
          <input
            type="time"
            className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
            value={value.time}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, time: e.target.value })}
          />
        </label>
      ) : null}

      {value.mode === "weekly" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/70">Weekday</span>
            <select
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
              value={value.weekday}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, weekday: e.target.value })}
            >
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="0">Sunday</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/70">Time</span>
            <input
              type="time"
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
              value={value.time}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, time: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      {value.mode === "monthly" ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/70">Monthly mode</span>
            <select
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
              value={value.monthlyMode}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, monthlyMode: e.target.value === "last" ? "last" : "day" })}
            >
              <option value="day">Specific day of month</option>
              <option value="last">Last day of month</option>
            </select>
          </label>
          {value.monthlyMode === "day" ? (
            <label className="grid gap-1 text-sm">
              <span className="text-foreground/70">Day of month</span>
              <input
                type="number"
                min={1}
                max={31}
                className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
                value={value.dayOfMonth}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, dayOfMonth: e.target.value })}
              />
            </label>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/70">Time</span>
            <input
              type="time"
              className="h-11 rounded-xl border border-foreground/15 bg-background px-3 text-sm disabled:opacity-60"
              value={value.time}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, time: e.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
