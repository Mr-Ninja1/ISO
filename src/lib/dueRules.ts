/**
 * Template-level due reminders (not tied to opening or starting a form).
 * When an admin saves a due period, we store an absolute `dueReminderAt` on schema.meta.
 * The app reminds users to work on the form when that time is reached.
 */

export type DueRuleMode = "days" | "duration" | "fixed" | "daily" | "weekly" | "monthly";

export type TemplateDueRule = {
  mode: DueRuleMode;
  days?: number;
  durationMinutes?: number;
  at?: string;
  time?: string;
  weekday?: number;
  dayOfMonth?: number;
  lastDay?: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

function parseTimeParts(value: unknown): { hours: number; minutes: number } | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function cloneDateAtTime(base: Date, hours: number, minutes: number) {
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function parseTemplateDueRule(meta: Record<string, unknown> | null | undefined): TemplateDueRule | null {
  if (!meta || typeof meta !== "object") return null;

  const raw = meta.dueRule;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const mode = r.mode;
    if (
      mode === "days" ||
      mode === "duration" ||
      mode === "fixed" ||
      mode === "daily" ||
      mode === "weekly" ||
      mode === "monthly"
    ) {
      const days = typeof r.days === "number" && r.days > 0 ? r.days : undefined;
      const durationMinutes =
        typeof r.durationMinutes === "number" && r.durationMinutes > 0 ? Math.round(r.durationMinutes) : undefined;
      const at = typeof r.at === "string" && r.at.trim() ? r.at.trim() : undefined;
      const time = parseTimeParts(r.time) ? String(r.time).trim() : undefined;
      const weekday = typeof r.weekday === "number" && r.weekday >= 0 && r.weekday <= 6 ? Math.floor(r.weekday) : undefined;
      const dayOfMonth =
        typeof r.dayOfMonth === "number" && r.dayOfMonth >= 1 && r.dayOfMonth <= 31
          ? Math.floor(r.dayOfMonth)
          : undefined;
      const lastDay = r.lastDay === true;
      if (mode === "days" && days) return { mode, days };
      if (mode === "duration" && durationMinutes) return { mode, durationMinutes };
      if (mode === "fixed" && at) return { mode, at };
      if (mode === "daily" && time) return { mode, time };
      if (mode === "weekly" && time && weekday !== undefined) return { mode, time, weekday };
      if (mode === "monthly" && time && (lastDay || dayOfMonth !== undefined)) {
        return { mode, time, dayOfMonth, lastDay };
      }
      return null;
    }
  }

  const dueDays = meta.dueDays;
  if (typeof dueDays === "number" && Number.isFinite(dueDays) && dueDays > 0) {
    return { mode: "days", days: dueDays };
  }

  return null;
}

/** Compute absolute reminder time from a rule and when the rule was saved. */
export function computeDueReminderAt(rule: TemplateDueRule | null, ruleSetAt: Date): Date | null {
  if (!rule) return null;
  const anchorMs = ruleSetAt.getTime();
  if (!Number.isFinite(anchorMs)) return null;

  if (rule.mode === "fixed" && rule.at) {
    const fixed = new Date(rule.at);
    return Number.isFinite(fixed.getTime()) ? fixed : null;
  }

  if (rule.mode === "days" && rule.days && rule.days > 0) {
    return new Date(anchorMs + rule.days * MS_PER_DAY);
  }

  if (rule.mode === "duration" && rule.durationMinutes && rule.durationMinutes > 0) {
    return new Date(anchorMs + rule.durationMinutes * MS_PER_MINUTE);
  }

  const time = parseTimeParts(rule.time);
  if (rule.mode === "daily" && time) {
    const first = cloneDateAtTime(ruleSetAt, time.hours, time.minutes);
    if (first.getTime() <= anchorMs) first.setDate(first.getDate() + 1);
    return first;
  }

  if (rule.mode === "weekly" && time && typeof rule.weekday === "number") {
    const first = cloneDateAtTime(ruleSetAt, time.hours, time.minutes);
    const dayDelta = (rule.weekday - first.getDay() + 7) % 7;
    first.setDate(first.getDate() + dayDelta);
    if (first.getTime() <= anchorMs) first.setDate(first.getDate() + 7);
    return first;
  }

  if (rule.mode === "monthly" && time) {
    const cursor = cloneDateAtTime(ruleSetAt, time.hours, time.minutes);
    const calcFor = (year: number, month: number) => {
      const maxDay = daysInMonth(year, month);
      const day = rule.lastDay ? maxDay : Math.min(rule.dayOfMonth || 1, maxDay);
      return new Date(year, month, day, time.hours, time.minutes, 0, 0);
    };
    let first = calcFor(cursor.getFullYear(), cursor.getMonth());
    if (first.getTime() <= anchorMs) {
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      first = calcFor(nextMonth.getFullYear(), nextMonth.getMonth());
    }
    return first;
  }

  return null;
}

export function resolveReminderDueInstants(item: TemplateReminderTarget, now: Date): Date[] {
  const baseDue = new Date(item.dueReminderAt);
  if (!Number.isFinite(baseDue.getTime())) return [];
  const rule = item.dueRule;
  if (!rule) return [baseDue];

  const setAt = item.dueRuleSetAt ? new Date(item.dueRuleSetAt) : null;
  const anchor = setAt && Number.isFinite(setAt.getTime()) ? setAt : baseDue;

  if (rule.mode === "days" && typeof rule.days === "number" && rule.days > 0) {
    const intervalMs = rule.days * MS_PER_DAY;
    if (now.getTime() < baseDue.getTime()) return [baseDue];
    const elapsed = now.getTime() - baseDue.getTime();
    const cyclesPast = Math.floor(elapsed / intervalMs);
    return [new Date(baseDue.getTime() + cyclesPast * intervalMs)];
  }

  if (rule.mode === "duration" && typeof rule.durationMinutes === "number" && rule.durationMinutes > 0) {
    const intervalMs = Math.round(rule.durationMinutes) * MS_PER_MINUTE;
    if (now.getTime() < baseDue.getTime()) return [baseDue];
    const elapsed = now.getTime() - baseDue.getTime();
    const cyclesPast = Math.floor(elapsed / intervalMs);
    return [new Date(baseDue.getTime() + cyclesPast * intervalMs)];
  }

  const time = parseTimeParts(rule.time);
  if (rule.mode === "daily" && time) {
    const candidate = cloneDateAtTime(now, time.hours, time.minutes);
    if (candidate.getTime() < anchor.getTime()) return [baseDue];
    if (candidate.getTime() > now.getTime()) candidate.setDate(candidate.getDate() - 1);
    return [candidate];
  }

  if (rule.mode === "weekly" && time && typeof rule.weekday === "number") {
    const candidate = cloneDateAtTime(now, time.hours, time.minutes);
    const deltaBack = (candidate.getDay() - rule.weekday + 7) % 7;
    candidate.setDate(candidate.getDate() - deltaBack);
    if (candidate.getTime() > now.getTime()) candidate.setDate(candidate.getDate() - 7);
    if (candidate.getTime() < anchor.getTime()) return [baseDue];
    return [candidate];
  }

  if (rule.mode === "monthly" && time) {
    const makeFor = (year: number, month: number) => {
      const maxDay = daysInMonth(year, month);
      const day = rule.lastDay ? maxDay : Math.min(rule.dayOfMonth || 1, maxDay);
      return new Date(year, month, day, time.hours, time.minutes, 0, 0);
    };
    let candidate = makeFor(now.getFullYear(), now.getMonth());
    if (candidate.getTime() > now.getTime()) {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      candidate = makeFor(prevMonth.getFullYear(), prevMonth.getMonth());
    }
    if (candidate.getTime() < anchor.getTime()) return [baseDue];
    return [candidate];
  }

  return [baseDue];
}

/** Canonical reminder instant stored on template.meta (or derived from rule + ruleSetAt). */
export function resolveTemplateDueReminderAt(meta: Record<string, unknown> | null | undefined): Date | null {
  if (!meta || typeof meta !== "object") return null;

  if (typeof meta.dueReminderAt === "string" && meta.dueReminderAt.trim()) {
    const pinned = new Date(meta.dueReminderAt);
    if (Number.isFinite(pinned.getTime())) return pinned;
  }

  const rule = parseTemplateDueRule(meta);
  if (!rule) return null;

  const setAtRaw = meta.dueRuleSetAt;
  const setAt =
    typeof setAtRaw === "string" && setAtRaw.trim() ? new Date(setAtRaw) : null;
  if (!setAt || !Number.isFinite(setAt.getTime())) return null;

  return computeDueReminderAt(rule, setAt);
}

export function isPastDue(dueAt: Date | null, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  return now.getTime() > dueAt.getTime();
}

export function isReminderDue(meta: Record<string, unknown> | null | undefined, now: Date = new Date()): boolean {
  return isPastDue(resolveTemplateDueReminderAt(meta), now);
}

export function formatDueAtLabel(dueAt: Date | null, now: Date = new Date()): string {
  if (!dueAt) return "Reminder: Not set";

  const diffMs = dueAt.getTime() - now.getTime();
  if (diffMs < 0) {
    const overdueMin = Math.floor(Math.abs(diffMs) / MS_PER_MINUTE);
    if (overdueMin < 60) return `Reminder overdue ${overdueMin}m`;
    const overdueH = Math.floor(overdueMin / 60);
    if (overdueH < 48) return `Reminder overdue ${overdueH}h`;
    return `Reminder overdue ${Math.floor(overdueH / 24)}d`;
  }

  const mins = Math.ceil(diffMs / MS_PER_MINUTE);
  if (mins < 60) return `Reminder in ${mins}m`;
  const hours = Math.ceil(mins / 60);
  if (hours < 48) return `Reminder in ${hours}h`;
  return `Reminder in ${Math.ceil(hours / 24)}d`;
}

export function formatDueRuleSummary(
  rule: TemplateDueRule | null,
  dueReminderAt?: Date | null
): string {
  if (dueReminderAt && Number.isFinite(dueReminderAt.getTime())) {
    return formatDueAtLabel(dueReminderAt);
  }
  if (!rule) return "Reminder: Not set";
  if (rule.mode === "days" && rule.days) {
    return rule.days === 1 ? "1-day reminder (saves on apply)" : `${rule.days}-day reminder (saves on apply)`;
  }
  if (rule.mode === "duration" && rule.durationMinutes) {
    if (rule.durationMinutes < 60) return `Reminder ${rule.durationMinutes}m after save`;
    const h = Math.floor(rule.durationMinutes / 60);
    const m = rule.durationMinutes % 60;
    return m ? `Reminder ${h}h ${m}m after save` : `Reminder ${h}h after save`;
  }
  if (rule.mode === "fixed" && rule.at) {
    const d = new Date(rule.at);
    if (Number.isFinite(d.getTime())) {
      return `Reminder ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
    }
  }
  if (rule.mode === "daily" && rule.time) {
    return `Daily at ${rule.time}`;
  }
  if (rule.mode === "weekly" && rule.time && typeof rule.weekday === "number") {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly ${labels[rule.weekday]} at ${rule.time}`;
  }
  if (rule.mode === "monthly" && rule.time) {
    if (rule.lastDay) return `Monthly (last day) at ${rule.time}`;
    if (typeof rule.dayOfMonth === "number") return `Monthly (day ${rule.dayOfMonth}) at ${rule.time}`;
  }
  return "Reminder: Not set";
}

export function templateMetaFromSchema(schema: unknown): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const meta = (schema as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  return meta as Record<string, unknown>;
}

export function buildDueRuleForMeta(input: {
  mode: "none" | DueRuleMode;
  days: string;
  durationMinutes: string;
  fixedLocal: string;
  time: string;
  weekday: string;
  dayOfMonth: string;
  monthlyMode: "day" | "last";
}): { dueRule?: TemplateDueRule; dueDays?: number } {
  if (input.mode === "none") return {};

  if (input.mode === "days") {
    const days = Number(input.days);
    if (!Number.isFinite(days) || days <= 0) return {};
    return { dueRule: { mode: "days", days }, dueDays: days };
  }

  if (input.mode === "duration") {
    const durationMinutes = Number(input.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return {};
    return { dueRule: { mode: "duration", durationMinutes: Math.round(durationMinutes) } };
  }

  if (input.mode === "fixed" && input.fixedLocal.trim()) {
    const at = new Date(input.fixedLocal).toISOString();
    if (!Number.isFinite(new Date(at).getTime())) return {};
    return { dueRule: { mode: "fixed", at } };
  }

  if (input.mode === "daily") {
    const time = input.time.trim();
    if (!parseTimeParts(time)) return {};
    return { dueRule: { mode: "daily", time } };
  }

  if (input.mode === "weekly") {
    const time = input.time.trim();
    const weekday = Number(input.weekday);
    if (!parseTimeParts(time) || !Number.isFinite(weekday) || weekday < 0 || weekday > 6) return {};
    return { dueRule: { mode: "weekly", time, weekday: Math.floor(weekday) } };
  }

  if (input.mode === "monthly") {
    const time = input.time.trim();
    if (!parseTimeParts(time)) return {};
    if (input.monthlyMode === "last") return { dueRule: { mode: "monthly", time, lastDay: true } };
    const dayOfMonth = Number(input.dayOfMonth);
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return {};
    return { dueRule: { mode: "monthly", time, dayOfMonth: Math.floor(dayOfMonth), lastDay: false } };
  }

  return {};
}

/** Apply due rule to template meta — countdown starts at `setAt` (when user saves). */
export function applyDueRuleToMeta(
  existingMeta: Record<string, unknown>,
  input: {
    mode: "none" | DueRuleMode;
    days: string;
    durationMinutes: string;
    fixedLocal: string;
    time: string;
    weekday: string;
    dayOfMonth: string;
    monthlyMode: "day" | "last";
  },
  setAt: Date = new Date()
): Record<string, unknown> {
  const dueFields = buildDueRuleForMeta(input);
  const next: Record<string, unknown> = { ...existingMeta };

  if (!dueFields.dueRule) {
    delete next.dueRule;
    delete next.dueDays;
    delete next.dueReminderAt;
    delete next.dueRuleSetAt;
    return next;
  }

  next.dueRule = dueFields.dueRule;
  if (dueFields.dueDays) next.dueDays = dueFields.dueDays;
  else delete next.dueDays;

  const ruleSetAt = setAt.toISOString();
  next.dueRuleSetAt = ruleSetAt;

  const dueReminderAt = computeDueReminderAt(dueFields.dueRule, setAt);
  if (dueReminderAt) {
    next.dueReminderAt = dueReminderAt.toISOString();
  } else {
    delete next.dueReminderAt;
  }

  return next;
}

export function dueRuleToFormState(rule: TemplateDueRule | null): {
  mode: "none" | DueRuleMode;
  days: string;
  durationMinutes: string;
  fixedLocal: string;
  time: string;
  weekday: string;
  dayOfMonth: string;
  monthlyMode: "day" | "last";
} {
  if (!rule) {
    return { mode: "none", days: "", durationMinutes: "", fixedLocal: "", time: "09:00", weekday: "1", dayOfMonth: "1", monthlyMode: "day" };
  }
  if (rule.mode === "days") {
    return { mode: "days", days: String(rule.days ?? ""), durationMinutes: "", fixedLocal: "", time: "09:00", weekday: "1", dayOfMonth: "1", monthlyMode: "day" };
  }
  if (rule.mode === "duration") {
    return {
      mode: "duration",
      days: "",
      durationMinutes: String(rule.durationMinutes ?? ""),
      fixedLocal: "",
      time: "09:00",
      weekday: "1",
      dayOfMonth: "1",
      monthlyMode: "day",
    };
  }
  if (rule.mode === "fixed" && rule.at) {
    const d = new Date(rule.at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = Number.isFinite(d.getTime())
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      : "";
    return { mode: "fixed", days: "", durationMinutes: "", fixedLocal: local, time: "09:00", weekday: "1", dayOfMonth: "1", monthlyMode: "day" };
  }
  if (rule.mode === "daily") {
    return { mode: "daily", days: "", durationMinutes: "", fixedLocal: "", time: rule.time || "09:00", weekday: "1", dayOfMonth: "1", monthlyMode: "day" };
  }
  if (rule.mode === "weekly") {
    return {
      mode: "weekly",
      days: "",
      durationMinutes: "",
      fixedLocal: "",
      time: rule.time || "09:00",
      weekday: String(rule.weekday ?? 1),
      dayOfMonth: "1",
      monthlyMode: "day",
    };
  }
  if (rule.mode === "monthly") {
    return {
      mode: "monthly",
      days: "",
      durationMinutes: "",
      fixedLocal: "",
      time: rule.time || "09:00",
      weekday: "1",
      dayOfMonth: String(rule.dayOfMonth ?? 1),
      monthlyMode: rule.lastDay ? "last" : "day",
    };
  }
  return { mode: "none", days: "", durationMinutes: "", fixedLocal: "", time: "09:00", weekday: "1", dayOfMonth: "1", monthlyMode: "day" };
}

export type TemplateReminderTarget = {
  templateId: string;
  title: string;
  dueReminderAt: string;
  dueRule?: TemplateDueRule | null;
  dueRuleSetAt?: string;
};

export function templateToReminderTarget(
  templateId: string,
  title: string,
  meta: Record<string, unknown> | null | undefined
): TemplateReminderTarget | null {
  const dueAt = resolveTemplateDueReminderAt(meta);
  if (!dueAt) return null;
  return {
    templateId,
    title,
    dueReminderAt: dueAt.toISOString(),
    dueRule: parseTemplateDueRule(meta),
    dueRuleSetAt: typeof meta?.dueRuleSetAt === "string" ? meta.dueRuleSetAt : undefined,
  };
}
