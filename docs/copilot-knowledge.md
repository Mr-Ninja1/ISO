# Deep Control (copilot) knowledge base

Deep Control answers workspace questions using a **hybrid**:

1. **Rule-based** — playbooks, intents, guardrails (instant, no API cost).
2. **Grep retrieval** — keyword search over `knowledgeIndex.ts` (like searching docs).
3. **Live snapshot** — small DB counts + today's activity summary.
4. **Gemini** — harder questions, with retrieved docs + snapshot in context (not the whole app in one prompt).

## Where to edit product knowledge

| File | Purpose |
|------|---------|
| [`src/lib/copilot/knowledgeIndex.ts`](../src/lib/copilot/knowledgeIndex.ts) | **Searchable doc chunks** — add one entry per feature/workflow. Retrieved per question. |
| [`src/lib/copilot/retrieveKnowledge.ts`](../src/lib/copilot/retrieveKnowledge.ts) | Grep-style scoring over the index. |
| [`src/lib/copilot/systemKnowledge.ts`](../src/lib/copilot/systemKnowledge.ts) | Core AI instructions + terminology (keep lean). |
| [`src/lib/copilot/playbooks.ts`](../src/lib/copilot/playbooks.ts) | Step-by-step “how do I …” (rule-only). |
| [`src/lib/copilot/intents.ts`](../src/lib/copilot/intents.ts) | Quick navigation + `HELP_TOPICS`. |
| [`src/lib/copilot/fetchLiveSnapshot.ts`](../src/lib/copilot/fetchLiveSnapshot.ts) | Live form/category counts + activity today. |

Validate index: `node tools/build-copilot-knowledge.mjs`

## When Gemini runs

Gemini runs when the message is in-scope but does **not** match a high-confidence playbook, intent, fuzzy, or **knowledge** retrieval hit. It receives **top 3–4 retrieved chunks** only — not the full codebase.

Requires `GEMINI_API_KEY` on the server (Azure).

## Adding a new feature to the assistant

1. Add a chunk to `knowledgeIndex.ts` (title, tags, body, hrefs).
2. Optionally add a playbook for “how do I … step by step”.
3. Optionally add an intent for “open X” / “take me to X”.
4. Run `node tools/build-copilot-knowledge.mjs`.
5. Deploy website (API route) — OTA updates UI only; copilot runs on **Azure**.

## API

`POST /api/copilot/chat` — auth required, tenant membership required, `copilot_enabled` on brand plan.

Usage logged as `copilot_chat` in `tenant_ai_usage_events`.
