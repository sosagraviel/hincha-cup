/**
 * Prompt building utilities for Phase 1 analyzer agents
 */

import {
  getExcludedDirectories,
  loadExecutionInstructions,
} from '../../../../utils/shared/prompt-loader.js';
import {
  buildExcludedDirsTag,
  buildProjectPathTag,
  buildJsonOutputFormat,
  buildContentSection,
} from '../../../../utils/shared/context-tags.js';
import {
  GRAPH_NAVIGATION_DISCIPLINE_HEADING,
  GRAPH_NAVIGATION_DISCIPLINE_TEXT,
} from './canonical-texts.js';
import { renderPromptScripts } from '../../../../services/framework/prompt-scripts/index.js';
import type { CodeGraphStats } from '../../../../state/schemas/initialize-project.schema.js';
import type { AuthoritativeService } from './authoritative-services.js';
import { resolveTempPath } from '../../../../utils/provider-paths.js';
import {
  hashGraphDb,
  readGraphPrefetch,
  renderPrefetchHint,
} from '../../../../services/framework/code-graph/graph-prefetch.service.js';

/**
 * Heuristic: a graph is "large" if it has > 200 files OR > 1000 functions.
 * Above this threshold the lean defaults from `GRAPH_NAVIGATION_DISCIPLINE_TEXT`
 * matter most — exceeding the drill-in budgets will overflow every time.
 */
function isLargeGraph(stats: CodeGraphStats | undefined): boolean {
  if (!stats) return false;
  return (stats.files ?? 0) > 200 || (stats.functions ?? 0) > 1000;
}

export interface GraphPromptContext {
  available: boolean;
  dbPath?: string;
  stats?: CodeGraphStats;
}

/**
 * Inputs to {@link buildPhase1SharedPrefix}.
 *
 * The fields here are intentionally minimal — only the inputs that
 * vary by init run, never by analyzer. Adding any field that varies
 * by analyzer would break byte-determinism of the cache-eligible
 * prefix and silently zero out caching savings.
 */
export interface SharedPrefixContext {
  projectPath: string;
  frameworkPath: string;
  graphContext?: GraphPromptContext;
}

/**
 * Build the cache-eligible prefix shared by every Phase 1 analyzer
 * prompt within a single init run.
 *
 * The prefix is **byte-identical across all four analyzer prompts**
 * so that the automatic prompt cache (Claude API + Claude Code +
 * Codex/GPT-5) can hit on the second through fourth analyzer spawns
 * within the 5-minute TTL.
 *
 * **Byte-determinism contract** — the order and content here MUST be:
 *
 *   1. `<excluded_directories>` — derived from `.gitignore`; same for
 *      every analyzer in a single run.
 *   2. `<project_path>` — same for every analyzer in a single run.
 *   3. `<output_format>` — constant body; agentName is intentionally
 *      NOT interpolated (the body is the same for every Phase 1
 *      analyzer regardless).
 *   4. `=== CODE GRAPH CONTEXT ===` — graph availability, stats, and
 *      navigation discipline. Same for every analyzer in a single run.
 *
 * Anything analyzer-specific (authoritative service list, tool-cap
 * table, execution instructions, validation feedback) goes AFTER the
 * prefix in {@link buildPhase1AnalyzerPrompt}.
 *
 * If you need to add new shared content here, ensure it does NOT
 * include any analyzer-specific tokens, timestamps, or random IDs —
 * the unit test in `prompt-builder-cache.test.ts` SHA-256s the prefix
 * across all four analyzers and will fail loudly on drift.
 */
export function buildPhase1SharedPrefix(ctx: SharedPrefixContext): string {
  const excludedDirs = getExcludedDirectories(ctx.projectPath, ctx.frameworkPath);

  const parts: string[] = [
    buildExcludedDirsTag(excludedDirs),
    '',
    buildProjectPathTag(ctx.projectPath),
    '',
    buildJsonOutputFormat(),
  ];

  if (ctx.graphContext) {
    parts.push('', buildContentSection('Code Graph Context', buildGraphContext(ctx.graphContext)));
  }

  const prefetchHint = renderPrefetchHintForRun(ctx);
  if (prefetchHint.length > 0) {
    parts.push('', buildContentSection('Graph Prefetch', prefetchHint));
  }

  return parts.join('\n');
}

/**
 * Best-effort load of the Phase 0 graph-prefetch snapshot. Returns
 * the rendered hint string (or `''` when no fresh snapshot is
 * available). Pure file I/O bounded by the graph DB SHA hash —
 * fast enough to run on every analyzer prompt build.
 */
function renderPrefetchHintForRun(ctx: SharedPrefixContext): string {
  const dbPath = ctx.graphContext?.dbPath;
  if (!dbPath) return '';
  const graphSha = hashGraphDb(dbPath);
  if (graphSha === 'unknown') return '';
  const snapshot = readGraphPrefetch(ctx.projectPath, graphSha);
  return renderPrefetchHint(snapshot);
}

