import type { PushPayload } from "@/lib/push/types";

type FirebaseMessaging = import("firebase-admin/messaging").Messaging;

let messaging: FirebaseMessaging | null | undefined;

function resolveMessaging(): FirebaseMessaging | null {
  if (messaging !== undefined) return messaging;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    messaging = null;
    return null;
  }

  try {
    const admin = require("firebase-admin") as typeof import("firebase-admin");
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(raw) as Record<string, unknown>;
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as import("firebase-admin").ServiceAccount),
      });
    }
    messaging = admin.messaging();
    return messaging;
  } catch (err) {
    console.error("[fcm] Firebase Admin init failed:", err);
    messaging = null;
    return null;
  }
}

export function isFcmConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

function dataPayload(payload: PushPayload): Record<string, string> {
  const data: Record<string, string> = {
    title: payload.title,
    body: payload.body,
  };
  if (payload.category) data.category = payload.category;
  if (payload.tenantSlug) data.tenantSlug = payload.tenantSlug;
  if (payload.deepLink) data.deepLink = payload.deepLink;
  if (payload.data) {
    for (const [key, value] of Object.entries(payload.data)) {
      if (value != null) data[key] = String(value);
    }
  }
  return data;
}

const BATCH = 500;

/** Sends FCM to device tokens. Returns tokens that should be removed (invalid/expired). */
export async function sendFcmToTokens(
  tokens: string[],
  payload: PushPayload
): Promise<{ sent: number; invalidTokens: string[] }> {
  const msg = resolveMessaging();
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (!msg || !unique.length) {
    return { sent: 0, invalidTokens: [] };
  }

  const invalidTokens: string[] = [];
  let sent = 0;
  const data = dataPayload(payload);

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    try {
      const result = await msg.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data,
        android: {
          priority: "high",
          notification: {
            channelId: "iso_grid_default",
            sound: "default",
          },
        },
      });

      result.responses.forEach((res, idx) => {
        if (res.success) {
          sent += 1;
          return;
        }
        const code = res.error?.code || "";
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(batch[idx]);
        }
      });
    } catch (err) {
      console.error("[fcm] multicast send failed:", err);
    }
  }

  return { sent, invalidTokens };
}
