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
 * `.codex/AGENTS.md`) and to the project-context skill body. Many sessions
 * never invoke the dedicated ticket skills and rely on this chunk for ambient
 * wiki guidance — so it must name the **router file** as the entry point,
 * not just `index.md`. The router (≤150 lines, decision table + tier
 * discipline + live graph-tool catalog) is what makes Tier 1 retrieval cheap.
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
 * `<project>/.claude/CLAUDE.md` (or `.codex/AGENTS.md`) and to the project-
 * context skill body. Same idempotent upsert pattern as the LLM Wiki section,
 * different sentinels.
 *
 * The body is the canonical text from `graph-navigation-discipline.ts` —
 * single source of truth across the Phase 1 prompt-builder, the wiki router
 * doc, this fenced section, and the ticket-skill cross-references.
 */
export function buildGraphDisciplineSection(): string {
  return [
    GRAPH_DISCIPLINE_CONTEXT_START,
    GRAPH_NAVIGATION_DISCIPLINE_HEADING,
    '',
    GRAPH_NAVIGATION_DISCIPLINE_TEXT,
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
