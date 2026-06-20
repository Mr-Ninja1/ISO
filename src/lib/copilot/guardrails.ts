import type { CopilotCapabilities, CopilotResponse } from "@/lib/copilot/intents";
import { playbookSuggestions } from "@/lib/copilot/playbooks";

export type GuardrailKind = "ok" | "off_topic" | "unsupported" | "unclear";

export type GuardrailVerdict = {
  kind: GuardrailKind;
  reason?: string;
};

/** Topics Deep Control can help with in this app. */
const IN_SCOPE =
  /\b(form|template|audit|saved|submitted|submission|categor|staff|setting|workspace|dashboard|pdf|export|brand|iso|hse|inspection|checklist|corrective|storage|quota|usage|plan|trial|copilot|deep control|pin|role|admin|manager|auditor|offline|sync|logo|library|import|report|table|column|photo|evidence|signature|temp|fridge|haccp|navigate|open|create|add|delete submission|upgrade|limit|activity|message|inbox|share|due|reminder)\b/i;

const OFF_TOPIC =
  /\b(weather|forecast|joke|poem|recipe|cook|movie|sport|football|politics|election|stock|crypto|bitcoin|homework|essay|write me a|tell me about(?! the (form|brand|app|workspace|system))|\bwho is\b|\bwhat is the capital\b|translate this|code this|python|javascript|sql query|medical advice|legal advice|relationship|dating)\b/i;

const UNSUPPORTED: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\b(reset|change|update).*(password|email)\b/i,
    message:
      "I can't change passwords or emails from chat. Use **Settings → Staff** (admins) or ask your brand admin to update your account.",
  },
  {
    pattern: /\b(delete|remove).*(brand|tenant|account|user|staff member)\b/i,
    message:
      "I can't delete brands or user accounts from chat. Brand admins can manage staff in **Settings → Staff**.",
  },
  {
    pattern: /\b(send|email|sms|text message|notify).*(everyone|all staff|broadcast)\b/i,
    message:
      "Mass messaging isn't available in Deep Control chat. Admins can send alerts from the developer console or message inbox where configured.",
  },
  {
    pattern: /\b(pay|payment|invoice|stripe|subscribe|billing)\b/i,
    message:
      "Billing and payments aren't handled in chat. Contact your platform developer to upgrade storage or AI credits.",
  },
  {
    pattern: /\b(run|generate|build).*(analytics|bi|power bi|excel export all|bulk export)\b/i,
    message:
      "I can't run custom analytics or bulk exports. Open **Saved forms** for individual PDF exports, or **Dashboard** for summary metrics.",
  },
  {
    pattern: /\b(create|spin up|new).*(brand|tenant|organisation|organization|company account)\b/i,
    message:
      "Creating a new brand is done by your platform developer — not from inside a brand workspace.",
  },
  {
    pattern: /\b(edit|change|update).*(submitted|saved).*(form|submission|audit).*(data|field|answer)\b/i,
    message:
      "Submitted forms can't be edited after submit (compliance). Create a new submission or ask a manager about corrective actions.",
  },
  {
    pattern: /\b(assign|grant|give).*(role|permission|admin access)\b/i,
    message:
      "Role changes must be done by a brand admin in **Settings → Staff** — I can't change permissions from chat.",
  },
];

/** Very short or generic — need clarification before navigating. */
const VAGUE_ONLY =
  /^(hi|hello|hey|help|thanks|thank you|ok|okay|yes|no|maybe|forms?|stuff|something|question|support|info|menu|options?|start|please)$/i;

const VAGUE_FRAGMENT =
  /^(i need help|need help|not sure|confused|what now|what do i do|where|show me|i want to|can you help)$/i;

const AMBIGUOUS_FORMS =
  /^(forms?|my forms?|the forms?|see forms?|view forms?|open forms?|about forms?)$/i;

export function classifyCopilotMessage(message: string): GuardrailVerdict {
  const trimmed = message.trim();
  if (!trimmed) return { kind: "unclear" };

  if (OFF_TOPIC.test(trimmed) && !IN_SCOPE.test(trimmed)) {
    return { kind: "off_topic" };
  }

  for (const rule of UNSUPPORTED) {
    if (rule.pattern.test(trimmed)) {
      return { kind: "unsupported", reason: rule.message };
    }
  }

  if (VAGUE_ONLY.test(trimmed) || VAGUE_FRAGMENT.test(trimmed) || AMBIGUOUS_FORMS.test(trimmed)) {
    return { kind: "unclear" };
  }

  if (trimmed.length < 12 && !IN_SCOPE.test(trimmed)) {
    return { kind: "unclear" };
  }

  if (/\b(something|anything|whatever|not sure what|don't know)\b/i.test(trimmed) && !IN_SCOPE.test(trimmed)) {
    return { kind: "unclear" };
  }

  return { kind: "ok" };
}

function clarifyActions(tenantSlug: string, caps: CopilotCapabilities) {
  const actions = [
    {
      type: "navigate" as const,
      label: "Saved forms (submissions)",
      href: `/${tenantSlug}/audits`,
    },
    {
      type: "navigate" as const,
      label: "Workspace (fill in forms)",
      href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`,
    },
  ];

  if (caps.canCreateForms) {
    actions.push({
      type: "navigate" as const,
      label: "Create a form",
      href: `/${tenantSlug}/templates/new`,
    });
    actions.push({
      type: "navigate" as const,
      label: "Templates list",
      href: `/${tenantSlug}/templates`,
    });
  }

  if (caps.canManageCategories) {
    actions.push({
      type: "navigate" as const,
      label: "Categories",
      href: `/${tenantSlug}/categories`,
    });
  }

  if (caps.canAccessSettings) {
    actions.push({
      type: "navigate" as const,
      label: "Settings & usage",
      href: `/${tenantSlug}/settings`,
    });
  }

  return actions;
}

export function buildOffTopicResponse(caps: CopilotCapabilities): CopilotResponse {
  return {
    message:
      "I'm **Deep Control** — I only help with this brand's ISO/HSE workspace: forms, submissions, categories, staff, settings, and PDF export.\n\nWhat would you like to do in the app? Be specific (e.g. *open saved forms from today* or *how do I add staff*).",
    actions: [],
    suggestions: playbookSuggestions(caps),
  };
}

export function buildUnsupportedResponse(reason: string, caps: CopilotCapabilities): CopilotResponse {
  return {
    message: `**I can't do that from chat.**\n\n${reason}`,
    actions: [],
    suggestions: playbookSuggestions(caps),
  };
}

export function buildUnclearResponse(
  tenantSlug: string,
  caps: CopilotCapabilities,
  hint?: string,
): CopilotResponse {
  const lead = hint
    ? hint
    : "I want to help, but I need a bit more detail. What are you trying to do?";

  return {
    message: `${lead}\n\nPick the closest option below, or describe your goal in a full sentence (e.g. *show saved forms from today* or *how do I create a fridge log*).`,
    actions: clarifyActions(tenantSlug, caps),
    suggestions: [
      "How do I create a form?",
      "Where are saved forms?",
      "How do I export a PDF?",
      ...(caps.canManageStaff ? ["How do I add staff?"] : []),
    ],
  };
}
