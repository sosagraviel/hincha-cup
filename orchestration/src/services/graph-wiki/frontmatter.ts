import matter from 'gray-matter';
import {
  GRAPH_DISCIPLINE_CONTEXT_END,
  GRAPH_DISCIPLINE_CONTEXT_START,
  LLM_WIKI_CONTEXT_END,
  LLM_WIKI_CONTEXT_START,
  type SchemaFileName,
  type WikiGraphState,
} from './types.js';
import {
  GRAPH_NAVIGATION_DISCIPLINE_HEADING,
  GRAPH_NAVIGATION_DISCIPLINE_TEXT,
} from './graph-navigation-discipline.js';
import { ensureTrailingNewline, escapeRegExp, relativeGraphPath } from './utils.js';

export function withFrontmatter(body: string, frontmatter: Record<string, unknown>): string {
  return ensureTrailingNewline(matter.stringify(ensureTrailingNewline(body), frontmatter));
}

export function stripMarkdownFrontmatter(content: string): string {
  if (!content.trimStart().startsWith('---')) {
    return content;
  }

  try {
    return matter(content).content;
  } catch {
    return content;
  }
}

/**
 * The fenced LLM-Wiki section appended to `<project>/.claude/CLAUDE.md` (or
 * `.codex/AGENTS.md`). Many sessions never invoke the dedicated ticket skills
 * and rely on this chunk for ambient wiki guidance — so it must name the
 * **router file** as the entry point, not just `index.md`. The router
 * (≤150 lines, decision table + tier discipline + live graph-tool catalog) is
 * what makes Tier 1 retrieval cheap. The three prescriptive convention skills
 * generated alongside CLAUDE.md (code-conventions, multi-file-workflows,
 * testing-conventions) intentionally do NOT carry this section — they hold
 * prescriptive rules only and the wiki pointer belongs in one place.
 *
 * `schemaFilename` is provider-aware (`CLAUDE.md` / `AGENTS.md` / `COPILOT.md`)
 * so the chunk points at the file that actually exists for the active provider.
 */
export function buildContextSection(graph: WikiGraphState, schemaFilename: SchemaFileName): string {
  const graphSource = graph.path ? relativeGraphPath(graph.path) : '.code-review-graph/graph.db';
  return [
    LLM_WIKI_CONTEXT_START,
    '## LLM Wiki',
    `- Router (entry point): \`docs/llm-wiki/${schemaFilename}\` — decision table, tier discipline, available graph tools. **Read this first.**`,
    '- Index (summary catalog): `docs/llm-wiki/wiki/index.md` — one line per page; pick the 1–3 pages whose summaries match your question.',
    `- Graph-backed docs: generated from ${graphSource} with wiki-generator synthesis.`,
    '- Before broad code changes: load the router → match the index → read only the matched pages. Stop wikilink traversal at depth 2. Fall back to graph MCP tools only if the wiki does not answer.',
    LLM_WIKI_CONTEXT_END,
  ].join('\n');
}

/**
 * Build the fenced "Graph navigation discipline" section appended to
 * `<project>/.claude/CLAUDE.md` (or `.codex/AGENTS.md`).
 *
 * As of 2026-05-05 (plan §E.1) this emits a 4-line POINTER, not the full
 * discipline body. The full body lives in:
 *   1. `graph-navigation-discipline.ts` (single source of truth at code level)
 *   2. The wiki router (`docs/llm-wiki/CLAUDE.md` / `AGENTS.md`) — embedded
 *      verbatim by `wiki-generator.service.ts::buildSchemaDocBody`.
 *   3. Phase 1 analyzer prompts — embedded verbatim by
 *      `prompt-builder.ts::buildGraphContext`.
 *
 * The previous behaviour embedded the full body (~44 lines) here too,
 * duplicating the wiki router and bloating CLAUDE.md. The pointer keeps
 * CLAUDE.md ≤ 150 lines and avoids drift between the schema doc and the
 * wiki router.
 *
 * Both fenced sentinels (`<!-- GRAPH_DISCIPLINE_START -->` ...
 * `<!-- GRAPH_DISCIPLINE_END -->`) are preserved so existing upsert
 * regexes still target the right block on regeneration.
 */
export function buildGraphDisciplineSection(): string {
  return [
    GRAPH_DISCIPLINE_CONTEXT_START,
    GRAPH_NAVIGATION_DISCIPLINE_HEADING,
    '',
    'Top-down, never breadth-first. Graph MCP tools have strict per-result token caps; unbounded calls overflow silently. The full discipline (lean defaults, drill-in budgets, forbidden tools, spill-protocol HARD-FAILURE semantics) lives in the wiki router at `docs/llm-wiki/CLAUDE.md` (or `AGENTS.md` on Codex). Read it before issuing graph queries; do NOT improvise tool parameters from prior knowledge.',
    GRAPH_DISCIPLINE_CONTEXT_END,
  ].join('\n');
}

/**
 * Generic fenced-section upsert. Replaces an existing fenced block in place;
 * appends a new one when no prior block exists. Used by both the LLM Wiki
 * and Graph Discipline upserts so they share regex/replace logic.
 */
export function upsertFencedSection(
  content: string,
  section: string,
  startSentinel: string,
  endSentinel: string,
): string {
  const normalizedSection = section.trim();
  const sectionPattern = new RegExp(
    `${escapeRegExp(startSentinel)}[\\s\\S]*?${escapeRegExp(endSentinel)}`,
    'm',
  );

  if (sectionPattern.test(content)) {
    return ensureTrailingNewline(content.replace(sectionPattern, normalizedSection));
  }

  return ensureTrailingNewline(`${content.trimEnd()}\n\n${normalizedSection}`);
}

/**
 * Back-compat wrapper around `upsertFencedSection` for the LLM Wiki section.
 * Existing callers keep their signature; new code can call
 * `upsertFencedSection` directly with arbitrary sentinels.
 */
export function upsertLlmWikiContextSection(content: string, section: string): string {
  return upsertFencedSection(content, section, LLM_WIKI_CONTEXT_START, LLM_WIKI_CONTEXT_END);
}