/**
 * Build input prompt for Phase 1 analyzer agents
 *
 * Used by: structure-architecture, tech-stack-dependencies,
 *          code-patterns-testing, data-flows-integrations
 *
 * The prompt is laid out as **`prefix + tail`**, where:
 *
 *   - `prefix` is byte-identical across all four analyzers (built by
 *     {@link buildPhase1SharedPrefix}). This is what Anthropic's
 *     prompt cache hits on for the second through fourth analyzer
 *     spawns within the 5-minute TTL.
 *   - `tail` carries everything analyzer-specific:
 *     authoritative service list, per-tool budget table, execution
 *     instructions loaded from the analyzer's own prompt files, and
 *     any validation feedback for retry attempts.
 *
 * `authoritativeServices` is supplied by the downstream analyzers (02 / 03 /
 * 04) only — the structure analyzer itself runs first and discovers them.
 * When provided, the rendered tail opens with an `=== AUTHORITATIVE SERVICE
 * LIST ===` block that pins the canonical service IDs the agent must consume
 * verbatim. Stack-agnostic: the block contains only descriptive fields
 * (id / path / type / language) that work for any project shape.
 */
export function buildPhase1AnalyzerPrompt(
  projectPath: string,
  frameworkPath: string,
  agentName: string,
  feedbackPrompt?: string, // Error feedback for retry
  graphContext?: GraphPromptContext,
  authoritativeServices?: AuthoritativeService[],
): string {
  const rawExecutionInstructions = loadExecutionInstructions(agentName, frameworkPath);
  const tempDir = resolveTempPath(projectPath, 'initialize-project');
  let executionInstructions: string | null = null;
  if (rawExecutionInstructions) {
    const substituted = rawExecutionInstructions.replace(/<tempDir>/g, tempDir);
    executionInstructions = renderPromptScripts(substituted, {
      projectPath,
      frameworkPath,
      tempDir,
    });
  }

  const sharedPrefix = buildPhase1SharedPrefix({
    projectPath,
    frameworkPath,
    graphContext,
  });

  const tailParts: string[] = [];

  if (authoritativeServices && authoritativeServices.length > 0) {
    tailParts.push(
      buildContentSection(
        'Authoritative Service List',
        buildAuthoritativeServicesBlock(authoritativeServices),
      ),
    );
  }

  if (executionInstructions) {
    tailParts.push(executionInstructions);
  }

  if (feedbackPrompt) {
    tailParts.push(buildContentSection('Validation Feedback', feedbackPrompt));
  }

  if (tailParts.length === 0) {
    return sharedPrefix;
  }
  return [sharedPrefix, '', tailParts.join('\n\n')].join('\n');
}

/**
 * Renders the authoritative service list block. Stack-agnostic: only
 * descriptive fields (id, path, type, language) — no language-specific or
 * framework-specific scaffolding. The agent is told to use these IDs verbatim
 * and never to invent new ones.
 */
function buildAuthoritativeServicesBlock(services: AuthoritativeService[]): string {
  const lines: string[] = [
    'Authoritative service list (from structure-architecture-analyzer). Use these `id` values verbatim; never invent or rename. Key per-service findings under these IDs.',
    '',
    '| id | path | type | language |',
    '|---|---|---|---|',
  ];
  for (const s of services) {
    const cells = [s.id, s.path || '_(repo root)_', s.type ?? '—', s.language ?? '—'];
    lines.push(`| ${cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`);
  }
  return lines.join('\n');
}

function buildGraphContext(graphContext: GraphPromptContext): string {
  const lines = [
    `Available: ${graphContext.available ? 'yes' : 'no'}`,
    graphContext.dbPath ? `Database: ${graphContext.dbPath}` : undefined,
    graphContext.stats ? `Stats: ${JSON.stringify(graphContext.stats)}` : undefined,
  ].filter(Boolean) as string[];

  if (graphContext.available) {
    lines.push(
      '',
      'Use the code graph as the first source of structural truth before Read/Grep/Glob.',
      'Use Read/Grep/Glob only for details the graph does not provide or for manifest/config verification.',
      '',
      'Call MCP graph tools by their exact server-registered names. The tool-use schema injected at call time carries the full argument list — you do not need a written description.',
    );

    lines.push('', GRAPH_NAVIGATION_DISCIPLINE_HEADING, '', GRAPH_NAVIGATION_DISCIPLINE_TEXT);

    if (isLargeGraph(graphContext.stats)) {
      lines.push(
        '',
        'NOTE: this is a **large graph** (> 200 files or > 1000 functions). Be especially aggressive about the lean defaults and drill-in caps above — exceeding them will overflow.',
      );
    }

    lines.push(
      '',
      "The Stop hook records every mcp__code_graph__* tool call you make and writes the deterministic count into your output's `graph_queries_used` array — you do NOT need to populate that field yourself. Tool-result overflows are also logged; an overflowing call is a regression and will surface as a phase-end warning.",
    );
  } else {
    lines.push(
      '',
      'The code graph is not available in this run. Use Read/Grep/Glob discovery as the fallback.',
    );
  }

  return lines.join('\n');
}
