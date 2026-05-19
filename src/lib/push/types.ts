/** Push categories the client asked for — server maps events into these. */
export type PushNotificationCategory =
  | "reminder"
  | "activity"
  | "corrective_action"
  | "audit_submitted"
  | "staff_invite"
  | "announcement"
  | "system";

export type PushPlatform = "android" | "ios" | "web";

export type DevicePushRegistration = {
  userId: string;
  tenantSlug?: string | null;
  platform: PushPlatform;
  token: string;
  deviceId?: string | null;
  categories?: PushNotificationCategory[];
};

export type PushPayload = {
  title: string;
  body: string;
  category?: PushNotificationCategory;
  tenantSlug?: string;
  /** In-app route, e.g. /acme/activity or /workspace?tenantSlug=acme */
  deepLink?: string;
  data?: Record<string, string>;
};
