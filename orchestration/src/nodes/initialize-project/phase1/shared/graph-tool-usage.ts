import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { logger } from '../../../../utils/logger.js';
import { claudeProjectSlug } from '../../../../services/framework/transcripts/capture.js';
import {
  hasAnyManifestVsImportMismatch,
  hasSpeculativeNeedsVerification,
  validateNeedsVerificationProse,
} from './needs-verification-quality.js';

/**
 * Sidecar contract written by `validate-analyzer-json.hook.ts` next to the
 * Claude session transcript. Source-of-truth for "which graph tools did the
 * analyzer actually call AND which results overflowed".
 *
 * Path: `~/.claude/projects/<claudeProjectSlug(projectPath)>/<sessionId>.graph-tool-uses.json`
 */
export interface GraphToolUsesSidecar {
  count: number;
  uniqueNames: string[];
  /**
   * One entry per overflowing tool result (sentinel match in the transcript).
   * Optional for back-compat with older sidecars that predate Phase 3 of the
   * graph-navigation redesign. When the sidecar lacks this field, treat as 0
   * overflows.
   */
  overflows?: Array<{ tool: string; callIndex: number }>;
  /**
   * Per-tool call counts for graph tools (e.g.
   * `{ "mcp__code_graph__semantic_search_nodes_tool": 16 }`). Drives the
   * `graph_search_overuse` soft warning. Optional for back-compat — older
   * sidecars predate the gira-init-run audit Phase E and have no value.
   */
  nameCounts?: Record<string, number>;
  /**
   * Total non-graph tool_use events (Read/Glob/Grep/Bash/etc.). Drives the
   * `low_graph_ratio` soft warning. Optional for back-compat.
   */
  nonGraphCount?: number;
}

/**
 * Per-analyzer soft caps for total tool calls. Exceeding the cap surfaces a
 * `tool_call_budget_exceeded` soft warning in the persisted output but does
 * NOT fail the run.
 *
 * Caps recalibrated 2026-05-05 (plan §C 2.2 of the gira-exhaustive followup)
 * to ~10% headroom over the 2026-05-05 gira distribution (30/30/25/42 across
 * the four analyzers AFTER the parent series' within-prompt restatement
 * scrub). Three of four analyzers were exceeding the prior caps because
 * legitimate manifest reads, runtime-version detection, and build-config
 * inspection ARE non-graph calls regardless of language. The caps are now
 * fall-back ceilings; the actual budget enforcement is the per-tool table
 * below.
 *
 * Stack-agnostic: the values are wall-clock budgets, not language-specific.
 * Manifests + build configs the analyzers must read vary by language
 * (`package.json` vs `pyproject.toml` vs `pom.xml` vs `Cargo.toml` vs
 * `go.mod` vs `composer.json` vs `Gemfile` vs `*.csproj` vs `build.sbt` …)
 * but the AGGREGATE budget is calibrated against the analyzer's prescribed
 * step count, not the language.
 */
export const PER_ANALYZER_TOOL_CALL_CAPS: Record<string, number> = {
  'structure-architecture-analyzer': 35, // was 25 — gira distribution: 30
  'tech-stack-dependencies-analyzer': 30, // was 20 — gira distribution: 30
  'code-patterns-testing-analyzer': 30, // was 25 — gira distribution: 25
  'data-flows-integrations-analyzer': 40, // was 30 — gira distribution: 42 (legitimately exceeds)
  // Plan v4 Phase D — per-service detail extractor. Tighter than the
  // analyzers above because each sub-agent is scoped to ONE service:
  // ≤ 6 graph calls + ≤ 8 reads (per execution-instructions.md) → 14
  // expected, with headroom for retries / verification.
  'service-detail-extractor': 20,
};

