# Deep Control (copilot) knowledge base

Deep Control answers workspace questions using a **hybrid**:

1. **Rule-based** — fast paths for navigation (“open saved forms”), playbooks (“how do I create a form step by step”), and guardrails (off-topic, unsupported actions).
2. **Gemini** — everything else, with a full **system knowledge** prompt so users get proper guidance even when their wording does not match a regex.

## Where to edit product knowledge

| File | Purpose |
|------|---------|
| [`src/lib/copilot/systemKnowledge.ts`](../src/lib/copilot/systemKnowledge.ts) | **Main knowledge doc** — terminology, navigation URLs, workflows, limits. Update when you ship features. |
| [`src/lib/copilot/playbooks.ts`](../src/lib/copilot/playbooks.ts) | Step-by-step “how to” playbooks (rule-only, no API cost). |
| [`src/lib/copilot/intents.ts`](../src/lib/copilot/intents.ts) | Quick navigation intents + `HELP_TOPICS` snippets. |
| [`src/lib/copilot/guardrails.ts`](../src/lib/copilot/guardrails.ts) | Off-topic / unsupported / vague message handling. |
| [`src/lib/ai/copilotGemini.ts`](../src/lib/ai/copilotGemini.ts) | Gemini call, JSON parsing, action sanitization. |

## When Gemini runs

Gemini is used when the message passes guardrails but does **not** match a high-confidence **playbook** or **intent** pattern.

Requires `GEMINI_API_KEY` on the server (Azure). If missing, the app falls back to fuzzy/rule responses only.

## Adding a new feature to the assistant

1. Add navigation row to the catalog in `systemKnowledge.ts`.
2. Add a playbook in `playbooks.ts` if users often ask “how do I … step by step”.
3. Add an intent pattern if users say “open X” / “take me to X”.
4. Deploy website (API route change) — OTA updates the UI; copilot logic runs on **Azure**.

## API

`POST /api/copilot/chat` — auth required, tenant membership required, `copilot_enabled` on brand plan.

Usage logged as `copilot_chat` in `tenant_ai_usage_events`.
