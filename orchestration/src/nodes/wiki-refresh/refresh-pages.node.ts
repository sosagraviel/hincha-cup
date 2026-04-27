import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { invokeWikiAgent } from '../../services/graph-wiki/agent-invoker.js';
import { graphDbPath } from '../../services/graph-wiki/code-graph.service.js';
import {
  computeGraphVersion,
  computeGraphCommit,
} from '../../services/graph-wiki/agent-invoker.js';
import {
  WIKI_AGENT_NAME,
  type WikiGeneratorServiceOptions,
} from '../../services/graph-wiki/types.js';
import type { WikiRefreshState, GeneratedPage } from '../../state/schemas/wiki-refresh.schema.js';

const GENERATED_BY = 'ai-agentic-framework';

/**
 * Regenerates every page in refresh_set using the wiki-generator agent.
 * Runs concurrently via Promise.all. For each page, passes the existing
 * page content and the diff as context. On dry_run, returns the planned
 * set without making any agent calls.
 */
export async function refreshPagesNode(
  state: WikiRefreshState,
): Promise<Partial<WikiRefreshState>> {
  if (state.dry_run) {
    return {
      current_phase: 'refresh_pages',
    };
  }

  if (state.refresh_set.length === 0) {
    return {
      current_phase: 'refresh_pages',
    };
  }

  const dbPath = graphDbPath(state.project_path);
  const graphVersion = existsSync(dbPath) ? computeGraphVersion(dbPath) : 'unknown';
  const graphCommit = computeGraphCommit(state.project_path);
  const generatedAt = new Date().toISOString();

  const wikiAgentOptions: WikiGeneratorServiceOptions = {
    projectPath: state.project_path,
    frameworkPath: state.framework_path,
    provider: state.provider,
    generatedAt,
    analyzers: {},
    graph: {
      available: existsSync(dbPath),
      path: dbPath,
    },
  };

  const results = await Promise.all(
    state.refresh_set.map((pageRelativePath) =>
      refreshSinglePage(
        pageRelativePath,
        state,
        wikiAgentOptions,
        generatedAt,
        graphVersion,
        graphCommit,
      ),
    ),
  );

  const generatedPages = results.filter((r): r is GeneratedPage => r !== null);
  const errors = results
    .filter((r): r is null => r === null)
    .map((_, i) => `refresh_pages: failed to refresh ${state.refresh_set[i]}`);

  return {
    generated_pages: generatedPages,
    current_phase: 'refresh_pages',
    errors: errors.length > 0 ? errors : [],
  };
}

async function refreshSinglePage(
  pageRelativePath: string,
  state: WikiRefreshState,
  wikiAgentOptions: WikiGeneratorServiceOptions,
  generatedAt: string,
  graphVersion: string,
  graphCommit: string,
): Promise<GeneratedPage | null> {
  const absolutePath = join(state.project_path, pageRelativePath);

  let existingContent = '';
  let existingFrontmatter: Record<string, unknown> = {};

  if (existsSync(absolutePath)) {
    try {
      const raw = readFileSync(absolutePath, 'utf-8');
      const parsed = matter(raw);
      existingContent = parsed.content;
      existingFrontmatter = parsed.data as Record<string, unknown>;
    } catch {
      existingContent = '';
      existingFrontmatter = {};
    }
  }

  const filename = pageRelativePath.replace(/^docs\/llm-wiki\//, '');
  const documentType = String(existingFrontmatter.document_type ?? 'service');

  const changedFilesSummary =
    state.changed_files.length > 0
      ? `Changed files since last refresh:\n${state.changed_files
          .slice(0, 20)
          .map((f) => `- ${f}`)
          .join('\n')}`
      : 'Full refresh requested.';

  const prompt = [
    `Refresh the following wiki page. Update only the sections affected by the changed files below.`,
    `Preserve prose, structure, and frontmatter fields whose source-chunk has not changed.`,
    '',
    `## Page to refresh`,
    `Filename: ${filename}`,
    '',
    `## Existing content`,
    existingContent || '(page does not exist yet — generate from scratch)',
    '',
    `## ${changedFilesSummary}`,
    '',
    `## Instructions`,
    `1. Re-read the relevant source files listed above.`,
    `2. Update only the paragraphs / sections that are affected by the changes.`,
    `3. Bump generated_at to ${generatedAt}.`,
    `4. Set graph_version to ${graphVersion}.`,
    `5. Set graph_commit to ${graphCommit}.`,
    `6. Return only the page body (no frontmatter YAML — the pipeline adds it).`,
    `7. Document type: ${documentType}.`,
  ].join('\n');

  try {
    const rawBody = await invokeWikiAgent(
      wikiAgentOptions,
      documentType,
      filename as Parameters<typeof invokeWikiAgent>[2],
      prompt,
    );

    const updatedFrontmatter = {
      ...existingFrontmatter,
      generated_at: generatedAt,
      generated_by: GENERATED_BY,
      graph_version: graphVersion,
      graph_commit: graphCommit,
      last_verified: generatedAt,
    };

    const frontmatterYaml = buildFrontmatterYaml(updatedFrontmatter);
    const content = `---\n${frontmatterYaml}---\n\n${rawBody.trim()}\n`;

    return { filename: pageRelativePath, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[wiki-refresh] WARNING: failed to refresh ${filename}: ${message}\n`);
    return null;
  }
}

function buildFrontmatterYaml(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${typeof item === 'string' ? item : JSON.stringify(item)}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.join('\n') + '\n';
}
