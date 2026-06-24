import type { CopilotAction, CopilotCapabilities } from "@/lib/copilot/intents";
import {
  COPILOT_KNOWLEDGE_CHUNKS,
  type KnowledgeChunk,
} from "@/lib/copilot/knowledgeIndex";

export type RetrievedChunk = KnowledgeChunk & { score: number };

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "i",
  "me",
  "my",
  "we",
  "you",
  "do",
  "does",
  "did",
  "can",
  "how",
  "what",
  "where",
  "when",
  "why",
  "is",
  "are",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "it",
  "this",
  "that",
  "with",
  "please",
  "show",
  "tell",
  "about",
  "some",
  "any",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .split(/[\s,.!?;:()\-–—/]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function chunkAllowed(chunk: KnowledgeChunk, caps: CopilotCapabilities): boolean {
  if (!chunk.requires) return true;
  return Boolean(caps[chunk.requires]);
}

function resolveHref(href: string, tenantSlug: string): string {
  return href.replace(/\{tenantSlug\}/g, tenantSlug);
}

function scoreChunk(query: string, tokens: Set<string>, chunk: KnowledgeChunk): number {
  const lower = query.toLowerCase();
  let score = 0;

  for (const tag of chunk.tags) {
    const tagLower = tag.toLowerCase();
    if (lower.includes(tagLower)) {
      score += tagLower.includes(" ") ? 5 : tagLower.length >= 6 ? 3 : 2;
    } else if (tokens.has(tagLower)) {
      score += 2;
    } else {
      const tagTokens = tagLower.split(/\s+/);
      for (const tt of tagTokens) {
        if (tokens.has(tt)) score += 1;
      }
    }
  }

  if (lower.includes(chunk.title.toLowerCase())) score += 4;

  const titleTokens = tokenize(chunk.title);
  for (const tt of titleTokens) {
    if (tokens.has(tt)) score += 1;
  }

  return score;
}

/** Grep-style retrieval — keyword scoring over the knowledge index (no embeddings). */
export function retrieveCopilotKnowledge(
  query: string,
  opts: {
    caps: CopilotCapabilities;
    limit?: number;
    maxChars?: number;
    minScore?: number;
  },
): RetrievedChunk[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = opts.limit ?? 4;
  const maxChars = opts.maxChars ?? 2800;
  const minScore = opts.minScore ?? 2;
  const tokens = new Set(tokenize(trimmed));

  const ranked = COPILOT_KNOWLEDGE_CHUNKS.filter((c) => chunkAllowed(c, opts.caps))
    .map((chunk) => ({ ...chunk, score: scoreChunk(trimmed, tokens, chunk) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const out: RetrievedChunk[] = [];
  let chars = 0;

  for (const chunk of ranked) {
    if (out.length >= limit) break;
    const size = chunk.title.length + chunk.body.length;
    if (chars + size > maxChars && out.length > 0) break;
    out.push(chunk);
    chars += size;
  }

  return out;
}

export function formatRetrievedKnowledge(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "";
  return chunks
    .map((c) => `### ${c.title} (match score ${c.score})\n${c.body}`)
    .join("\n\n");
}

export function chunksToActions(chunks: RetrievedChunk[], tenantSlug: string): CopilotAction[] {
  const actions: CopilotAction[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    for (const link of chunk.hrefs || []) {
      const href = resolveHref(link.href, tenantSlug);
      if (seen.has(href)) continue;
      seen.add(href);
      actions.push({ type: "navigate", label: link.label, href });
      if (actions.length >= 4) return actions;
    }
  }

  return actions;
}

/** High-confidence doc hit → answer without calling Gemini */
export function buildKnowledgeRetrievalResponse(
  query: string,
  tenantSlug: string,
  caps: CopilotCapabilities,
  chunks: RetrievedChunk[],
): { response: { message: string; actions: CopilotAction[]; suggestions: string[] } } | null {
  if (!chunks.length || chunks[0].score < 5) return null;

  const top = chunks[0];
  const related =
    chunks.length > 1
      ? `\n\n_Related:_ ${chunks
          .slice(1, 3)
          .map((c) => c.title)
          .join(" · ")}`
      : "";

  return {
    response: {
      message: `**${top.title}**\n\n${top.body}${related}`,
      actions: chunksToActions(chunks, tenantSlug),
      suggestions: suggestFollowUps(query, caps, top.id),
    },
  };
}

function suggestFollowUps(_query: string, caps: CopilotCapabilities, topId: string): string[] {
  const pool: Record<string, string[]> = {
    "cache-stale": ["How do I create a category?", "How do I create a form?"],
    "create-category": ["My form is not showing", "How do I create a form?"],
    "activity-log": ["Forms submitted today?", "Open dashboard"],
    "password-reset": ["How do I change my email?", "Verify my email"],
  };

  if (pool[topId]) return pool[topId].slice(0, 3);

  const generic = ["Where are saved forms?", "How do I export a PDF?"];
  if (caps.canCreateForms) generic.unshift("How do I create a form?");
  return generic.slice(0, 3);
}
