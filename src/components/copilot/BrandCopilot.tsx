"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PlanLimitModal } from "@/components/plan/PlanLimitModal";
import { apiUrl } from "@/lib/client/apiBase";
import { resolveWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import { Z_COPILOT_FAB, Z_COPILOT_HINT, Z_COPILOT_PANEL } from "@/lib/ui/zIndex";
import { getContextualWelcome, pickRotatingHint } from "@/lib/copilot/hints";
import { buildSpotlightWelcome } from "@/lib/copilot/welcomeSpotlight";
import { CopilotWelcomeSpotlight } from "@/components/copilot/CopilotWelcomeSpotlight";
import type { SpotlightAction } from "@/lib/copilot/welcomeSpotlight";
import { COPILOT_OPEN_EVENT } from "@/lib/copilot/events";
import {
  dcAiDisplayTitle,
  dcAiHeaderSubtitle,
  dcAiHintLabel,
  DC_AI_NAME,
} from "@/lib/ai/deepControl";
import {
  appendLocalCopilotMessage,
  readLocalCopilotHistory,
  readLocalCopilotPrefs,
  writeLocalCopilotPrefs,
} from "@/lib/copilot/localContext";
import type { CopilotAction, CopilotCapabilities } from "@/lib/copilot/intents";
import type { CopilotAccessStatus } from "@/lib/tenantPlan";
import type { PlanLimitKind } from "@/lib/planLimitMessaging";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  actions?: CopilotAction[];
  suggestions?: string[];
};

type Props = {
  tenantSlug: string;
  brandName?: string;
};

const DEFAULT_CAPS: CopilotCapabilities = {
  canCreateForms: false,
  canManageCategories: false,
  canManageStaff: false,
  canAccessSettings: false,
};

/** First-run spotlight + corner tips timing */
const COPILOT_TIMING = {
  /** Centre welcome card — show soon after load */
  SPOTLIGHT_DELAY_MS: 2_000,
  /** Auto-hide spotlight if ignored */
  SPOTLIGHT_AUTO_HIDE_MS: 28_000,
  /** Corner greeting (returning users who already saw spotlight) */
  GREETING_DELAY_MS: 8_000,
  GREETING_AUTO_HIDE_MS: 11_000,
  /** Rotating tips after spotlight / greeting */
  HINTS_START_DELAY_MS: 14_000,
  HINT_AUTO_HIDE_MS: 9_000,
  HINT_ROTATE_MS: 16_000,
} as const;

function renderInlineBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={`${i}-${part}`} className="font-semibold">
        {part}
      </strong>
    ) : (
      <span key={`${i}-${part}`}>{part}</span>
    ),
  );
}

function CopilotHintBubble({
  text,
  onOpen,
  onDismiss,
}: {
  text: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="pointer-events-auto relative w-full max-w-[min(calc(100vw-5.5rem),300px)]"
      style={{ zIndex: Z_COPILOT_HINT }}
    >
      <div className="relative rounded-2xl rounded-br-sm border border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-background shadow-lg ring-1 ring-black/5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full text-foreground/45 hover:bg-foreground/10 hover:text-foreground"
          aria-label="Dismiss tip"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="group w-full rounded-2xl rounded-br-sm px-3.5 py-2.5 pr-9 text-left text-xs leading-snug text-foreground/85 transition hover:border-[var(--hse-teal)]"
        >
          <span className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45 border-b border-r border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-background" />
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--hse-teal)]">
            <Sparkles className="h-3 w-3" />
            {dcAiHintLabel()}
          </span>
          <span className="line-clamp-3">{text}</span>
          <span className="mt-1.5 inline-block text-[10px] font-medium text-[var(--hse-teal)] group-hover:underline">
            Tap to chat →
          </span>
        </button>
      </div>
    </div>
  );
}

function CopilotGreetingBubble({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-auto relative w-full max-w-[min(calc(100vw-5.5rem),300px)]">
      <div className="relative overflow-hidden rounded-2xl rounded-br-md border-2 border-[color-mix(in_srgb,var(--hse-teal)_45%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--hse-teal)_12%,white)] to-background shadow-xl">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-foreground/50 shadow-sm hover:text-foreground"
          aria-label="Dismiss greeting"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onOpen} className="block w-full px-4 py-3 pr-9 text-left">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hse-teal)] text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">Hi! I&apos;m ISO Grid AI</div>
              <div className="text-[11px] font-medium text-[var(--hse-teal)]">Your AI assistant</div>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-foreground/75">
            How can I help you today? Ask about forms, saved submissions, staff, or settings.
          </p>
          <span className="mt-2 inline-block text-[11px] font-semibold text-[var(--hse-teal)]">
            Tap to start chatting →
          </span>
        </button>
      </div>
    </div>
  );
}

