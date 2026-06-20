"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PlanLimitModal } from "@/components/plan/PlanLimitModal";
import { apiUrl } from "@/lib/client/apiBase";
import { formatAiQuota } from "@/lib/tenantPlanDefaults";
import type { PlanLimitKind } from "@/lib/planLimitMessaging";

type StoragePayload = {
  plan: {
    code: string;
    storageLimitMb: number;
    aiMonthlyQuota: number;
    copilotEnabled: boolean;
  };
  usage: {
    totalMb: number;
    limitMb: number;
    usageRatio: number;
    warning: boolean;
    overLimit: boolean;
  };
  aiQuota: {
    used: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
  };
  copilotAccess?: {
    allowed: boolean;
    reason: string;
    daysRemaining: number;
    trialEndsAt: string | null;
    paid: boolean;
  };
};

export function BrandUsageCard({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const [data, setData] = useState<StoragePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [limitModal, setLimitModal] = useState<PlanLimitKind | null>(null);
  useEffect(() => {
    const token = session?.access_token;
    if (!token || !tenantSlug) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(apiUrl(`/api/workspace/storage?tenantSlug=${encodeURIComponent(tenantSlug)}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load usage");
        return json as StoragePayload;
      })
      .then((payload) => {
        setData(payload);
        setError("");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load usage");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token, tenantSlug]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-foreground/15 bg-foreground/[0.02] p-4 text-sm text-foreground/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading plan usage…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-foreground/15 bg-foreground/[0.02] p-4 text-sm text-foreground/60">
        {error || "Usage unavailable"}
      </div>
    );
  }

  const storagePct = Math.min(100, Math.round(data.usage.usageRatio * 100));
  const aiLabel = data.aiQuota.unlimited
    ? `${data.aiQuota.used} used (unlimited)`
    : `${data.aiQuota.used} / ${data.aiQuota.limit} AI forms this month`;

  const aiExhausted = data.aiQuota.remaining === 0 && !data.aiQuota.unlimited;
  const dcTrialExpired = data.copilotAccess?.reason === "trial_expired";
  const showUpgrade = data.usage.overLimit || data.usage.warning || aiExhausted || dcTrialExpired;

  return (
    <>
    <div      id="brand-usage"
      className={
        "rounded-xl border p-4 " +
        (data.usage.overLimit
          ? "border-red-200 bg-red-50/50"
          : data.usage.warning
            ? "border-amber-200 bg-amber-50/40"
            : "border-foreground/15 bg-foreground/[0.02]")
      }
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--hse-teal)]" />
        <div className="text-sm font-semibold">Plan & usage</div>
        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/55">
          {data.plan.code}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-foreground/55">Storage</div>
          <div className="mt-1 text-sm font-medium">
            {data.usage.totalMb} MB of {data.usage.limitMb} MB
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className={
                "h-full rounded-full " +
                (data.usage.overLimit ? "bg-red-500" : data.usage.warning ? "bg-amber-500" : "bg-[var(--hse-teal)]")
              }
              style={{ width: `${storagePct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="text-xs text-foreground/55">Deep Control chat</div>
          <div className="mt-1 text-sm font-medium">
            {data.copilotAccess?.paid
              ? "Unlimited (paid)"
              : data.copilotAccess?.reason === "trial_active"
                ? `${data.copilotAccess.daysRemaining} day${data.copilotAccess.daysRemaining === 1 ? "" : "s"} left in trial`
                : data.copilotAccess?.allowed
                  ? "Active"
                  : "Trial ended — upgrade for more"}
          </div>
        </div>
        <div>
          <div className="text-xs text-foreground/55">AI form credits</div>
          <div className="mt-1 text-sm font-medium">{aiLabel}</div>
          <div className="mt-1 text-xs text-foreground/55">
            {formatAiQuota(data.plan.aiMonthlyQuota)} on {data.plan.code} plan
          </div>
        </div>
      </div>

      {showUpgrade ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              setLimitModal(
                data.usage.overLimit
                  ? "storage"
                  : dcTrialExpired
                    ? "copilot_trial_expired"
                    : aiExhausted
                      ? "ai_quota"
                      : "storage_warning",
              )
            }
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--hse-teal)] px-3 text-xs font-semibold text-white"
          >
            <Mail className="h-3.5 w-3.5" />
            Contact developer to upgrade
          </button>
        </div>
      ) : null}
    </div>

    {limitModal ? (
      <PlanLimitModal
        open
        kind={limitModal}
        details={{
          tenantSlug,
          used: data.aiQuota.used,
          limit: data.aiQuota.limit,
          totalMb: data.usage.totalMb,
          limitMb: data.usage.limitMb,
        }}
        settingsHref={`/${tenantSlug}/settings?focus=usage`}
        onClose={() => setLimitModal(null)}
      />
    ) : null}
    </>
  );
}