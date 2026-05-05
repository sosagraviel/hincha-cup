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
import type { AuthoritativeService } from './authoritative-services.js';
import { PER_ANALYZER_TOOL_CALL_CAPS, renderPerToolCapsTable } from './graph-tool-usage.js';

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
 *
 * `authoritativeServices` is supplied by the downstream analyzers (02 / 03 /
 * 04) only — the structure analyzer itself runs first and discovers them.
 * When provided, the rendered prompt opens with an `=== AUTHORITATIVE SERVICE
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
  const excludedDirs = getExcludedDirectories(projectPath, frameworkPath);
  const executionInstructions = loadExecutionInstructions(agentName, frameworkPath);

  const parts: string[] = [
    buildExcludedDirsTag(excludedDirs),
    '',
    buildProjectPathTag(projectPath),
    '',
    buildJsonOutputFormat(agentName),
  ];

  if (authoritativeServices && authoritativeServices.length > 0) {
    parts.push(
      '',
      buildContentSection(
        'Authoritative Service List',
        buildAuthoritativeServicesBlock(authoritativeServices),
      ),
    );
  }

  if (graphContext) {
    parts.push('', buildContentSection('Code Graph Context', buildGraphContext(graphContext)));
  }

  // Per-analyzer soft tool-call cap. Non-blocking — exceeding the cap
  // surfaces a `tool_call_budget_exceeded` soft warning in the persisted
  // output and nudges the agent on the next attempt. See gira-init-run
  // audit findings F10 / F11 / F27 (data-flows-analyzer alone made 52
  // tool calls in 57 turns; no cap = no nudge).
  //
  // Per-tool caps (added 2026-05-05 after the second gira run showed
  // structure-architecture making 38 get_community_tool calls + 4
  // overflows): each tool has its own budget, and an overflow on a tool
  // counts double against that tool's remaining budget. Together with
  // the spill-protocol HARD FAILURE wording in graph-navigation-
  // discipline.ts, this is the structural fix for the overflow
  // regression.
  const cap = PER_ANALYZER_TOOL_CALL_CAPS[agentName];
  const perToolCapsTable = renderPerToolCapsTable(agentName);
  if (typeof cap === 'number' || perToolCapsTable) {
    const sections: string[] = [];
    if (typeof cap === 'number') {
      sections.push(
        `Total tool-call budget for this analyzer: **${cap}**. Exceeding ${cap} substantially without new findings surfaces a non-blocking \`tool_call_budget_exceeded\` warning. The graph is the language-agnostic primitive — favour it over Glob/Read for any structural or relational question.`,
      );
    }
    if (perToolCapsTable) {
      sections.push(perToolCapsTable);
    }
    parts.push('', buildContentSection('Tool Budget Guidance', sections.join('\n\n')));
  }

  if (executionInstructions) {
    parts.push('', executionInstructions);
  }

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}

/**
 * Renders the authoritative service list block. Stack-agnostic: only
 * descriptive fields (id, path, type, language) — no language-specific or
 * framework-specific scaffolding. The agent is told to use these IDs verbatim
 * and never to invent new ones.
 */
function buildAuthoritativeServicesBlock(services: AuthoritativeService[]): string {
  const lines: string[] = [
    'The structure-architecture-analyzer ran first and is the SINGLE SOURCE OF TRUTH for service discovery. The services below are authoritative; you MUST consume their IDs verbatim and MUST NOT introduce new IDs of your own. If a directory looks like it could be a service but its ID is not in the list below, ignore it — that decision was already made.',
    '',
    '| id | path | type | language |',
    '|---|---|---|---|',
  ];
  for (const s of services) {
    const cells = [s.id, s.path || '_(repo root)_', s.type ?? '—', s.language ?? '—'];
    lines.push(`| ${cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`);
  }
  lines.push(
    '',
    `Total: ${services.length} service${services.length === 1 ? '' : 's'}. Reference each by \`id\` in your output (use the \`by_service\` map keyed by service ID, or otherwise organize per-service findings under these IDs as documented in your output schema). Do NOT emit a top-level \`findings.services[]\` array — that key is forbidden in your schema.`,
  );
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