export function BrandCopilot({ tenantSlug, brandName }: Props) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [caps, setCaps] = useState<CopilotCapabilities>(DEFAULT_CAPS);
  const [hintIndex, setHintIndex] = useState(0);
  const [hintsHidden, setHintsHidden] = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [greetingReady, setGreetingReady] = useState(false);
  const [spotlightDismissed, setSpotlightDismissed] = useState(false);
  const [spotlightReady, setSpotlightReady] = useState(false);
  const [spotlightSeen, setSpotlightSeen] = useState(true);
  const [hintsReady, setHintsReady] = useState(false);
  const [currentHintDismissed, setCurrentHintDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const welcomedRef = useRef(false);
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [planLimitKind, setPlanLimitKind] = useState<PlanLimitKind>("copilot_trial_expired");
  const [copilotAccess, setCopilotAccess] = useState<CopilotAccessStatus | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const userId = session?.user?.id || null;

  const spotlightWelcome = useMemo(
    () => buildSpotlightWelcome({ tenantSlug, pathname, caps, brandName }),
    [tenantSlug, pathname, caps, brandName],
  );

  const showSpotlight =
    spotlightReady &&
    !spotlightDismissed &&
    !spotlightSeen &&
    !hintsHidden &&
    !open &&
    (!copilotAccess || copilotAccess.allowed);

  const activeHint = useMemo(
    () =>
      hintsReady && !open && !hintsHidden && (spotlightSeen || spotlightDismissed) && greetingDismissed && (!copilotAccess || copilotAccess.allowed)
        ? pickRotatingHint(pathname, caps, hintIndex)
        : null,
    [hintsReady, open, hintsHidden, spotlightSeen, spotlightDismissed, greetingDismissed, copilotAccess, pathname, caps, hintIndex],
  );

  const showGreeting =
    spotlightSeen &&
    greetingReady &&
    !greetingDismissed &&
    !hintsHidden &&
    !open &&
    (!copilotAccess || copilotAccess.allowed);

  const showHintBubble = Boolean(activeHint && !currentHintDismissed);

  /** Attention animation when a bubble is visible — not on the bare FAB */
  const showAttentionAnim = showSpotlight || showGreeting || showHintBubble;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const prefs = readLocalCopilotPrefs(tenantSlug);
    const hidden = prefs.hintsHidden === true;
    setHintsHidden(hidden);
    setSpotlightSeen(prefs.spotlightSeen === true);
    if (hidden || prefs.greetingSeen) {
      setGreetingDismissed(true);
    }
    if (hidden || prefs.spotlightSeen) {
      setSpotlightDismissed(true);
    }
  }, [tenantSlug]);

  // Centre spotlight — first impression for new testers
  useEffect(() => {
    if (hintsHidden || open || spotlightSeen || spotlightDismissed) return;
    const id = window.setTimeout(() => setSpotlightReady(true), COPILOT_TIMING.SPOTLIGHT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [hintsHidden, open, spotlightSeen, spotlightDismissed, tenantSlug]);

  useEffect(() => {
    if (!spotlightReady || spotlightDismissed || spotlightSeen || open) return;
    const id = window.setTimeout(() => {
      setSpotlightDismissed(true);
      setGreetingDismissed(true);
      setSpotlightSeen(true);
      writeLocalCopilotPrefs(tenantSlug, { spotlightSeen: true, greetingSeen: true });
    }, COPILOT_TIMING.SPOTLIGHT_AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [spotlightReady, spotlightDismissed, spotlightSeen, open, tenantSlug]);

  // Corner greeting — returning users only
  useEffect(() => {
    if (!spotlightSeen || hintsHidden || open || greetingDismissed) return;
    const id = window.setTimeout(() => setGreetingReady(true), COPILOT_TIMING.GREETING_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [spotlightSeen, hintsHidden, open, greetingDismissed, tenantSlug]);

  // Auto-hide greeting after a while if user ignores it
  useEffect(() => {
    if (!greetingReady || greetingDismissed || open) return;
    const id = window.setTimeout(() => {
      setGreetingDismissed(true);
      writeLocalCopilotPrefs(tenantSlug, { greetingSeen: true });
    }, COPILOT_TIMING.GREETING_AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [greetingReady, greetingDismissed, open, tenantSlug]);

  // Rotating tips only after user has been on the page a while
  useEffect(() => {
    if (hintsHidden || open) return;
    const id = window.setTimeout(() => setHintsReady(true), COPILOT_TIMING.HINTS_START_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [hintsHidden, open, tenantSlug]);

  // Auto-hide each rotating tip; next one appears on the rotate interval
  useEffect(() => {
    if (!hintsReady || hintsHidden || open || !greetingDismissed) return;
    if (currentHintDismissed) return;
    const id = window.setTimeout(() => setCurrentHintDismissed(true), COPILOT_TIMING.HINT_AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [hintsReady, hintsHidden, open, greetingDismissed, hintIndex, currentHintDismissed]);

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    (async () => {
      const token = await resolveWorkspaceAccessToken(session);
      if (!token || cancelled) return;
      fetch(apiUrl(`/api/workspace/storage?tenantSlug=${encodeURIComponent(tenantSlug)}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.copilotAccess) {
            setCopilotAccess(data.copilotAccess as CopilotAccessStatus);
          }
        })
        .catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, tenantSlug]);

  useEffect(() => {
    if (!open) {
      welcomedRef.current = false;
      return;
    }
    if (copilotAccess && !copilotAccess.allowed) {
      setPlanLimitKind(
        copilotAccess.reason === "disabled" ? "copilot_disabled" : "copilot_trial_expired",
      );
      setPlanLimitOpen(true);
      setOpen(false);
      return;
    }
    if (welcomedRef.current) return;
    welcomedRef.current = true;
    const local = readLocalCopilotHistory(tenantSlug, userId);
    if (local.length > 0) {
      setMessages(
        local.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
      );
      return;
    }
    const w = getContextualWelcome(pathname, caps, brandName);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: w.message,
        suggestions: w.suggestions,
      },
    ]);
  }, [open, pathname, caps, brandName, copilotAccess, tenantSlug, userId]);

  useEffect(() => {
    if (hintsHidden || open || !hintsReady) return;
    if (copilotAccess && !copilotAccess.allowed) return;
    const id = window.setInterval(() => {
      setHintIndex((i) => i + 1);
      setCurrentHintDismissed(false);
    }, COPILOT_TIMING.HINT_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [hintsHidden, open, hintsReady, copilotAccess]);

  useEffect(() => {
    setCurrentHintDismissed(false);
  }, [hintIndex]);

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    (async () => {
      const token = await resolveWorkspaceAccessToken(session);
      if (!token || cancelled) return;
      fetch(apiUrl(`/api/workspace/capabilities?tenantSlug=${encodeURIComponent(tenantSlug)}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return;
          const c = data.capabilities;
          if (c) {
            setCaps({
              canCreateForms: Boolean(c.canCreateForms),
              canManageCategories: Boolean(c.canManageCategories),
              canManageStaff: Boolean(c.canManageStaff),
              canAccessSettings: Boolean(c.canAccessSettings),
            });
          }
        })
        .catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, tenantSlug]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, loading]);

  useEffect(() => {
    function onOpen() {
      handleOpenCopilot();
    }
    window.addEventListener(COPILOT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COPILOT_OPEN_EVENT, onOpen);
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const token = await resolveWorkspaceAccessToken(session);
    if (!token) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Please sign in again to use the AI assistant.",
        },
      ]);
      return;
    }

    appendLocalCopilotMessage(tenantSlug, userId, {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    });
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      let res = await fetch(apiUrl("/api/copilot/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed, tenantSlug, pathname }),
      });

      if (res.status === 401) {
        const refreshed = await resolveWorkspaceAccessToken(session);
        if (refreshed) {
          res = await fetch(apiUrl("/api/copilot/chat"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${refreshed}`,
            },
            body: JSON.stringify({ message: trimmed, tenantSlug, pathname }),
          });
        }
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 403 && (data?.code === "copilot_disabled" || String(data.message || "").includes("not enabled"))) {
        setPlanLimitKind("copilot_disabled");
        setPlanLimitOpen(true);
        return;
      }
      if (res.status === 402 && data?.code === "copilot_trial_expired") {
        setCopilotAccess(data.copilotAccess ?? null);
        setPlanLimitKind("copilot_trial_expired");
        setPlanLimitOpen(true);
        return;
      }
      if (!res.ok) throw new Error(data?.error || `${DC_AI_NAME} is unavailable`);

      const navigateTo = typeof data.navigateTo === "string" ? data.navigateTo.trim() : "";
      const navigateLabel =
        typeof data.navigateLabel === "string" ? data.navigateLabel.trim() : "your destination";

      const assistantContent = navigateTo
        ? `${String(data.message || "Here's what I found.")}\n\n**Taking you there…** (${navigateLabel})`
        : String(
            data.message ||
              (Array.isArray(data.actions) && data.actions.length
                ? "Here are some options that might help."
                : "Here's what I found."),
          );

      const assistantMsg = {
        id: `a-${Date.now()}`,
        role: "assistant" as const,
        content: assistantContent,
        actions: Array.isArray(data.actions) ? data.actions : [],
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      };
      appendLocalCopilotMessage(tenantSlug, userId, {
        id: assistantMsg.id,
        role: "assistant",
        content: assistantMsg.content,
      });
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.copilotAccess) setCopilotAccess(data.copilotAccess);

      if (navigateTo) {
        setNavigatingTo(navigateLabel);
        window.setTimeout(() => {
          setNavigatingTo(null);
          handleNavigate(navigateTo);
        }, 900);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleAction(action: CopilotAction) {
    if (action.type === "open_url" || action.href.startsWith("mailto:")) {
      window.location.href = action.href;
      return;
    }
    handleNavigate(action.href);
  }

  function handleNavigate(href: string) {
    setNavigatingTo(null);
    setOpen(false);
    router.push(href);
  }

  function dismissCurrentHint() {
    setCurrentHintDismissed(true);
  }

  function dismissSpotlight() {
    setSpotlightDismissed(true);
    setGreetingDismissed(true);
    setSpotlightSeen(true);
    writeLocalCopilotPrefs(tenantSlug, { spotlightSeen: true, greetingSeen: true });
  }

  function dismissGreeting() {
    setGreetingDismissed(true);
    writeLocalCopilotPrefs(tenantSlug, { greetingSeen: true });
  }

  function dismissHints() {
    setHintsHidden(true);
    setGreetingDismissed(true);
    setSpotlightDismissed(true);
    setSpotlightSeen(true);
    writeLocalCopilotPrefs(tenantSlug, { hintsHidden: true, greetingSeen: true, spotlightSeen: true });
  }

  function handleOpenCopilot(prefill?: string) {
    writeLocalCopilotPrefs(tenantSlug, { greetingSeen: true, spotlightSeen: true });
    setGreetingDismissed(true);
    setSpotlightDismissed(true);
    setSpotlightSeen(true);
    if (copilotAccess && !copilotAccess.allowed) {
      setPlanLimitKind(
        copilotAccess.reason === "disabled" ? "copilot_disabled" : "copilot_trial_expired",
      );
      setPlanLimitOpen(true);
      return;
    }
    setOpen(true);
    if (prefill?.trim()) {
      window.setTimeout(() => void sendMessage(prefill.trim()), 120);
    }
  }

  function handleSpotlightAction(action: SpotlightAction) {
    dismissSpotlight();
    if (action.prompt) {
      handleOpenCopilot(action.prompt);
      return;
    }
    if (action.href) {
      setOpen(false);
      router.push(action.href);
    }
  }

  if (!tenantSlug) return null;

  const settingsHref = `/${tenantSlug}/settings?focus=usage`;

  const copilotPanel = open ? (
    <div
      className="fixed inset-x-0 bottom-0 flex max-h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-2xl border border-foreground/15 bg-background shadow-2xl sm:inset-x-auto sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:right-6 sm:w-[min(100vw-2rem,420px)] sm:rounded-2xl print:hidden"
      style={{ zIndex: Z_COPILOT_PANEL }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-foreground/10 bg-gradient-to-r from-[color-mix(in_srgb,var(--hse-teal)_14%,white)] to-background px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{dcAiDisplayTitle(brandName)}</div>
            <div className="truncate text-[11px] text-foreground/55">
              {navigatingTo
                ? `Taking you to ${navigatingTo}…`
                : copilotAccess?.reason === "trial_active" && copilotAccess.daysRemaining > 0
                  ? `${dcAiHeaderSubtitle(brandName)} · ${copilotAccess.daysRemaining}d trial left`
                  : dcAiHeaderSubtitle(brandName)}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={Boolean(navigatingTo)}
          className="shrink-0 rounded-full p-2 text-foreground/50 hover:bg-foreground/5 disabled:opacity-40"
          aria-label="Close assistant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {navigatingTo ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_10%,white)] px-4 py-2 text-xs font-medium text-[var(--hse-teal)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Taking you there…
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
        <div className="space-y-2.5">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  "max-w-[min(100%,20rem)] rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-[90%] " +
                  (msg.role === "user"
                    ? "rounded-br-md bg-[var(--hse-teal)] text-white"
                    : "rounded-bl-md border border-foreground/10 bg-foreground/[0.04]")
                }
              >
                <p className="whitespace-pre-wrap break-words">{renderInlineBold(msg.content)}</p>
                {msg.actions && msg.actions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.actions.map((action) => (
                      <button
                        key={`${msg.id}-${action.href}`}
                        type="button"
                        className="max-w-full truncate rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_35%,transparent)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)]"
                        onClick={() => handleAction(action)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {msg.suggestions && msg.suggestions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {msg.suggestions.map((s) => (
                      <button
                        key={`${msg.id}-${s}`}
                        type="button"
                        className="max-w-full truncate rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] text-foreground/70 hover:bg-foreground/10"
                        onClick={() => void sendMessage(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-foreground/10 bg-foreground/[0.04] px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--hse-teal)]" />
              </div>
            </div>
          ) : null}
        </div>
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-foreground/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-full border border-foreground/15 bg-foreground/[0.03] px-3 text-sm focus:border-[var(--hse-teal)] focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)]"
            placeholder="Ask me anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendMessage(input);
              }
            }}
            disabled={loading || Boolean(navigatingTo)}
          />
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--hse-teal)] text-white disabled:opacity-50"
            disabled={loading || !input.trim() || Boolean(navigatingTo)}
            onClick={() => void sendMessage(input)}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {!open && (!copilotAccess || copilotAccess.allowed) ? (
        <div
          className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 flex max-w-[min(calc(100vw-2rem),320px)] flex-col items-end gap-2 sm:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:right-6 print:hidden"
          style={{ zIndex: Z_COPILOT_FAB }}
        >
          {showGreeting ? (
            <CopilotGreetingBubble onOpen={() => handleOpenCopilot()} onDismiss={dismissGreeting} />
          ) : null}
          {showHintBubble && activeHint ? (
            <CopilotHintBubble
              text={activeHint.text}
              onOpen={() => handleOpenCopilot()}
              onDismiss={dismissCurrentHint}
            />
          ) : null}

          <div className="pointer-events-auto relative">
            {showAttentionAnim ? (
              <>
                <span
                  className="absolute inset-0 animate-ping rounded-full bg-[var(--hse-teal)] opacity-20"
                  aria-hidden
                />
                <span
                  className="absolute -inset-1 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)]"
                  aria-hidden
                />
              </>
            ) : null}
            <button
              type="button"
              onClick={() => handleOpenCopilot()}
              className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-[var(--hse-teal)] text-white shadow-[0_8px_32px_rgba(15,118,110,0.45)] ring-4 ring-white transition hover:scale-105 hover:shadow-[0_12px_40px_rgba(15,118,110,0.55)] sm:h-[4.5rem] sm:w-[4.5rem]"
              aria-label={`Open ${DC_AI_NAME}`}
              title={DC_AI_NAME}
            >
              <Sparkles className="h-7 w-7" />
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-[var(--hse-teal)] shadow-md">
                AI
              </span>
            </button>
          </div>

          {hintsReady && !hintsHidden && greetingDismissed && !showHintBubble ? (
            <button
              type="button"
              onClick={dismissHints}
              className="pointer-events-auto rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground/55 hover:bg-foreground/15"
            >
              Hide all tips
            </button>
          ) : null}
        </div>
      ) : null}

      {portalReady && showSpotlight
        ? createPortal(
            <CopilotWelcomeSpotlight
              welcome={spotlightWelcome}
              onAction={handleSpotlightAction}
              onOpenChat={() => handleOpenCopilot()}
              onDismiss={dismissSpotlight}
            />,
            document.body,
          )
        : null}

      {portalReady && copilotPanel
        ? createPortal(copilotPanel, document.body)
        : null}

      <PlanLimitModal
        open={planLimitOpen}
        kind={planLimitKind}
        details={{ brandName, tenantSlug }}
        settingsHref={settingsHref}
        onClose={() => setPlanLimitOpen(false)}
      />
    </>
  );
}
