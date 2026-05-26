import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { sendFcmToTokens } from "@/lib/push/fcm";
import {
  deletePushTokens,
  listActiveTenantMemberUserIds,
  listPushTokensForUsers,
} from "@/lib/push/tokenRepository";
import type { AnnouncementAudience } from "@/lib/platformAudience";
import type { PushPayload, PushPlatform } from "@/lib/push/types";

function platformsForAudience(audience: AnnouncementAudience): PushPlatform[] | undefined {
  if (audience === "native") return ["android", "ios"];
  if (audience === "web") return ["web"];
  return ["android", "ios", "web"];
}

function workspaceDeepLink(tenantSlug: string) {
  return `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`;
}

/** Push to all members of one brand (developer console → brand message). */
export async function dispatchTenantAnnouncementPush(input: {
  tenantId: string;
  tenantSlug: string;
  title: string;
  message: string;
}) {
  const svc = createServiceRoleSupabase();
  if (!svc) return { sent: 0, skipped: "no_service_role" };

  const userIds = await listActiveTenantMemberUserIds(svc, input.tenantId);
  const tokens = await listPushTokensForUsers(svc, userIds, {
    platforms: ["android", "ios"],
    tenantId: input.tenantId,
  });

  const payload: PushPayload = {
    title: input.title,
    body: input.message,
    category: "announcement",
    tenantSlug: input.tenantSlug,
    deepLink: workspaceDeepLink(input.tenantSlug),
  };

  return sendAndPrune(svc, tokens.map((t) => t.token), payload);
}

/** Push for platform-wide broadcast (respects native/web audience). */
export async function dispatchGlobalBroadcastPush(input: {
  title: string;
  message: string;
  audience: AnnouncementAudience;
  tenantSlugHint?: string | null;
}) {
  const svc = createServiceRoleSupabase();
  if (!svc) return { sent: 0, skipped: "no_service_role" };

  const userIds = await listActiveTenantMemberUserIds(svc);
  const platforms = platformsForAudience(input.audience);
  const tokens = await listPushTokensForUsers(svc, userIds, { platforms });

  const slug = input.tenantSlugHint?.trim();
  const payload: PushPayload = {
    title: input.title,
    body: input.message,
    category: "announcement",
    ...(slug ? { tenantSlug: slug, deepLink: workspaceDeepLink(slug) } : { deepLink: "/workspace" }),
  };

  return sendAndPrune(svc, tokens.map((t) => t.token), payload);
}

/** Optional: notify native users that an OTA bundle is ready (admin broadcast or deploy hook). */
export async function dispatchOtaUpdatePush(input: {
  title: string;
  message: string;
  audience?: AnnouncementAudience;
}) {
  return dispatchGlobalBroadcastPush({
    title: input.title,
    message: input.message,
    audience: input.audience ?? "native",
  });
}

async function sendAndPrune(
  svc: NonNullable<ReturnType<typeof createServiceRoleSupabase>>,
  tokens: string[],
  payload: PushPayload
) {
  const { sent, invalidTokens } = await sendFcmToTokens(tokens, payload);
  if (invalidTokens.length) {
    await deletePushTokens(svc, invalidTokens).catch(() => undefined);
  }
  return { sent, invalidRemoved: invalidTokens.length };
}
