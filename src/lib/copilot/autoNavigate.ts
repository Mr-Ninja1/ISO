import type { CopilotAction } from "@/lib/copilot/intents";

/** Explicit navigation commands — safe to auto-navigate when there is one destination. */
const EXPLICIT_NAV =
  /^(open|go to|take me to|navigate to|bring me to|jump to)\s+.+$/i;

/** "Where is/are …" with a recognizable destination. */
const WHERE_DEST =
  /^where (is|are)\s+(the\s+)?(saved forms?|submitted forms?|settings|categories|staff|workspace|templates?|dashboard|form builder)/i;

/** Short exact destination (no extra ambiguity). */
const EXACT_DEST =
  /^(saved forms?|submitted forms?|settings|categories|staff|workspace|templates?|dashboard|form builder|create form)[.?!]*$/i;

/** Specific saved-forms + today (clear intent). */
const SAVED_TODAY =
  /\bforms?\b.*\b(saved|submitted)\b.*\btoday\b|\btoday\b.*\b(saved|submitted)\b.*\bforms?\b|\bforms? that were (saved|submitted)\b.*\btoday\b/i;

/** Clear "see/view saved/submitted forms" — not bare "forms". */
const VIEW_SAVED_EXPLICIT =
  /\b(want|like|need) to (see|view|show|find|check)\b.*\bforms?\b.*\b(saved|submitted)\b|\b(see|view|show)\b.*\b(saved|submitted)\b.*\bforms?\b/i;

const VAGUE_SIGNAL =
  /^(help|forms?|hi|hello|hey|something|stuff|what|where|show me|i want|can you)[.?!]*$/i;

/** True only when intent is unambiguous — user can still tap action buttons otherwise. */
export function shouldAutoNavigate(message: string, actions: CopilotAction[]): boolean {
  if (actions.length !== 1 || actions[0]?.type !== "navigate") return false;

  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 8) return false;

  if (/how (do|can|should|to)\b/i.test(trimmed)) return false;
  if (/step by step|walk me through|explain how|what can you/i.test(trimmed)) return false;
  if (VAGUE_SIGNAL.test(trimmed)) return false;
  if (/\b(or|maybe|either|not sure|something like)\b/i.test(trimmed)) return false;

  if (EXPLICIT_NAV.test(trimmed)) return true;
  if (WHERE_DEST.test(trimmed)) return true;
  if (EXACT_DEST.test(trimmed)) return true;
  if (SAVED_TODAY.test(trimmed)) return true;
  if (VIEW_SAVED_EXPLICIT.test(trimmed)) return true;

  return false;
}

export function pickAutoNavigateHref(message: string, actions: CopilotAction[]): string | null {
  if (!shouldAutoNavigate(message, actions)) return null;
  return actions[0]?.href || null;
}

export function autoNavigateLabel(actions: CopilotAction[]): string {
  return actions[0]?.label || "your destination";
}
