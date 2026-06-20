"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PlanLimitModal } from "@/components/plan/PlanLimitModal";
import { apiUrl } from "@/lib/client/apiBase";
import { getContextualWelcome, pickRotatingHint } from "@/lib/copilot/hints";
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

const HINT_DISMISS_KEY = "iso-copilot-hints-dismissed";

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
    <div className="pointer-events-auto fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[89] flex max-w-[min(calc(100vw-5.5rem),280px)] flex-col items-end gap-1 sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:right-6">
      <button
        type="button"
        onClick={onOpen}
        className="group relative w-full rounded-2xl rounded-br-sm border border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-background px-3.5 py-2.5 text-left text-xs leading-snug text-foreground/85 shadow-lg ring-1 ring-black/5 transition hover:border-[var(--hse-teal)] hover:shadow-xl"
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
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground/55 hover:bg-foreground/15"
      >
        Hide tips
      </button>
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
  const endRef = useRef<HTMLDivElement | null>(null);
  const welcomedRef = useRef(false);
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [planLimitKind, setPlanLimitKind] = useState<PlanLimitKind>("copilot_trial_expired");
  const [copilotAccess, setCopilotAccess] = useState<CopilotAccessStatus | null>(null);
  const userId = session?.user?.id || null;

  useEffect(() => {
    setHintsHidden(readLocalCopilotPrefs(tenantSlug).hintsHidden === true);
  }, [tenantSlug]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !tenantSlug) return;
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
  }, [session?.access_token, tenantSlug]);

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
    if (hintsHidden || open) return;
    if (copilotAccess && !copilotAccess.allowed) return;
    const id = window.setInterval(() => setHintIndex((i) => i + 1), 9000);
    return () => window.clearInterval(id);
  }, [hintsHidden, open, copilotAccess]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !tenantSlug) return;
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
  }, [session?.access_token, tenantSlug]);

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

  const activeHint =
    !open && !hintsHidden && (!copilotAccess || copilotAccess.allowed)
      ? pickRotatingHint(pathname, caps, hintIndex)
      : null;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const token = session?.access_token;
    if (!token) return;

    appendLocalCopilotMessage(tenantSlug, userId, {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    });
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(apiUrl("/api/copilot/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed, tenantSlug, pathname }),
      });
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

      const assistantMsg = {
        id: `a-${Date.now()}`,
        role: "assistant" as const,
        content: String(data.message || "Here's what I found."),
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

  function handleNavigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  function dismissHints() {
    setHintsHidden(true);
    writeLocalCopilotPrefs(tenantSlug, { hintsHidden: true });
  }

  function handleOpenCopilot() {
    if (copilotAccess && !copilotAccess.allowed) {
      setPlanLimitKind(
        copilotAccess.reason === "disabled" ? "copilot_disabled" : "copilot_trial_expired",
      );
      setPlanLimitOpen(true);
      return;
    }
    setOpen(true);
  }

  if (!tenantSlug) return null;

  const settingsHref = `/${tenantSlug}/settings?focus=usage`;

  return (
    <>
      {!open && activeHint ? (
        <CopilotHintBubble text={activeHint.text} onOpen={handleOpenCopilot} onDismiss={dismissHints} />
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={handleOpenCopilot}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--hse-teal)] text-white shadow-lg ring-4 ring-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)] transition hover:scale-105 hover:shadow-xl sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:right-6 print:hidden"
          aria-label={`Open ${DC_AI_NAME}`}
          title={DC_AI_NAME}
        >
          <Sparkles className="h-6 w-6" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white px-0.5 text-[8px] font-bold text-[var(--hse-teal)] shadow">
            DC
          </span>
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-[95] flex max-h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-2xl border border-foreground/15 bg-background shadow-2xl sm:inset-x-auto sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:right-6 sm:w-[min(100vw-2rem,420px)] sm:rounded-2xl print:hidden">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-foreground/10 bg-gradient-to-r from-[color-mix(in_srgb,var(--hse-teal)_14%,white)] to-background px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{dcAiDisplayTitle(brandName)}</div>
                <div className="truncate text-[11px] text-foreground/55">
                  {copilotAccess?.reason === "trial_active" && copilotAccess.daysRemaining > 0
                    ? `${dcAiHeaderSubtitle(brandName)} · ${copilotAccess.daysRemaining}d trial left`
                    : dcAiHeaderSubtitle(brandName)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-full p-2 text-foreground/50 hover:bg-foreground/5"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
                            onClick={() => handleNavigate(action.href)}
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
                disabled={loading}
              />
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--hse-teal)] text-white disabled:opacity-50"
                disabled={loading || !input.trim()}
                onClick={() => void sendMessage(input)}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