/**
 * Per-analyzer per-tool soft caps. Templated into the analyzer prompt as a
 * markdown table the agent re-reads mid-session. Exceeding any per-tool cap
 * surfaces `per_tool_budget_exceeded` in the soft-warning list, but does NOT
 * fail the run.
 *
 * Caps were derived from the gira-run audit (2026-05-04): the
 * structure-architecture-analyzer made 38 `get_community_tool` calls and
 * caused 4 overflows in a single Phase 1 run. Each overflow blows ~22 KB
 * of sidecar-pointer text into the agent's context — the per-tool cap is
 * the structural fix.
 *
 * The `_default` row is used when the analyzer is not explicitly listed
 * (forward-compat for any future analyzer added without updating this
 * table). The overflow-doubling rule (an overflow on a tool counts double
 * against that tool's remaining budget) is enforced by the discipline
 * itself; this table is the soft-cap baseline.
 *
 * Stack-agnostic: the values are call counts, not language-specific.
 */
export const PER_ANALYZER_PER_TOOL_CAPS: Record<string, Record<string, number>> = {
  'structure-architecture-analyzer': {
    // The 2026-05-04 gira run had structure-architecture making 38
    // get_community_tool calls + 4 overflows. The community / hub /
    // bridge tools are the targeted regression — capped tight.
    // semantic_search is the discovery workhorse — kept generous.
    mcp__code_graph__get_minimal_context_tool: 2,
    mcp__code_graph__list_communities_tool: 2,
    mcp__code_graph__get_community_tool: 4,
    mcp__code_graph__get_hub_nodes_tool: 2,
    mcp__code_graph__get_bridge_nodes_tool: 2,
    mcp__code_graph__semantic_search_nodes_tool: 6,
    mcp__code_graph__query_graph_tool: 6,
    mcp__code_graph__get_impact_radius_tool: 2,
    mcp__code_graph__list_flows_tool: 2,
    mcp__code_graph__get_flow_tool: 2,
    mcp__code_graph__find_large_functions_tool: 2,
    mcp__code_graph__traverse_graph_tool: 2,
  },
  'tech-stack-dependencies-analyzer': {
    mcp__code_graph__get_minimal_context_tool: 1,
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__get_community_tool: 3,
    mcp__code_graph__semantic_search_nodes_tool: 6,
    mcp__code_graph__query_graph_tool: 4,
    mcp__code_graph__find_large_functions_tool: 1,
  },
  'code-patterns-testing-analyzer': {
    mcp__code_graph__get_minimal_context_tool: 1,
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__get_community_tool: 3,
    // Workhorse for this analyzer — pattern detection leans on semantic
    // search across the full surface area.
    mcp__code_graph__semantic_search_nodes_tool: 8,
    mcp__code_graph__query_graph_tool: 4,
    mcp__code_graph__find_large_functions_tool: 4,
  },
  'data-flows-integrations-analyzer': {
    mcp__code_graph__get_minimal_context_tool: 1,
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__get_community_tool: 3,
    mcp__code_graph__list_flows_tool: 2,
    mcp__code_graph__get_flow_tool: 4,
    mcp__code_graph__semantic_search_nodes_tool: 6,
    mcp__code_graph__query_graph_tool: 6,
    mcp__code_graph__traverse_graph_tool: 2,
  },
  'service-detail-extractor': {
    // Single-service scope: tight per-tool budgets so the sub-agent
    // doesn't drift into broad surveys. The execution-instructions
    // spell out the same shape (≤ 6 graph + ≤ 8 reads); this table
    // is the numerical guardrail.
    mcp__code_graph__get_minimal_context_tool: 3,
    mcp__code_graph__semantic_search_nodes_tool: 4,
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__query_graph_tool: 2,
    mcp__code_graph__get_community_tool: 1,
  },
};

/**
 * Render the per-analyzer per-tool cap table as a markdown table the analyzer
 * can read mid-session. Returns an empty string when the analyzer name is not
 * in `PER_ANALYZER_PER_TOOL_CAPS` (no cap table to inject — fall back to the
 * total-cap warning only).
 */
