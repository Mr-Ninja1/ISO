import { DC_AI_NAME } from "@/lib/ai/deepControl";

export type PlanLimitKind = "ai_quota" | "storage" | "copilot_disabled" | "storage_warning" | "copilot_trial_expired";

export type PlanLimitDetails = {
  used?: number;
  limit?: number;
  totalMb?: number;
  limitMb?: number;
  brandName?: string;
  tenantSlug?: string;
};

import { getSupportEmail } from "@/lib/supportContact";

const SUPPORT_EMAIL =
  typeof process !== "undefined" ? getSupportEmail() : "";

export function buildUpgradeMailto(details: PlanLimitDetails) {
  const brand = details.brandName || details.tenantSlug || "my brand";
  const subject = encodeURIComponent(`Upgrade request — ${brand}`);
  const body = encodeURIComponent(
    `Hi,\n\nI'd like to upgrade our brand plan for "${brand}".\n\n` +
      (details.tenantSlug ? `Brand slug: ${details.tenantSlug}\n` : "") +
      `\nRequested upgrade:\n- [ ] More AI form credits\n- [ ] More storage\n- [ ] Full assistant access\n\nThanks`,
  );
  if (SUPPORT_EMAIL) {
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }
  return `mailto:?subject=${subject}&body=${body}`;
}

export function planLimitCopy(
  kind: PlanLimitKind,
  details: PlanLimitDetails = {},
): { title: string; message: string; actionLabel: string } {
  const brand = details.brandName ? ` for ${details.brandName}` : "";

  switch (kind) {
    case "ai_quota":
      return {
        title: "AI form credits used up",
        message:
          details.used != null && details.limit != null
            ? `You've used all ${details.limit} AI form generations this month${brand}. Your assess step is still free — upgrade to keep building forms with AI, or wait until next month when credits reset.`
            : `You've reached your monthly AI form limit${brand}. Contact your platform developer to add more credits or upgrade your plan.`,
        actionLabel: "Contact developer to upgrade",
      };
    case "storage":
      return {
        title: "Storage limit reached",
        message:
          details.totalMb != null && details.limitMb != null
            ? `This brand is using ${details.totalMb} MB of ${details.limitMb} MB. New uploads and submissions may be blocked until you free space or upgrade storage.`
            : `This brand has reached its storage allowance. Contact your platform developer to increase storage or clean up old records.`,
        actionLabel: "Contact developer to upgrade",
      };
    case "storage_warning":
      return {
        title: "Storage almost full",
        message:
          details.totalMb != null && details.limitMb != null
            ? `You're at ${details.totalMb} MB of ${details.limitMb} MB (${Math.round(((details.totalMb || 0) / (details.limitMb || 1)) * 100)}%). Consider upgrading before uploads are blocked.`
            : `Storage is nearly full. Contact your platform developer before new data is blocked.`,
        actionLabel: "Contact developer to upgrade",
      };
    case "copilot_trial_expired":
      return {
        title: `${DC_AI_NAME} trial ended`,
        message: `Your free ${DC_AI_NAME} trial${brand} has ended. Upgrade to keep unlimited guidance, navigation help, and priority AI features.`,
        actionLabel: "Contact developer to upgrade",
      };
    case "copilot_disabled":
      return {
        title: `${DC_AI_NAME} not available`,
        message: `${DC_AI_NAME} is turned off${brand}. Your platform developer can enable it and upgrade your plan for full AI features.`,
        actionLabel: "Contact developer to upgrade",
      };
    default:
      return {
        title: "Plan limit reached",
        message: "Contact your platform developer to upgrade this brand's plan.",
        actionLabel: "Contact developer to upgrade",
      };
  }
}
