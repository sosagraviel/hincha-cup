import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';

const AI_KNOWLEDGE_FILES = ['ARCHITECTURE.md', 'SERVICES.md', 'DATA-FLOWS.md', 'PATTERNS.md'];
const DEFAULT_MAX_CHARS_PER_DOCUMENT = 6000;

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

export function loadAiKnowledgeContext(projectPath: string): string {
  const wikiDir = join(projectPath, 'docs', 'ai-knowledge');
  const sections: string[] = [];

  for (const fileName of AI_KNOWLEDGE_FILES) {
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

  return ['# AI Knowledge Wiki Context', ...sections].join('\n\n');
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