export function renderPerToolCapsTable(agentName: string): string {
  const caps = PER_ANALYZER_PER_TOOL_CAPS[agentName];
  if (!caps) return '';

  const rows = Object.entries(caps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tool, cap]) => `| \`${tool}\` | ${cap} |`)
    .join('\n');

  return [
    '### Per-tool soft caps (this analyzer)',
    '',
    '| Tool | Max calls |',
    '|---|---:|',
    rows,
    '',
    "An overflow sentinel from any tool counts DOUBLE against that tool's remaining budget. Exceeding any cap surfaces `per_tool_budget_exceeded` in this analyzer's soft-warning list — non-blocking, but visible in the run report.",
  ].join('\n');
}

/**
 * Per-analyzer thresholds for `low_graph_ratio` (graph-call ratio below
 * which the agent is "grep-spamming over the graph"). Recalibrated
 * 2026-05-05 (plan §C 2.2 of the gira-exhaustive followup).
 *
 * The 2026-05-05 gira run had 3 of 4 analyzers fire `low_graph_ratio` at
 * the prior global 40% threshold:
 *   - structure-arch: 23% (Glob/Read for runtime versions, build configs)
 *   - tech-stack: 20% (manifest reads — pyproject.toml, pom.xml,
 *     Cargo.toml, package.json, etc., are how dependency versions are
 *     declared in every language family)
 *   - code-patterns: 20% (test config + ESLint/Black/RuboCop rule files)
 *   - data-flows: 43% (passed; flow inventory is graph-friendly)
 *
 * Stack-agnostic: legitimate non-graph reads scale with manifest count
 * across every language. Tech-stack on a Java multi-module project
 * reads N `pom.xml` files just like a JS project reads N `package.json`
 * files. The thresholds reflect each analyzer's STRUCTURAL workload,
 * not the language.
 *
 * `_default` row applies when an analyzer name is not explicitly
 * listed (forward-compat).
 */
export const LOW_GRAPH_RATIO_THRESHOLDS: Record<string, number> = {
  'structure-architecture-analyzer': 0.25, // legitimately reads runtime versions + build configs
  'tech-stack-dependencies-analyzer': 0.2, // legitimately reads many manifests
  'code-patterns-testing-analyzer': 0.3, // legitimately reads test configs + linter rules
  'data-flows-integrations-analyzer': 0.4, // graph-friendly (flow tools)
  _default: 0.3,
};

/**
 * @deprecated `SEMANTIC_SEARCH_OVERUSE_THRESHOLD = 8` removed 2026-05-05.
 * The per-analyzer per-tool caps in `PER_ANALYZER_PER_TOOL_CAPS` are now
 * the single source of truth for semantic_search overuse. The standalone
 * threshold disagreed with the per-tool caps (8 vs 6 for data-flows)
 * and produced false-positive warnings. The
 * `per_tool_budget_exceeded` soft warning subsumes the prior
 * `graph_search_overuse` signal.
 */

/**
 * Compute the soft-warning list for an analyzer run. Returns sorted unique
 * strings drawn from a fixed vocabulary so downstream consumers can switch
 * on them. Empty array when no signal fires.
 *
 * Stack-agnostic — every check is a pure number comparison.
 */
