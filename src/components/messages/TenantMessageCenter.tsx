"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { CenteredOverlay } from "@/components/ui/CenteredOverlay";
import { NotificationModal } from "@/components/NotificationModal";
import { useAuth } from "@/components/AuthProvider";
import { apiUrl } from "@/lib/client/apiBase";
import { appendTenantAlertsClientParams } from "@/lib/platformAudience";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import { clearTenantDeactivatedBlocked, dispatchTenantDeactivated } from "@/lib/client/brandAccess";
import {
  filterInboxMessages,
  markMessageAcked,
  markToastShown,
  messageKey,
  normalizeDelivery,
  playNewMessageSound,
  readAckedMessageKeys,
  readToastShownKeys,
  requestNotificationPermissionOnce,
  tryBrowserNotification,
  unlockMessageSound,
  type MessageDelivery,
  type TenantMessage,
} from "@/lib/client/tenantMessages";

type TenantAlertsResponse = {
  alerts?: Array<{
    id: string;
    title: string;
    message: string;
    createdAt: string;
    isRead: boolean;
    source?: "tenant" | "global";
    delivery?: MessageDelivery;
  }>;
  error?: string;
  code?: string;
  deactivationReason?: string | null;
};

type ToastItem = {
  key: string;
  title: string;
  message: string;
  onOpenInbox: () => void;
};

type MessageContextValue = {
  tenantSlug: string | null;
  unreadCount: number;
  openInbox: () => void;
  refresh: () => void;
};

const MessageContext = createContext<MessageContextValue | null>(null);

function normalizeTenantSlug(value: string | null | undefined) {
  const slug = (value || "").trim();
  if (!slug || slug === "_" || slug === "workspace") return null;
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return null;
  return slug;
}

function tenantSlugFromRoute(pathname: string | null, querySlug: string | null) {
  const fromQuery = normalizeTenantSlug(querySlug);
  if (fromQuery) return fromQuery;
  if (!pathname) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0];
  const reserved = new Set(["workspace", "dashboard", "login", "signup", "onboarding", "offline", "admin", "developer-login", "_"]);
  if (reserved.has(first)) return null;
  return normalizeTenantSlug(first);
}

type Props = {
  children?: ReactNode;
};

