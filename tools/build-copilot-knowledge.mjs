#!/usr/bin/env node
/**
 * Validates the copilot knowledge index (chunk ids, tag coverage).
 * Run after editing src/lib/copilot/knowledgeIndex.ts
 *
 *   node tools/build-copilot-knowledge.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "src/lib/copilot/knowledgeIndex.ts");
const raw = readFileSync(indexPath, "utf8");

const idMatches = [...raw.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
const dupes = idMatches.filter((id, i) => idMatches.indexOf(id) !== i);
if (dupes.length) {
  console.error("Duplicate chunk ids:", [...new Set(dupes)]);
  process.exit(1);
}

console.log(`Copilot knowledge index: ${idMatches.length} chunks`);
console.log("Ids:", idMatches.join(", "));