export function computeSoftWarnings(
  agentName: string,
  graphCount: number,
  nonGraphCount: number,
  nameCounts: Record<string, number>,
  overflows: Array<{ tool: string; callIndex: number }> = [],
): string[] {
  const warnings = new Set<string>();
  const total = graphCount + nonGraphCount;

  if (total > 0) {
    const ratio = graphCount / total;
    const threshold =
      LOW_GRAPH_RATIO_THRESHOLDS[agentName] ?? LOW_GRAPH_RATIO_THRESHOLDS._default ?? 0.3;
    if (ratio < threshold) {
      warnings.add('low_graph_ratio');
    }
  }

  // The standalone `graph_search_overuse` warning was retired 2026-05-05
  // in favour of the per-tool budget enforcement below — those two
  // checks were measuring the same thing with conflicting thresholds
  // (8 global vs 6 per-tool for data-flows). Per-tool budget is the
  // single source of truth.

  const cap = PER_ANALYZER_TOOL_CALL_CAPS[agentName];
  if (typeof cap === 'number' && total > cap) {
    warnings.add('tool_call_budget_exceeded');
  }

  // Per-tool budget — an overflow on a tool counts DOUBLE against that
  // tool's remaining budget (per the discipline's spill protocol §5).
  // Surface `per_tool_budget_exceeded` when any tool's effective count
  // (calls + overflows) exceeds its cap from PER_ANALYZER_PER_TOOL_CAPS.
  const perToolCaps = PER_ANALYZER_PER_TOOL_CAPS[agentName];
  if (perToolCaps) {
    const overflowsByTool: Record<string, number> = {};
    for (const ov of overflows) {
      overflowsByTool[ov.tool] = (overflowsByTool[ov.tool] ?? 0) + 1;
    }
    for (const [tool, perToolCap] of Object.entries(perToolCaps)) {
      const calls = nameCounts[tool] ?? 0;
      const ov = overflowsByTool[tool] ?? 0;
      // Overflows count double — the discipline's "an overflow counts
      // DOUBLE against that tool's remaining budget" rule.
      const effective = calls + ov;
      if (effective > perToolCap) {
        warnings.add('per_tool_budget_exceeded');
        break;
      }
    }
  }

  // Any overflow at all is worth surfacing — the discipline says reading
  // the spillover file costs the same tokens as if the call had succeeded,
  // so an overflow that the agent then ignores blows the run's budget.
  if (overflows.length > 0) {
    warnings.add('graph_overflow_detected');
  }

  // Plan v4 Phase G — `mcp_completely_unavailable`. The analyzer ran tools
  // (nonGraphCount > 0) but never produced a single graph hit AND the
  // analyzer was supposed to use the graph (we have a per-tool cap entry
  // for it — i.e. the framework expected at least some graph use).
  //
  // Heuristic: an agent that legitimately decided "this question doesn't
  // need the graph" produces nonGraphCount === 0 too (it just doesn't
  // call any tools). Conversely, an agent that ran tools but never hit
  // MCP either had MCP completely fail or ignored the catalog entirely.
  // Either case is operator-actionable: re-run with verbose MCP logs.
  //
  // Stack-agnostic — pure number comparison. The heuristic does not
  // assume any particular project shape; it triggers when the agent
  // demonstrably had work to do AND skipped MCP for all of it.
  if (graphCount === 0 && nonGraphCount > 0 && perToolCaps) {
    warnings.add('mcp_completely_unavailable');
  }

  return Array.from(warnings).sort();
}

/**
 * Loader contract for the graph-tool-uses sidecar. Each provider produces
 * the same `GraphToolUsesSidecar` shape from a different source:
 *
 *   - Claude CLI: written by `validate-analyzer-json.hook.ts` (Stop hook)
 *     to `~/.claude/projects/<slug>/<sessionId>.graph-tool-uses.json`.
 *   - Codex CLI: written by `codex-cli-agent-impl.ts` post-run extractor
 *     (plan §C, commit A) to
 *     `<projectPath>/.codex-temp/initialize-project/graph-tool-uses/<sessionId>.json`.
 *     Codex has no Stop hook (per OpenAI's hook docs only `PreToolUse`
 *     is supported), so the framework parses the rollout JSONL itself
 *     after `runCodex` returns.
 *
 * Returns `null` when the sidecar is missing or unreadable. The caller
 * treats that as "force empty graph telemetry" — the same behaviour the
 * Claude path has had since day one.
 */
export interface SidecarLoader {
  /**
   * Resolve the absolute path the sidecar would live at. Used for
   * diagnostic logging only — the loader still returns null if the
   * file is absent.
   */
  expectedPath(projectPath: string, sessionId: string): string;
  load(projectPath: string, sessionId: string): GraphToolUsesSidecar | null;
}

