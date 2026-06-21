"use client";

const PREFIX = "dc-ai-context:v1";
const MAX_MESSAGES = 24;

export type LocalCopilotMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  ts: number;
};

function storageKey(tenantSlug: string, userId: string | null) {
  return `${PREFIX}:${tenantSlug}:${userId || "anon"}`;
}

export function readLocalCopilotHistory(
  tenantSlug: string,
  userId: string | null,
): LocalCopilotMessage[] {
  if (!tenantSlug || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(tenantSlug, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalCopilotMessage[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_MESSAGES) : [];
  } catch {
    return [];
  }
}

export function writeLocalCopilotHistory(
  tenantSlug: string,
  userId: string | null,
  messages: LocalCopilotMessage[],
) {
  if (!tenantSlug || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(tenantSlug, userId),
      JSON.stringify(messages.slice(-MAX_MESSAGES)),
    );
  } catch {
    // quota — drop oldest half
    try {
      localStorage.setItem(
        storageKey(tenantSlug, userId),
        JSON.stringify(messages.slice(-Math.floor(MAX_MESSAGES / 2))),
      );
    } catch {
      // ignore
    }
  }
}

export function appendLocalCopilotMessage(
  tenantSlug: string,
  userId: string | null,
  message: Omit<LocalCopilotMessage, "ts"> & { ts?: number },
) {
  const prev = readLocalCopilotHistory(tenantSlug, userId);
  const next: LocalCopilotMessage = {
    ...message,
    ts: message.ts ?? Date.now(),
  };
  writeLocalCopilotHistory(tenantSlug, userId, [...prev, next]);
}

export function clearLocalCopilotHistory(tenantSlug: string, userId: string | null) {
  if (!tenantSlug || typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(tenantSlug, userId));
  } catch {
    // ignore
  }
}

export type LocalCopilotPrefs = {
  hintsHidden?: boolean;
  /** User has seen or dismissed the one-time greeting bubble */
  greetingSeen?: boolean;
};

/** Lightweight prefs — no server round-trip */
export function readLocalCopilotPrefs(tenantSlug: string): LocalCopilotPrefs {
  try {
    const raw = localStorage.getItem(`${PREFIX}:prefs:${tenantSlug}`);
    return raw ? (JSON.parse(raw) as LocalCopilotPrefs) : {};
  } catch {
    return {};
  }
}

export function writeLocalCopilotPrefs(tenantSlug: string, prefs: LocalCopilotPrefs) {
  try {
    const prev = readLocalCopilotPrefs(tenantSlug);
    localStorage.setItem(`${PREFIX}:prefs:${tenantSlug}`, JSON.stringify({ ...prev, ...prefs }));
  } catch {
    // ignore
  }
}
