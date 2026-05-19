/**
 * Template-level due reminders (not tied to opening or starting a form).
 * When an admin saves a due period, we store an absolute `dueReminderAt` on schema.meta.
 * The app reminds users to work on the form when that time is reached.
 */

export type DueRuleMode = "days" | "duration" | "fixed";

export type TemplateDueRule = {
  mode: DueRuleMode;
  days?: number;
  durationMinutes?: number;
  at?: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export function parseTemplateDueRule(meta: Record<string, unknown> | null | undefined): TemplateDueRule | null {
  if (!meta || typeof meta !== "object") return null;

  const raw = meta.dueRule;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const mode = r.mode;
    if (mode === "days" || mode === "duration" || mode === "fixed") {
      const days = typeof r.days === "number" && r.days > 0 ? r.days : undefined;
      const durationMinutes =
        typeof r.durationMinutes === "number" && r.durationMinutes > 0 ? Math.round(r.durationMinutes) : undefined;
      const at = typeof r.at === "string" && r.at.trim() ? r.at.trim() : undefined;
      if (mode === "days" && days) return { mode, days };
      if (mode === "duration" && durationMinutes) return { mode, durationMinutes };
      if (mode === "fixed" && at) return { mode, at };
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

  return null;
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
} {
  if (!rule) {
    return { mode: "none", days: "", durationMinutes: "", fixedLocal: "" };
  }
  if (rule.mode === "days") {
    return { mode: "days", days: String(rule.days ?? ""), durationMinutes: "", fixedLocal: "" };
  }
  if (rule.mode === "duration") {
    return {
      mode: "duration",
      days: "",
      durationMinutes: String(rule.durationMinutes ?? ""),
      fixedLocal: "",
    };
  }
  if (rule.mode === "fixed" && rule.at) {
    const d = new Date(rule.at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = Number.isFinite(d.getTime())
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      : "";
    return { mode: "fixed", days: "", durationMinutes: "", fixedLocal: local };
  }
  return { mode: "none", days: "", durationMinutes: "", fixedLocal: "" };
}

export type TemplateReminderTarget = {
  templateId: string;
  title: string;
  dueReminderAt: string;
};

export function templateToReminderTarget(
  templateId: string,
  title: string,
  meta: Record<string, unknown> | null | undefined
): TemplateReminderTarget | null {
  const dueAt = resolveTemplateDueReminderAt(meta);
  if (!dueAt) return null;
  return { templateId, title, dueReminderAt: dueAt.toISOString() };
}
