"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { adminFetch } from "@/lib/client/adminFetch";
import { formatAiQuota, PLAN_PRESETS, type PlanCode } from "@/lib/tenantPlanDefaults";

type CopilotAccess = {
  allowed: boolean;
  reason: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  daysRemaining: number;
  paid: boolean;
};

type PlanPayload = {
  plan: {
    planCode: string;
    storageLimitMb: number;
    aiMonthlyQuota: number;
    copilotEnabled: boolean;
    copilotTrialDays: number;
    copilotTrialStartedAt: string | null;
    copilotPaid: boolean;
    activityLogRetentionDays: number;
    aiMemoryRetentionDays: number;
  };
  copilotAccess: CopilotAccess;
  usage: {
    storageMb: number;
    aiGenerationsThisMonth: number;
  };
};

type Props = {
  brandId: string;
  brandName: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function copilotStatusLabel(access: CopilotAccess) {
  if (!access.allowed) {
    if (access.reason === "disabled") return "ISO Grid AI is disabled for this brand.";
    if (access.reason === "trial_expired") {
      return `Trial expired on ${formatShortDate(access.trialEndsAt)}. Increasing trial days alone does not reopen access — reset the trial start date or enable paid.`;
    }
    return "ISO Grid AI is blocked.";
  }
  if (access.paid) return "Unlimited ISO Grid AI (paid or Pro/Enterprise plan).";
  if (access.daysRemaining >= 0) {
    return `Trial active — ${access.daysRemaining} day(s) left (ends ${formatShortDate(access.trialEndsAt)}).`;
  }
  return "ISO Grid AI is available.";
}

export function BrandPlanModal({ brandId, brandName, open, onClose, onSaved }: Props) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [planCode, setPlanCode] = useState<PlanCode>("free");
  const [storageMb, setStorageMb] = useState(512);
  const [aiQuota, setAiQuota] = useState(4);
  const [copilotEnabled, setCopilotEnabled] = useState(true);
  const [copilotTrialDays, setCopilotTrialDays] = useState(14);
  const [copilotPaid, setCopilotPaid] = useState(false);
  const [usage, setUsage] = useState<PlanPayload["usage"] | null>(null);
  const [copilotAccess, setCopilotAccess] = useState<CopilotAccess | null>(null);
  const [resetMessage, setResetMessage] = useState("");

  const loadPlan = useCallback(async () => {
    const token = session?.access_token || "";
    if (!token || !brandId) return;

    setLoading(true);
    setError("");
    setResetMessage("");

    const result = await adminFetch<PlanPayload>(`/api/admin/brands/${brandId}/plan`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const p = result.data.plan;
    setPlanCode((p.planCode as PlanCode) || "free");
    setStorageMb(p.storageLimitMb);
    setAiQuota(p.aiMonthlyQuota);
    setCopilotEnabled(p.copilotEnabled);
    setCopilotTrialDays(p.copilotTrialDays ?? 14);
    setCopilotPaid(p.copilotPaid ?? false);
    setUsage(result.data.usage);
    setCopilotAccess(result.data.copilotAccess);
    setLoading(false);
  }, [brandId, session?.access_token]);

  useEffect(() => {
    if (!open || !brandId) return;
    void loadPlan();
  }, [open, brandId, loadPlan]);

  async function applyPreset(preset: PlanCode) {
    const token = session?.access_token || "";
    if (!token) return;
    setSaving(true);
    setError("");
    const result = await adminFetch<PlanPayload>(`/api/admin/brands/${brandId}/plan`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ applyPreset: preset }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const p = result.data.plan;
    setPlanCode((p.planCode as PlanCode) || preset);
    setStorageMb(p.storageLimitMb);
    setAiQuota(p.aiMonthlyQuota);
    setCopilotEnabled(p.copilotEnabled);
    setCopilotTrialDays(p.copilotTrialDays ?? 14);
    setCopilotPaid(p.copilotPaid ?? false);
    setCopilotAccess(result.data.copilotAccess);
    setUsage(result.data.usage);
    onSaved?.();
  }

  async function saveCustom() {
    const token = session?.access_token || "";
    if (!token) return;
    setSaving(true);
    setError("");
    setResetMessage("");
    const result = await adminFetch<PlanPayload>(`/api/admin/brands/${brandId}/plan`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        planCode,
        storageLimitMb: storageMb,
        aiMonthlyQuota: aiQuota,
        copilotEnabled,
        copilotTrialDays,
        copilotPaid,
      }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCopilotAccess(result.data.copilotAccess);
    setUsage(result.data.usage);
    onSaved?.();
    onClose();
  }

  async function resetDcTrial() {
    const token = session?.access_token || "";
    if (!token) return;
    setSaving(true);
    setError("");
    const result = await adminFetch<PlanPayload>(`/api/admin/brands/${brandId}/plan`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ resetCopilotTrial: true }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCopilotAccess(result.data.copilotAccess);
    setResetMessage("ISO Grid AI trial restarted from today.");
    onSaved?.();
    void loadPlan();
  }

  async function resetFormAiCredits() {
    const token = session?.access_token || "";
    if (!token) return;
    setSaving(true);
    setError("");
    const result = await adminFetch<PlanPayload & { aiUsageRowsDeleted?: number }>(
      `/api/admin/brands/${brandId}/plan`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ resetAiFormUsageThisMonth: true }),
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUsage(result.data.usage);
    const deleted = result.data.aiUsageRowsDeleted ?? 0;
    setResetMessage(`Cleared ${deleted} form AI usage record(s) for this month.`);
    onSaved?.();
  }

  if (!open) return null;

  const trialExpired = copilotAccess?.reason === "trial_expired";

  return (
    <div className="fixed inset-0 z-[74] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close plan editor"
        onClick={() => !saving && onClose()}
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-foreground/10 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--hse-teal)_15%,white)] text-[var(--hse-teal)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Plan & AI limits</h2>
            <p className="text-sm text-foreground/65">{brandName}</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-foreground/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading plan…
          </div>
        ) : (
          <>
            {copilotAccess ? (
              <div
                className={
                  "mt-4 rounded-xl border p-3 text-sm " +
                  (trialExpired
                    ? "border-amber-300/60 bg-amber-50 text-amber-950"
                    : "border-foreground/10 bg-foreground/[0.03] text-foreground/80")
                }
              >
                <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                  ISO Grid AI status
                </div>
                <p className="mt-1">{copilotStatusLabel(copilotAccess)}</p>
                <p className="mt-1 text-xs opacity-75">
                  Started {formatShortDate(copilotAccess.trialStartedAt)} · trial length{" "}
                  {copilotTrialDays} days
                </p>
              </div>
            ) : null}

            {usage ? (
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3 text-sm">
                <div>
                  <div className="text-xs text-foreground/50">Storage used</div>
                  <div className="font-medium">{usage.storageMb} MB</div>
                </div>
                <div>
                  <div className="text-xs text-foreground/50">AI forms this month</div>
                  <div className="font-medium">{usage.aiGenerationsThisMonth}</div>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                Quick presets
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(PLAN_PRESETS) as PlanCode[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={saving}
                    onClick={() => void applyPreset(code)}
                    className={
                      "rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50 " +
                      (planCode === code
                        ? "border-[var(--hse-teal)] bg-[color-mix(in_srgb,var(--hse-teal)_12%,white)] text-[var(--hse-teal)]"
                        : "border-foreground/15 hover:bg-foreground/5")
                    }
                  >
                    {PLAN_PRESETS[code].label} · {PLAN_PRESETS[code].storageLimitMb} MB ·{" "}
                    {formatAiQuota(PLAN_PRESETS[code].aiMonthlyQuota)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Storage limit (MB)</span>
                <input
                  type="number"
                  min={128}
                  value={storageMb}
                  onChange={(e) => setStorageMb(Number(e.target.value))}
                  className="h-10 rounded-lg border border-foreground/15 px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">AI form credits / month (-1 = unlimited)</span>
                <input
                  type="number"
                  min={-1}
                  value={aiQuota}
                  onChange={(e) => setAiQuota(Number(e.target.value))}
                  className="h-10 rounded-lg border border-foreground/15 px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">ISO Grid AI trial (days)</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={copilotTrialDays}
                  onChange={(e) => setCopilotTrialDays(Number(e.target.value))}
                  className="h-10 rounded-lg border border-foreground/15 px-3"
                />
                <span className="text-xs text-foreground/55">
                  Length of trial from start date — does not extend an already-expired trial.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={copilotEnabled}
                  onChange={(e) => setCopilotEnabled(e.target.checked)}
                />
                <span>ISO Grid AI enabled</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={copilotPaid}
                  onChange={(e) => setCopilotPaid(e.target.checked)}
                />
                <span>ISO Grid AI paid (unlimited chat)</span>
              </label>

              <div className="rounded-xl border border-dashed border-foreground/15 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                  Reset AI usage (this brand)
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium hover:bg-foreground/5 disabled:opacity-50"
                    onClick={() => void resetDcTrial()}
                  >
                    Reset AI trial to today
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium hover:bg-foreground/5 disabled:opacity-50"
                    onClick={() => void resetFormAiCredits()}
                  >
                    Reset form AI credits (this month)
                  </button>
                </div>
              </div>
            </div>

            {resetMessage ? (
              <p className="mt-3 text-sm text-[var(--hse-teal)]">{resetMessage}</p>
            ) : null}

            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 rounded-full border border-foreground/15 px-4 text-sm disabled:opacity-50"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
                disabled={saving}
                onClick={() => void saveCustom()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save custom limits
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
