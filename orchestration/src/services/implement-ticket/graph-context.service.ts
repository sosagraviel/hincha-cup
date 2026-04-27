import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import matter from 'gray-matter';

const LLM_WIKI_FILES = [
  'index.md',
  'ARCHITECTURE.md',
  'SERVICES.md',
  'DATA-FLOWS.md',
  'PATTERNS.md',
];
const DEFAULT_MAX_CHARS_PER_DOCUMENT = 6000;
const TIERED_DEFAULT_MAX_CHARS_PER_DOCUMENT = 12000;
const MAX_FALLBACK_SUMMARY_CHARS = 160;

export interface WikiSummary {
  /** Path relative to docs/llm-wiki/wiki/ (e.g., 'index.md', 'services/auth.md'). */
  relPath: string;
  /** Absolute path. */
  absPath: string;
  /** Frontmatter `summary` field (≤160 chars; load-bearing). May be empty if missing. */
  summary: string;
  /** Frontmatter `confidence` field. Defaults to 'medium' if absent. */
  confidence: 'high' | 'medium' | 'low';
  /** Frontmatter `document_type` field if present. */
  documentType?: string;
  /** Frontmatter `related` array if present. */
  related?: string[];
}

export interface TieredContextOptions {
  /** Exact relPaths to expand to full bodies. Other files appear summary-only. */
  expandPaths?: string[];
  /** When true, suppress all bodies and return only summaries. */
  summariesOnly?: boolean;
  /** Maximum bytes per expanded body before truncation. Default: 12000. */
  maxCharsPerDocument?: number;
}

export function assertCodeGraphReady(projectPath: string): string {
  const graphPath = join(projectPath, '.code-graph.db');

  if (!existsSync(graphPath)) {
    throw new Error(
      `Code graph database not found: ${graphPath}\n` +
        'Run initialize-project before /implement-ticket so .code-graph.db is available.',
    );
  }

  return graphPath;
}

export function assertAgentHasCodeGraphTool(agentPath: string): void {
  if (!existsSync(agentPath)) {
    throw new Error(
      `Generated agent not found: ${agentPath}\n` +
        'Run initialize-project or sync framework resources before /implement-ticket.',
    );
  }

  const content = readFileSync(agentPath, 'utf-8');
  if (!content.includes('mcp__code_graph')) {
    throw new Error(
      `Generated agent is not graph-aware: ${agentPath}\n` +
        'Run initialize-project or sync framework resources so generated agents include mcp__code_graph.',
    );
  }
}

export function loadLlmWikiContext(projectPath: string): string {
  const wikiDir = join(projectPath, 'docs', 'llm-wiki', 'wiki');
  const sections: string[] = [];

  for (const fileName of LLM_WIKI_FILES) {
    const filePath = join(wikiDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const content = stripFrontmatter(readFileSync(filePath, 'utf-8')).trim();
    if (!content) {
      continue;
    }

    sections.push(
      [
        `## ${basename(fileName, '.md')}`,
        truncateForPrompt(content, DEFAULT_MAX_CHARS_PER_DOCUMENT),
      ].join('\n\n'),
    );
  }

  if (sections.length === 0) {
    return '';
  }

  return ['# LLM Wiki Context', ...sections].join('\n\n');
}

/**
 * Load summary and frontmatter metadata for every wiki page.
 * Reads each file once and parses both frontmatter and body via gray-matter.
 * Skips files that don't exist; never throws on a missing wiki.
 */
export function loadLlmWikiSummaries(projectPath: string): WikiSummary[] {
  const wikiDir = join(projectPath, 'docs', 'llm-wiki', 'wiki');
  const summaries: WikiSummary[] = [];

  for (const fileName of LLM_WIKI_FILES) {
    const absPath = join(wikiDir, fileName);
    if (!existsSync(absPath)) {
      continue;
    }
    summaries.push(parseWikiSummary(fileName, absPath));
  }

  const servicesDir = join(wikiDir, 'services');
  if (existsSync(servicesDir)) {
    let entries: Array<{ name: string; isFile: () => boolean }> = [];
    try {
      entries = readdirSync(servicesDir, { withFileTypes: true }) as Array<{
        name: string;
        isFile: () => boolean;
      }>;
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile() || !String(entry.name).endsWith('.md')) {
        continue;
      }
      const relPath = `services/${String(entry.name)}`;
      const absPath = join(servicesDir, String(entry.name));
      summaries.push(parseWikiSummary(relPath, absPath));
    }
  }

  return summaries;
}

/**
 * Tiered retrieval loader. Returns a single string suitable for injection into
 * a planner or implementer prompt.
 *
 * Tier 1 (summary index) is always included. Tier 2 (full bodies) is included
 * only for paths listed in expandPaths. When summariesOnly is true, no body
 * sections are emitted at all.
 */
export function loadLlmWikiContextTiered(
  projectPath: string,
  options: TieredContextOptions = {},
): string {
  const { expandPaths = [], summariesOnly = false, maxCharsPerDocument } = options;
  const maxChars = maxCharsPerDocument ?? TIERED_DEFAULT_MAX_CHARS_PER_DOCUMENT;
  const expandSet = new Set(expandPaths);

  const summaries = loadLlmWikiSummaries(projectPath);
  if (summaries.length === 0) {
    return '';
  }

  const indexLines: string[] = [];
  for (const s of summaries) {
    const summaryText = s.summary ? ` — ${s.summary}` : '';
    indexLines.push(`- ${s.relPath} (confidence: ${s.confidence})${summaryText}`);
  }

  const sections: string[] = ['## Summary index', indexLines.join('\n')];

  if (!summariesOnly) {
    for (const s of summaries) {
      const sectionName = basename(s.relPath, '.md');
      if (!expandSet.has(s.relPath)) {
        sections.push(`## ${sectionName}\n\nSee summary above.`);
        continue;
      }
      const raw = readFileSync(s.absPath, 'utf-8');
      const parsed = matter(raw);
      const body = parsed.content.trim();
      if (!body) {
        sections.push(`## ${sectionName}\n\nSee summary above.`);
        continue;
      }
      sections.push([`## ${sectionName}`, truncateForPrompt(body, maxChars)].join('\n\n'));
    }
  }

  return ['# LLM Wiki Context', ...sections].join('\n\n');
}

function parseWikiSummary(relPath: string, absPath: string): WikiSummary {
  const raw = readFileSync(absPath, 'utf-8');
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const confidence = parseConfidence(data['confidence']);
  const summary = parseSummary(data['summary'], parsed.content);
  const documentType =
    typeof data['document_type'] === 'string' ? data['document_type'] : undefined;
  const related = Array.isArray(data['related'])
    ? (data['related'] as unknown[]).filter((r): r is string => typeof r === 'string')
    : undefined;

  return { relPath, absPath, summary, confidence, documentType, related };
}

function parseConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return 'medium';
}

function parseSummary(frontmatterSummary: unknown, body: string): string {
  if (typeof frontmatterSummary === 'string' && frontmatterSummary.trim()) {
    return frontmatterSummary.trim().slice(0, MAX_FALLBACK_SUMMARY_CHARS);
  }
  const firstLine = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  return firstLine ? firstLine.slice(0, MAX_FALLBACK_SUMMARY_CHARS) : '';
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) {
    return content;
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return content;
  }

  return content.slice(endIndex + '\n---'.length);
}

function truncateForPrompt(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  return `${content.slice(0, maxChars).trimEnd()}\n\n[Truncated to ${maxChars} characters for prompt budget]`;
}