export function TenantMessageProvider({ children }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const accessToken = getWorkspaceAccessToken(session);

  const tenantSlug = useMemo(
    () => tenantSlugFromRoute(pathname, searchParams.get("tenantSlug")),
    [pathname, searchParams]
  );

  const [messages, setMessages] = useState<TenantMessage[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxTab, setInboxTab] = useState<"unread" | "all">("unread");
  const [loading, setLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [modalQueue, setModalQueue] = useState<TenantMessage[]>([]);
  const [activeModal, setActiveModal] = useState<TenantMessage | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [nudgeBanner, setNudgeBanner] = useState<string | null>(null);

  const ackedRef = useRef<Set<string>>(new Set());
  const toastShownRef = useRef<Set<string>>(new Set());
  const prevUnreadKeysRef = useRef<Set<string>>(new Set());

  const unreadCount = useMemo(() => messages.filter((m) => !m.isRead).length, [messages]);
  const inboxList = useMemo(() => filterInboxMessages(messages, inboxTab), [messages, inboxTab]);

  const openInbox = useCallback(() => {
    unlockMessageSound();
    requestNotificationPermissionOnce();
    setInboxOpen(true);
    setNudgeBanner(null);
  }, []);

  const enqueueModal = useCallback((msg: TenantMessage) => {
    setModalQueue((q) => {
      if (q.some((x) => messageKey(x) === messageKey(msg))) return q;
      return [...q, msg];
    });
  }, []);

  const showToast = useCallback(
    (msg: TenantMessage) => {
      const key = messageKey(msg);
      setToasts((t) => {
        if (t.some((x) => x.key === key)) return t;
        return [
          ...t.slice(-4),
          {
            key,
            title: msg.title,
            message: msg.message,
            onOpenInbox: () => openInbox(),
          },
        ];
      });
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.key !== key));
      }, 12_000);
    },
    [openInbox]
  );

  const processNewMessages = useCallback(
    (next: TenantMessage[], slug: string) => {
      ackedRef.current = readAckedMessageKeys(slug);
      toastShownRef.current = readToastShownKeys(slug);

      const unread = next.filter((m) => !m.isRead);
      const unreadKeys = new Set(unread.map(messageKey));
      const prevKeys = prevUnreadKeysRef.current;

      const newlyArrived = unread.filter((m) => !prevKeys.has(messageKey(m)));
      prevUnreadKeysRef.current = unreadKeys;

      if (newlyArrived.length > 0) {
        playNewMessageSound();
        const latest = newlyArrived[0];
        tryBrowserNotification(
          latest.title,
          newlyArrived.length === 1
            ? latest.message
            : `You have ${unread.length} unread messages. Open your inbox.`,
          `iso-msg:${slug}:${messageKey(latest)}`
        );
        setNudgeBanner(
          unread.length === 1
            ? "You have 1 new message — open your inbox"
            : `You have ${unread.length} unread messages — open your inbox`
        );
      }

      for (const msg of unread) {
        const key = messageKey(msg);
        if (msg.delivery === "modal" && !ackedRef.current.has(key)) {
          enqueueModal(msg);
        } else if (msg.delivery === "toast" && !toastShownRef.current.has(key)) {
          showToast(msg);
          toastShownRef.current.add(key);
          markToastShown(slug, key);
        }
      }

      try {
        window.dispatchEvent(
          new CustomEvent("iso-tenant-alerts-updated", {
            detail: { tenantSlug: slug, count: next.length, unread: unread.length },
          })
        );
      } catch {
        // ignore
      }
    },
    [enqueueModal, showToast]
  );

  const loadMessages = useCallback(async () => {
    if (!tenantSlug || !accessToken) return;
    setLoading(true);
    setInboxError("");
    try {
      const url = new URL(apiUrl("/api/tenant-alerts"));
      url.searchParams.set("tenantSlug", tenantSlug);
      appendTenantAlertsClientParams(url);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as TenantAlertsResponse;

      if (res.status === 403 && json.code === "TENANT_DEACTIVATED") {
        dispatchTenantDeactivated(
          tenantSlug,
          typeof json.deactivationReason === "string" ? json.deactivationReason : null
        );
        return;
      }
      if (!res.ok) {
        setInboxError(json.error || `Failed to load messages (${res.status})`);
        return;
      }

      clearTenantDeactivatedBlocked(tenantSlug);

      const next: TenantMessage[] = (json.alerts || []).map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        createdAt: a.createdAt,
        isRead: a.isRead,
        source: a.source === "global" ? "global" : "tenant",
        delivery: normalizeDelivery(a.delivery),
      }));

      setMessages(next);
      processNewMessages(next, tenantSlug);
    } catch {
      setInboxError("Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, tenantSlug, processNewMessages]);

  useEffect(() => {
    if (!tenantSlug || !accessToken) {
      setMessages([]);
      setModalQueue([]);
      setActiveModal(null);
      setToasts([]);
      setNudgeBanner(null);
      return;
    }
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 20_000);
    return () => window.clearInterval(timer);
  }, [tenantSlug, accessToken, loadMessages]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void loadMessages();
    }
    window.addEventListener("online", loadMessages);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", loadMessages);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadMessages]);

  useEffect(() => {
    if (activeModal || modalQueue.length === 0) return;
    setActiveModal(modalQueue[0]);
    setModalQueue((q) => q.slice(1));
  }, [activeModal, modalQueue]);

  async function markRead(msg: TenantMessage) {
    if (!accessToken || !tenantSlug || markingId) return;
    setMarkingId(msg.id);
    setInboxError("");
    try {
      const url = new URL(apiUrl("/api/tenant-alerts"));
      url.searchParams.set("tenantSlug", tenantSlug);
      appendTenantAlertsClientParams(url);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          announcementId: msg.id,
          source: msg.source === "global" ? "global" : "tenant",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setInboxError(json.error || `Could not mark message as read (${res.status})`);
        return;
      }
      const key = messageKey(msg);
      markMessageAcked(tenantSlug, key);
      ackedRef.current.add(key);
      setMessages((prev) => {
        const updated = prev.map((m) => (messageKey(m) === key ? { ...m, isRead: true } : m));
        prevUnreadKeysRef.current = new Set(updated.filter((m) => !m.isRead).map(messageKey));
        return updated;
      });
    } finally {
      setMarkingId(null);
    }
  }

  async function markAllRead() {
    const unread = messages.filter((m) => !m.isRead);
    for (const msg of unread) {
      await markRead(msg);
    }
  }

  function dismissModal() {
    if (!activeModal) return;
    const remaining = modalQueue;
    setActiveModal(remaining[0] ?? null);
    if (remaining.length > 0) setModalQueue(remaining.slice(1));
    else setActiveModal(null);
  }

  function acknowledgeModal() {
    if (activeModal && tenantSlug) {
      markMessageAcked(tenantSlug, messageKey(activeModal));
      ackedRef.current.add(messageKey(activeModal));
      void markRead(activeModal);
    }
    dismissModal();
  }

  const ctx: MessageContextValue = {
    tenantSlug,
    unreadCount,
    openInbox,
    refresh: () => void loadMessages(),
  };

  if (!tenantSlug || !accessToken) {
    return <>{children}</>;
  }

  return (
    <MessageContext.Provider value={ctx}>
      {children}

      {nudgeBanner && !inboxOpen ? (
        <button
          type="button"
          onClick={openInbox}
          className="iso-msg-banner-in fixed bottom-20 left-1/2 z-[250] max-w-md -translate-x-1/2 rounded-full border border-emerald-300/80 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-950 shadow-lg ring-2 ring-emerald-400/40 sm:bottom-6"
        >
          {nudgeBanner}
        </button>
      ) : null}

      {toasts.map((t) => (
        <div
          key={t.key}
          className="iso-msg-toast-in pointer-events-auto fixed right-4 z-[248] w-[min(100vw-2rem,360px)] rounded-xl border border-[var(--hse-teal)]/25 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
          style={{ bottom: `${1.25 + toasts.indexOf(t) * 5.5}rem` }}
        >
          <div className="text-sm font-semibold text-[var(--hse-charcoal)]">{t.title}</div>
          <p className="mt-1 line-clamp-3 text-xs text-foreground/75">{t.message}</p>
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-[var(--hse-teal)] underline underline-offset-2"
            onClick={() => {
              t.onOpenInbox();
              setToasts((x) => x.filter((i) => i.key !== t.key));
            }}
          >
            Open inbox
          </button>
        </div>
      ))}

      <NotificationModal
        open={Boolean(activeModal)}
        title={activeModal?.title || "Message"}
        message={activeModal?.message || ""}
        actionLabel={unreadCount > 1 ? `Open inbox (${unreadCount})` : "Open inbox"}
        cancelLabel="Mark read"
        onAction={() => {
          acknowledgeModal();
          openInbox();
        }}
        onClose={acknowledgeModal}
        onCancel={acknowledgeModal}
      />

      <CenteredOverlay open={inboxOpen} onClose={() => setInboxOpen(false)} maxWidthClass="max-w-lg" zIndexClass="z-[260]">
        <div className="rounded-xl border border-foreground/15 bg-background p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2 border-b border-foreground/10 pb-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Message inbox</div>
              <div className="text-xs text-foreground/60">Brand and platform messages for {tenantSlug}</div>
            </div>
            <button
              type="button"
              className="rounded-md border border-foreground/15 px-2 py-1 text-xs hover:bg-foreground/5"
              onClick={() => void loadMessages()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium ${inboxTab === "unread" ? "bg-foreground text-background" : "border border-foreground/15"}`}
              onClick={() => setInboxTab("unread")}
            >
              Unread ({messages.filter((m) => !m.isRead).length})
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium ${inboxTab === "all" ? "bg-foreground text-background" : "border border-foreground/15"}`}
              onClick={() => setInboxTab("all")}
            >
              Recent
            </button>
            {messages.some((m) => !m.isRead) ? (
              <button
                type="button"
                className="ml-auto text-xs font-medium text-[var(--hse-teal)] underline underline-offset-2"
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {inboxError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{inboxError}</div>
          ) : null}

          <div className="mt-3 max-h-[min(60vh,420px)] space-y-2 overflow-y-auto pr-1">
            {inboxList.length === 0 && !loading ? (
              <div className="py-8 text-center text-sm text-foreground/60">
                {inboxTab === "unread" ? "No unread messages." : "No recent messages."}
              </div>
            ) : null}
            {inboxList.map((alert) => (
              <div
                key={messageKey(alert)}
                className={
                  "rounded-lg border px-3 py-2 text-left " +
                  (alert.isRead
                    ? "border-foreground/10 bg-foreground/[0.02] opacity-80"
                    : "border-emerald-400/40 bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)]")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{alert.title}</span>
                      <span className="shrink-0 rounded border border-foreground/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/60">
                        {alert.source === "global" ? "All brands" : "This brand"}
                      </span>
                      <span className="shrink-0 rounded border border-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground/50">
                        {alert.delivery}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-xs text-foreground/75">{alert.message}</div>
                    <div className="mt-1 text-[10px] text-foreground/45">
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : ""}
                    </div>
                  </div>
                  {!alert.isRead ? (
                    <button
                      type="button"
                      disabled={markingId === alert.id}
                      className="shrink-0 rounded-md border border-foreground/20 px-2 py-1 text-[11px] font-medium hover:bg-foreground/5 disabled:opacity-50"
                      onClick={() => void markRead(alert)}
                    >
                      {markingId === alert.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Done"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-foreground/45">Read</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded-md border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/5"
              onClick={() => setInboxOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </CenteredOverlay>
    </MessageContext.Provider>
  );
}

export function useTenantMessages() {
  return useContext(MessageContext);
}

export function WorkspaceMessageInboxButton({ className = "" }: { className?: string }) {
  const ctx = useTenantMessages();
  if (!ctx?.tenantSlug) return null;

  const { unreadCount, openInbox } = ctx;
  const pulse = unreadCount > 0;

  return (
    <button
      type="button"
      className={
        "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/20 bg-background text-foreground transition hover:bg-foreground/5 " +
        (pulse ? "ws-inbox-pulse ring-2 ring-emerald-400/50" : "") +
        " " +
        className
      }
      title={unreadCount > 0 ? `${unreadCount} unread message(s)` : "Message inbox"}
      aria-label={unreadCount > 0 ? `${unreadCount} unread messages, open inbox` : "Open message inbox"}
      onClick={() => {
        unlockMessageSound();
        requestNotificationPermissionOnce();
        openInbox();
      }}
    >
      <Mail className="h-[18px] w-[18px] text-[var(--hse-teal)]" strokeWidth={2.25} />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
