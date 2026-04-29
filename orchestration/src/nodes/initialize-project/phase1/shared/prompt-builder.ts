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
} from '../../../../services/graph-wiki/graph-navigation-discipline.js';
import type { CodeGraphStats } from '../../../../state/schemas/initialize-project.schema.js';

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
  /**
   * Live MCP tool catalog (`tools/list` from `code-review-graph serve`).
   * Templated into the prompt so analyzer agents call the real tool names
   * — never hand-written strings that drift on each server release.
   */
  toolCatalog?: Array<{ name: string; description: string }>;
}

/**
 * Build input prompt for Phase 1 analyzer agents
 *
 * Used by: structure-architecture, tech-stack-dependencies,
 *          code-patterns-testing, data-flows-integrations
 */
export function buildPhase1AnalyzerPrompt(
  projectPath: string,
  frameworkPath: string,
  agentName: string,
  feedbackPrompt?: string, // Error feedback for retry
  graphContext?: GraphPromptContext,
): string {
  const excludedDirs = getExcludedDirectories(projectPath, frameworkPath);
  const executionInstructions = loadExecutionInstructions(agentName, frameworkPath);

  const parts: string[] = [
    buildExcludedDirsTag(excludedDirs),
    '',
    buildProjectPathTag(projectPath),
    '',
    buildJsonOutputFormat(agentName),
  ];

  if (graphContext) {
    parts.push('', buildContentSection('Code Graph Context', buildGraphContext(graphContext)));
  }

  if (executionInstructions) {
    parts.push('', executionInstructions);
  }

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
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
    );

    // Render the live MCP tool catalog. The set below IS the canonical list
    // of tool names the agent may call — never invent or shorten them. Drift-
    // proof by construction: this list comes straight from `tools/list` on
    // the running `code-review-graph` MCP server (see tool-catalog.service.ts).
    const tools = graphContext.toolCatalog ?? [];
    if (tools.length > 0) {
      lines.push('', 'Available MCP tools (call by exact name; do NOT invent variants):');
      for (const t of tools) {
        const desc = t.description ? ` — ${t.description.replace(/\s+/g, ' ').trim()}` : '';
        lines.push(`- ${t.name}${desc}`);
      }
    } else {
      lines.push(
        '',
        'NOTE: the MCP tool catalog is empty in this run. The Stop hook will reject any analyzer output that claims graph usage without producing tool_use events. If you cannot call any tool, fall back to Read/Grep/Glob and explain why in your output.',
      );
    }

    // The discipline block: top-down navigation, lean defaults, forbid list,
    // drill-in budgets, spill protocol. Single source of truth in
    // `services/graph-wiki/graph-navigation-discipline.ts` — also rendered
    // into the generated CLAUDE.md/AGENTS.md and into the wiki router doc, so
    // every consumer sees the same rules.
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
