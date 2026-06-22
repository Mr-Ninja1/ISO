import type { CopilotAction, CopilotCapabilities, CopilotResponse } from "@/lib/copilot/intents";
import {
  buildCopilotSystemKnowledge,
  buildCopilotUserContextBlock,
  type CopilotKnowledgeContext,
} from "@/lib/copilot/systemKnowledge";
import { geminiGenerateContent, isGeminiConfigured } from "@/lib/ai/gemini";

type GeminiCopilotPayload = {
  message?: string;
  actions?: Array<{ label?: string; href?: string }>;
  suggestions?: string[];
};

const RULE_ONLY_TIERS = new Set([
  "empty",
  "support",
  "off_topic",
  "unsupported",
  "playbook",
  "intent",
]);

export function shouldUseGeminiCopilot(tier: string): boolean {
  if (!isGeminiConfigured()) return false;
  return !RULE_ONLY_TIERS.has(tier);
}

function sanitizeHref(href: string, tenantSlug: string): string | null {
  const raw = href.trim().replace(/\{tenantSlug\}/g, tenantSlug);
  if (!raw.startsWith("/")) return null;
  if (raw.includes("..")) return null;
  if (/^https?:\/\//i.test(raw)) return null;
  return raw;
}

function filterActions(
  actions: GeminiCopilotPayload["actions"],
  caps: CopilotCapabilities,
  tenantSlug: string,
): CopilotAction[] {
  if (!Array.isArray(actions)) return [];

  const out: CopilotAction[] = [];
  for (const item of actions) {
    const label = String(item?.label || "").trim();
    const href = sanitizeHref(String(item?.href || ""), tenantSlug);
    if (!label || !href) continue;

    if (href.includes("/templates/new") && !caps.canCreateForms) continue;
    if (href.includes("/categories") && !caps.canManageCategories) continue;
    if (href.includes("focus=staff") && !caps.canManageStaff) continue;
    if (
      (href.includes("/settings") || href.includes("/dashboard") || href.includes("/corrective-actions")) &&
      !caps.canAccessSettings
    ) {
      continue;
    }

    out.push({ type: "navigate", label, href });
    if (out.length >= 4) break;
  }
  return out;
}

function parseGeminiCopilotPayload(text: string): GeminiCopilotPayload | null {
  try {
    return JSON.parse(text) as GeminiCopilotPayload;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as GeminiCopilotPayload;
    } catch {
      return null;
    }
  }
}

export async function generateGeminiCopilotAnswer(
  message: string,
  ctx: CopilotKnowledgeContext,
  ruleFallback: CopilotResponse,
): Promise<CopilotResponse> {
  if (!isGeminiConfigured()) return ruleFallback;

  const systemInstruction = buildCopilotSystemKnowledge();
  const contextBlock = buildCopilotUserContextBlock(ctx);

  try {
    const raw = await geminiGenerateContent({
      systemInstruction,
      json: true,
      temperature: 0.35,
      parts: [
        {
          text: `${contextBlock}

User question:
${message.trim()}

Answer using the JSON schema from your instructions. Use tenant slug "${ctx.tenantSlug}" in all hrefs.`,
        },
      ],
    });

    const parsed = parseGeminiCopilotPayload(raw);
    const answer = String(parsed?.message || "").trim();
    if (!answer) return ruleFallback;

    const actions = filterActions(parsed?.actions, ctx.caps, ctx.tenantSlug);
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed!.suggestions!.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
      : ruleFallback.suggestions;

    return {
      message: answer,
      actions: actions.length ? actions : ruleFallback.actions,
      suggestions: suggestions?.length ? suggestions : ruleFallback.suggestions,
    };
  } catch {
    return ruleFallback;
  }
}
