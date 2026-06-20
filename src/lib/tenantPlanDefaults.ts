/** Default limits for new brands (free tier). */

export const PLAN_CODES = ["free", "pro", "enterprise"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const DEFAULT_FREE_PLAN = {
  planCode: "free" as PlanCode,
  storageLimitMb: 512,
  activityLogRetentionDays: 30,
  aiMemoryRetentionDays: 7,
  aiMonthlyQuota: 4,
  copilotEnabled: true,
  copilotTrialDays: 14,
};

export const PLAN_PRESETS: Record<
  PlanCode,
  {
    label: string;
    storageLimitMb: number;
    aiMonthlyQuota: number;
    activityLogRetentionDays: number;
    aiMemoryRetentionDays: number;
  }
> = {
  free: {
    label: "Free",
    storageLimitMb: 512,
    aiMonthlyQuota: 4,
    activityLogRetentionDays: 30,
    aiMemoryRetentionDays: 7,
  },
  pro: {
    label: "Pro",
    storageLimitMb: 2048,
    aiMonthlyQuota: 50,
    activityLogRetentionDays: 90,
    aiMemoryRetentionDays: 90,
  },
  enterprise: {
    label: "Enterprise",
    storageLimitMb: 10240,
    aiMonthlyQuota: -1,
    activityLogRetentionDays: 365,
    aiMemoryRetentionDays: 365,
  },
};

/** -1 means unlimited AI generations */
export function formatAiQuota(quota: number): string {
  if (quota < 0) return "Unlimited";
  return `${quota} / month`;
}
