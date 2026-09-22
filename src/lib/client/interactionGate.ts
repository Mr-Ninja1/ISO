/**
 * App-wide gate so background I/O (cache storms, pull sync, bulk schema writes)
 * yields the main thread while the user is navigating — keeps opens feeling native.
 */

let busyUntilMs = 0;

/** Call at the start of user-driven navigation (open form, leave workspace, etc.). */
export function markInteractiveNav(durationMs = 2800) {
  const until = Date.now() + Math.max(0, durationMs);
  if (until > busyUntilMs) busyUntilMs = until;
}

export function isInteractiveNavBusy(): boolean {
  return Date.now() < busyUntilMs;
}

/** True when background work should pause (nav in flight or tab hidden). */
export function shouldPauseBackgroundWork(): boolean {
  if (isInteractiveNavBusy()) return true;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return true;
  return false;
}

/** Yield one macrotask so click/nav paint can run. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Wait until interactive nav settles, yielding periodically. */
export async function waitForInteractiveNavClear(maxWaitMs = 4000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (isInteractiveNavBusy() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 32));
  }
}

/** Run work after a short delay, preferring idle time when available. */
export function scheduleIdleWork(task: () => void, delayMs = 0): () => void {
  if (typeof window === "undefined") {
    task();
    return () => {};
  }

  let idleId: number | null = null;
  const timeoutId = window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      idleId = (
        window as Window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(task, { timeout: 1500 });
      return;
    }
    task();
  }, delayMs);

  return () => {
    window.clearTimeout(timeoutId);
    if (idleId !== null && "cancelIdleCallback" in window) {
      (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
    }
  };
}
