export type MessageDelivery = "inbox" | "toast" | "modal";

export type TenantMessage = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  source: "tenant" | "global";
  delivery: MessageDelivery;
};

export function messageKey(msg: Pick<TenantMessage, "id" | "source">) {
  return `${msg.source}:${msg.id}`;
}

export function normalizeDelivery(value: unknown): MessageDelivery {
  if (value === "inbox" || value === "toast" || value === "modal") return value;
  return "modal";
}

const ACKED_PREFIX = "iso-msg-acked:v1:";
const TOAST_SHOWN_PREFIX = "iso-msg-toast-shown:v1:";
const SOUND_UNLOCKED = "iso-msg-sound-unlocked:v1";

function readIdSet(prefix: string, tenantSlug: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${prefix}${tenantSlug}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeIdSet(prefix: string, tenantSlug: string, set: Set<string>) {
  const trimmed = [...set].slice(-120);
  try {
    localStorage.setItem(`${prefix}${tenantSlug}`, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function readAckedMessageKeys(tenantSlug: string) {
  return readIdSet(ACKED_PREFIX, tenantSlug);
}

export function markMessageAcked(tenantSlug: string, key: string) {
  const set = readAckedMessageKeys(tenantSlug);
  set.add(key);
  writeIdSet(ACKED_PREFIX, tenantSlug, set);
}

export function readToastShownKeys(tenantSlug: string) {
  return readIdSet(TOAST_SHOWN_PREFIX, tenantSlug);
}

export function markToastShown(tenantSlug: string, key: string) {
  const set = readToastShownKeys(tenantSlug);
  set.add(key);
  writeIdSet(TOAST_SHOWN_PREFIX, tenantSlug, set);
}

export function unlockMessageSound() {
  try {
    localStorage.setItem(SOUND_UNLOCKED, "1");
  } catch {
    // ignore
  }
}

export function isMessageSoundUnlocked() {
  try {
    return localStorage.getItem(SOUND_UNLOCKED) === "1";
  } catch {
    return false;
  }
}

let audioCtx: AudioContext | null = null;

export function playNewMessageSound() {
  if (typeof window === "undefined") return;
  if (!isMessageSoundUnlocked()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // ignore autoplay restrictions
  }
}

export function tryBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, icon: "/icon-192.png" });
  } catch {
    // ignore
  }
}

export function requestNotificationPermissionOnce() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
}

const READ_ARCHIVE_DAYS = 7;

export function isRecentlyRead(msg: TenantMessage) {
  if (!msg.isRead || !msg.createdAt) return false;
  const age = Date.now() - new Date(msg.createdAt).getTime();
  return age < READ_ARCHIVE_DAYS * 86_400_000;
}

export function filterInboxMessages(messages: TenantMessage[], tab: "unread" | "all") {
  if (tab === "unread") return messages.filter((m) => !m.isRead);
  return messages.filter((m) => !m.isRead || isRecentlyRead(m));
}
