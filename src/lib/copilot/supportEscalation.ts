import { buildGeneralSupportMailto, getSupportEmail } from "@/lib/supportContact";
import type { CopilotAction, CopilotResponse } from "@/lib/copilot/intents";

/** Fallback when NEXT_PUBLIC_PLATFORM_SUPPORT_EMAIL is not set at build time. */
export const DEFAULT_PLATFORM_SUPPORT_EMAIL = "sikalumbit30@gmail.com";

export function getCopilotSupportEmail(): string {
  return getSupportEmail() || DEFAULT_PLATFORM_SUPPORT_EMAIL;
}

const PERSISTENT_ISSUE =
  /\b(persistent|persist|still (not |having |getting |can'?t|won'?t)|keeps? (happening|failing|breaking)|not working|doesn'?t work|broken|bug|issue|problem|stuck|frustrat|can'?t fix|tried everything|doesn'?t help|no luck|again and again|keeps happening)\b/i;

const SUPPORT_REQUEST =
  /\b(contact support|contact developer|speak to (support|developer|admin)|talk to (support|developer)|email support|get help from|human help|real person|escalate|report (a )?bug|something('s| is) wrong)\b/i;

const SUPPORT_SHORT = /^(support|help me|i need support|get support)[.?!]*$/i;

export function isSupportRequestMessage(message: string): boolean {
  const trimmed = message.trim();
  return SUPPORT_REQUEST.test(trimmed) || SUPPORT_SHORT.test(trimmed);
}

export function isPersistentIssueMessage(message: string): boolean {
  return PERSISTENT_ISSUE.test(message.trim());
}

export function supportEscalationNote(): string {
  const email = getCopilotSupportEmail();
  return `\n\nIf this keeps happening, **contact support** at **${email}** — or use **⋮ → Contact support** in the app menu.`;
}

export function buildSupportContactAction(options?: {
  subject?: string;
  body?: string;
  brandName?: string;
  tenantSlug?: string;
}): CopilotAction {
  return {
    type: "open_url",
    label: "Contact support",
    href: buildGeneralSupportMailto({
      subject: options?.subject || "ISO Grid — need help",
      body: options?.body,
      brandName: options?.brandName,
      tenantSlug: options?.tenantSlug,
    }),
  };
}

/** Append support line when the user sounds stuck or on selected fallback responses. */
export function withSupportEscalation(
  response: CopilotResponse,
  message: string,
  options?: { always?: boolean },
): CopilotResponse {
  const needsSupport =
    options?.always || isPersistentIssueMessage(message) || isSupportRequestMessage(message);
  if (!needsSupport) return response;

  const alreadyMentions = response.message.toLowerCase().includes("contact support");
  if (alreadyMentions) return response;

  const actions = response.actions.some((a) => a.label === "Contact support")
    ? response.actions
    : [...response.actions, buildSupportContactAction()];

  return {
    ...response,
    message: `${response.message}${supportEscalationNote()}`,
    actions,
    suggestions: response.suggestions?.includes("Contact support")
      ? response.suggestions
      : [...(response.suggestions ?? []), "Contact support"],
  };
}

export function buildSupportContactResponse(ctx: {
  tenantSlug: string;
  brandName?: string;
  message: string;
}): CopilotResponse {
  const email = getCopilotSupportEmail();
  const persistent = isPersistentIssueMessage(ctx.message);

  return {
    message: persistent
      ? `Sorry you're still having trouble — I'm best at guiding you inside the app, but **persistent issues** should go to our support team.\n\nEmail **${email}** with what you tried, your brand name, and a screenshot if possible. We typically respond within one business day.\n\nYou can also tap **Contact support** below to open your email app.`
      : `You can reach platform support at **${email}**.\n\nUse **⋮ → Contact support** in the header, or tap **Contact support** below. Include your brand name and a short description of what you need.`,
    actions: [
      buildSupportContactAction({
        subject: persistent ? "ISO Grid — persistent issue" : "ISO Grid — support request",
        brandName: ctx.brandName,
        tenantSlug: ctx.tenantSlug,
        body: persistent
          ? [
              "Hi,",
              "",
              "I'm having a persistent issue in the app:",
              "",
              "What I tried:",
              "- ",
              "",
              ctx.brandName ? `Brand: ${ctx.brandName}` : "",
              ctx.tenantSlug ? `Slug: /${ctx.tenantSlug}` : "",
              "",
              "Thanks",
            ]
              .filter(Boolean)
              .join("\n")
          : undefined,
      }),
    ],
    suggestions: ["How do I create a form?", "Where are saved forms?", "Open settings"],
  };
}