function readSidecarFile(absPath: string): GraphToolUsesSidecar | null {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, 'utf-8')) as GraphToolUsesSidecar;
  } catch (err) {
    logger.warn(
      `[graph_queries_used] Failed to read sidecar ${absPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Default Claude-CLI loader: reads the sidecar written by the Stop hook
 * at `~/.claude/projects/<slug>/<sessionId>.graph-tool-uses.json`.
 */
export const loadClaudeSidecar: SidecarLoader = {
  expectedPath(projectPath, sessionId) {
    const slug = claudeProjectSlug(path.resolve(projectPath));
    return path.join(
      os.homedir(),
      '.claude',
      'projects',
      slug,
      `${sessionId}.graph-tool-uses.json`,
    );
  },
  load(projectPath, sessionId) {
    return readSidecarFile(this.expectedPath(projectPath, sessionId));
  },
};

/**
 * Sidecar dir written by `codex-cli-agent-impl.ts` after each Codex
 * analyzer attempt. Lives under the project's `.codex-temp` so it is
 * framework-owned and discoverable by session id without touching
 * `~/.codex/sessions/`. Plan §C, commit A (2026-05-05).
 */
export function codexSidecarDir(projectPath: string): string {
  return path.join(
    path.resolve(projectPath),
    '.codex-temp',
    'initialize-project',
    'graph-tool-uses',
  );
}

/**
 * Codex-CLI loader: reads the sidecar written in-process by
 * `codex-cli-agent-impl.ts` after the rollout JSONL is captured. Same
 * `GraphToolUsesSidecar` shape as the Claude path.
 */
export const loadCodexSidecar: SidecarLoader = {
  expectedPath(projectPath, sessionId) {
    return path.join(codexSidecarDir(projectPath), `${sessionId}.graph-tool-uses.json`);
  },
  load(projectPath, sessionId) {
    return readSidecarFile(this.expectedPath(projectPath, sessionId));
  },
};

/**
 * Resolve the appropriate sidecar loader for the active provider.
 * Phase 1 analyzer nodes call this once per attempt and pass the result
 * into `applyGraphToolUsageFromSidecar`. Centralised here so the
 * provider→loader mapping has a single owner.
 */
export function getSidecarLoaderForProvider(provider: 'claude' | 'codex'): SidecarLoader {
  return provider === 'codex' ? loadCodexSidecar : loadClaudeSidecar;
}

/**
 * Replace `data.graph_queries_used` with the canonical sorted list of
 * `mcp__code_graph__*_tool` names taken from the per-provider sidecar.
 *
 * The agent is no longer the source of truth for this field — it has been
 * lying about it (writing free-form prose like
 * `"list_communities({ detail_level: 'standard' }) — exceeded token limit"`
 * which then leaks into wiki frontmatter). The provider-specific path
 * reads the same transcript bytes the agent emitted and records the
 * canonical names; this helper plugs that record into the persisted
 * analyzer JSON.
 *
 * Failure modes (all force the same empty-telemetry shape):
 *   - `sessionId` is undefined → the agent never produced a session (e.g.
 *     DeepAgents API mode where no transcript exists).
 *   - sidecar file missing → log warn at the loader, return null.
 *   - sidecar malformed → log warn at the loader, return null.
 *
 * The Claude Stop hook BLOCKS on the harder failure mode (agent claims
 * graph use with zero tool_use events). This helper handles the softer
 * case: the agent legitimately ran, the hook / Codex extractor recorded
 * honestly, and we just need to swap the agent's free-form value for
 * the canonical list.
 *
 * @param loader Sidecar loader implementation. Defaults to
 *   `loadClaudeSidecar` for back-compat with existing call sites; the
 *   Phase 1 analyzer nodes pass the provider-appropriate loader
 *   (Claude/DeepAgents → `loadClaudeSidecar`, Codex → `loadCodexSidecar`).
 */
export function applyGraphToolUsageFromSidecar(
  data: unknown,
  projectPath: string,
  sessionId: string | undefined,
  agentName?: string,
  loader: SidecarLoader = loadClaudeSidecar,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof data === 'object' && data !== null ? { ...(data as Record<string, unknown>) } : {};

  const emptyTelemetry = {
    graph_queries_used: [] as string[],
    graph_overflow_count: 0,
    graph_overflow_tools: [] as string[],
    soft_warning: [] as string[],
  };

  if (!sessionId) {
    logger.warn(
      '[graph_queries_used] No sessionId for analyzer attempt — forcing graph_queries_used=[]',
    );
    return { ...base, ...emptyTelemetry };
  }

  const parsed = loader.load(projectPath, sessionId);
  if (!parsed) {
    logger.warn(
      `[graph_queries_used] Sidecar missing for session ${sessionId} — forcing graph_queries_used=[] (expected at ${loader.expectedPath(projectPath, sessionId)})`,
    );
    return { ...base, ...emptyTelemetry };
  }

  const names = Array.isArray(parsed.uniqueNames)
    ? parsed.uniqueNames.filter((n): n is string => typeof n === 'string' && n.length > 0)
    : [];

  const overflows = Array.isArray(parsed.overflows) ? parsed.overflows : [];
  const overflowTools = [
    ...new Set(
      overflows
        .map((o) => (typeof o.tool === 'string' ? o.tool : ''))
        .filter((t): t is string => t.length > 0),
    ),
  ].sort();

  // Soft warnings (non-blocking telemetry) — derived from sidecar data
  // when present. When the sidecar predates the gira-init-run audit
  // Phase E (no nameCounts / nonGraphCount), softWarning is empty.
  const nameCounts = (parsed.nameCounts ?? {}) as Record<string, number>;
  const nonGraphCount = typeof parsed.nonGraphCount === 'number' ? parsed.nonGraphCount : 0;
  const softWarnings =
    agentName && (parsed.nameCounts !== undefined || parsed.nonGraphCount !== undefined)
      ? computeSoftWarnings(agentName, parsed.count ?? 0, nonGraphCount, nameCounts, overflows)
      : [];

  // Plan §C 4.3 (gira-exhaustive followup, 2026-05-05): scan the
  // analyzer's needs_verification array for speculative items the
  // verification-format guidelines explicitly exclude (credentials,
  // outside-the-repo concerns, manifest-derivable questions). Surface
  // a `speculative_needs_verification` warning so trends are visible
  // in the run report — non-blocking by design.
  const needsVerification = (base as Record<string, unknown>).needs_verification;
  if (hasSpeculativeNeedsVerification(needsVerification)) {
    softWarnings.push('speculative_needs_verification');
  }

  // Plan 14 (2026-05-05): structural quality gates. At commit 1 these
  // surface as SOFT warnings only — the Stop hook promotes them to
  // hard rejections in commit 2 once the schema breaking change has
  // landed across all four analyzers. Each violation maps to its own
  // soft-warning code so the run report can show category breakdown.
  const proseViolations = validateNeedsVerificationProse(needsVerification);
  for (const v of proseViolations) {
    softWarnings.push(v.code);
  }

  // Plan 14 §C.4 (2026-05-05): manifest-vs-import cross-check. Fires
  // when an item references a manifest-declared dependency but the
  // agent never searched for actual import sites — answer is
  // "declared but not imported", which is a finding, not a question.
  // Soft warning so the operator sees the trend; analyzer Stop hook
  // does NOT hard-reject here (the agent might have done the search
  // and just neglected to note it; punishing on retry feels harsh).
  if (hasAnyManifestVsImportMismatch(needsVerification)) {
    softWarnings.push('manifest_declared_but_no_import_search');
  }

  return {
    ...base,
    graph_queries_used: [...names].sort(),
    graph_overflow_count: overflows.length,
    graph_overflow_tools: overflowTools,
    soft_warning: [...new Set(softWarnings)].sort(),
  };
}
