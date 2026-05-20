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
import { detectBannedGlobs, REDUNDANT_GLOB_WARNING_CODE } from './banned-globs.js';

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
   * One entry per overflowing tool result (sentinel match in the
   * transcript). When the sidecar lacks this field, treat as 0 overflows.
   */
  overflows?: Array<{ tool: string; callIndex: number }>;
  /**
   * Per-tool call counts for graph tools (e.g.
   * `{ "mcp__code_graph__semantic_search_nodes_tool": 16 }`). Drives
   * per-tool budget enforcement.
   */
  nameCounts?: Record<string, number>;
  /**
   * Total non-graph tool_use events (Read/Glob/Grep/Bash/etc.). Drives
   * the `low_graph_ratio` soft warning.
   */
  nonGraphCount?: number;
  /**
   * Unique Glob patterns the agent called (verbatim `pattern` arg).
   * Used by the forbidden-glob detector to emit
   * `tech_stack_inspection_redundant_glob` when the agent re-globs
   * patterns already covered by `project-inspection.json`.
   */
  globPatterns?: string[];
}

/**
 * Per-analyzer thresholds for `low_graph_ratio` (graph-call ratio
 * below which the agent is "grep-spamming over the graph").
 *
 * Stack-agnostic: legitimate non-graph reads scale with manifest count
 * across every language. Tech-stack on a Java multi-module project
 * reads N `pom.xml` files just like a JS project reads N
 * `package.json` files. The thresholds reflect each analyzer's
 * STRUCTURAL workload, not the language.
 *
 * `_default` applies when an analyzer name is not explicitly listed.
 */
export const LOW_GRAPH_RATIO_THRESHOLDS: Record<string, number> = {
  'structure-architecture-analyzer': 0.25,
  'tech-stack-dependencies-analyzer': 0.2,
  'code-patterns-testing-analyzer': 0.3,
  'data-flows-integrations-analyzer': 0.4,
  _default: 0.3,
};

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
  globPatterns: string[] = [],
): string[] {
  const warnings = new Set<string>();
  const total = graphCount + nonGraphCount;

  if (globPatterns.length > 0) {
    const matched = detectBannedGlobs(globPatterns);
    if (matched.length > 0) {
      warnings.add(REDUNDANT_GLOB_WARNING_CODE);
    }
  }

  if (total > 0) {
    const ratio = graphCount / total;
    const threshold =
      LOW_GRAPH_RATIO_THRESHOLDS[agentName] ?? LOW_GRAPH_RATIO_THRESHOLDS._default ?? 0.3;
    if (ratio < threshold) {
      warnings.add('low_graph_ratio');
    }
  }

  if (overflows.length > 0) {
    warnings.add('graph_overflow_detected');
  }

  if (graphCount === 0 && nonGraphCount > 0) {
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
 * Sidecar directory written by `codex-cli-agent-impl.ts` after each
 * Codex analyzer attempt. Lives under the project's `.codex-temp` so
 * it is framework-owned and discoverable by session id without
 * touching `~/.codex/sessions/`.
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

  const nameCounts = (parsed.nameCounts ?? {}) as Record<string, number>;
  const nonGraphCount = typeof parsed.nonGraphCount === 'number' ? parsed.nonGraphCount : 0;
  const globPatterns = Array.isArray(parsed.globPatterns) ? parsed.globPatterns : [];
  const softWarnings =
    agentName && (parsed.nameCounts !== undefined || parsed.nonGraphCount !== undefined)
      ? computeSoftWarnings(
          agentName,
          parsed.count ?? 0,
          nonGraphCount,
          nameCounts,
          overflows,
          globPatterns,
        )
      : [];

  const needsVerification = (base as Record<string, unknown>).needs_verification;
  if (hasSpeculativeNeedsVerification(needsVerification)) {
    softWarnings.push('speculative_needs_verification');
  }

  const proseViolations = validateNeedsVerificationProse(needsVerification);
  for (const v of proseViolations) {
    softWarnings.push(v.code);
  }

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
