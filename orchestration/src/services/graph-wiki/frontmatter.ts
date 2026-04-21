import matter from 'gray-matter';
import {
  AI_KNOWLEDGE_CONTEXT_END,
  AI_KNOWLEDGE_CONTEXT_START,
  type WikiGraphState,
} from './types.js';
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

export function buildContextSection(graph: WikiGraphState): string {
  const graphSource = graph.path ? relativeGraphPath(graph.path) : '.code-graph.db';
  return [
    AI_KNOWLEDGE_CONTEXT_START,
    '## AI Knowledge Wiki',
    '- Wiki: `docs/ai-knowledge/index.md`',
    `- Graph-backed docs: generated from ${graphSource} with wiki-generator synthesis.`,
    '- Before broad code changes, consult the relevant `docs/ai-knowledge/` page, then inspect source files for details.',
    AI_KNOWLEDGE_CONTEXT_END,
  ].join('\n');
}

export function upsertAiKnowledgeContextSection(content: string, section: string): string {
  const normalizedSection = section.trim();
  const sectionPattern = new RegExp(
    `${escapeRegExp(AI_KNOWLEDGE_CONTEXT_START)}[\\s\\S]*?${escapeRegExp(AI_KNOWLEDGE_CONTEXT_END)}`,
    'm',
  );

  if (sectionPattern.test(content)) {
    return ensureTrailingNewline(content.replace(sectionPattern, normalizedSection));
  }

  return ensureTrailingNewline(`${content.trimEnd()}\n\n${normalizedSection}`);
}
