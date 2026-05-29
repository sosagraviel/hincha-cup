#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Validate Analyzer JSON Output
 *
 * This hook validates Phase 1 analyzer agent output against Zod schema.
 * If validation fails, it blocks Claude from finishing and provides feedback
 * for the agent to retry internally.
 *
 * Works ONLY in Claude CLI mode. DeepAgents mode uses TypeScript validation.
 */

import fs from 'fs';
import path from 'path';
import { validateAgentOutput } from '../../../../../schemas/phase1-agent-outputs.schema.js';
import { extractJSON } from '../../../../../utils/validator.js';
import { validateNeedsVerificationProse } from '../needs-verification-quality.js';
import {
  detectAutomationDiscoveryViolations,
  formatAutomationDiscoveryViolations,
} from '../../structure-analyzer/hooks/validate-automation-discovery.js';
import {
  detectPortDiscoveryViolations,
  formatPortDiscoveryViolations,
} from '../../structure-analyzer/hooks/validate-port-discovery.js';
import {
  detectServiceCompletenessViolations,
  formatServiceCompletenessViolations,
} from '../../structure-analyzer/hooks/validate-service-completeness.js';
import { getExcludedDirectories } from '../../../../../utils/shared/prompt-loader.js';
import {
  detectInfrastructurePortViolations,
  formatInfrastructurePortViolations,
} from '../../data-flows-analyzer/hooks/validate-infrastructure-port-discovery.js';
import {
  detectMissingJudgmentFields,
  formatJudgmentFieldViolations,
  loadServiceTypeMap,
} from './validate-judgment-fields.js';
import {
  formatValidationError,
  NEEDS_VERIFICATION_SUBCODE_TO_KEY,
} from '../../../shared/validation-codes/index.js';
import { recordRejection, shouldAutoDowngrade } from '../rejection-counter.js';

/**
 * Names of the three downstream Phase 1 analyzers — those that consume the
 * structure-analyzer's authoritative services[] and must emit a service-ID
 * surface compatible with it. The hook cross-checks their output against
 * `<tempDir>/phase1-outputs/01-structure-architecture.json`.
 */
const DOWNSTREAM_ANALYZERS = new Set([
  'tech-stack-dependencies-analyzer',
  'code-patterns-testing-analyzer',
  'data-flows-integrations-analyzer',
]);

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

const CODE_GRAPH_TOOL_PREFIX = 'mcp__code_graph__';

/**
 * MCP server sentinel emitted when a tool result exceeds the per-call token
 * cap. Treated as a calling error so overflows are surfaced rather than
 * regressing silently.
 */
const SPILLOVER_SENTINEL =
  /Error: result \(\d[\d,]* characters\) exceeds maximum allowed tokens\. Output has been saved to /;

interface GraphToolUseRecord {
  /** Total mcp__code_graph__* tool_use events across the transcript. */
  count: number;
  /** Sorted unique canonical tool names actually called. */
  uniqueNames: string[];
  /** Per-tool call counts (key = full `mcp__code_graph__<name>` string). */
  nameCounts: Record<string, number>;
  /** Total non-graph tool_use events. Drives the `low_graph_ratio` soft warning. */
  nonGraphCount: number;
  /** One entry per overflowing tool result (sentinel match). */
  overflows: Array<{ tool: string; callIndex: number }>;
  /** Unique Glob pattern args (verbatim). */
  globPatterns: string[];
}

/**
 * Count code-graph MCP tool_use events across all assistant messages in a
 * transcript. Returns the unique tool names called and the total event count.
 * Deterministic ground truth for `graph_queries_used` — the agent cannot
 * fabricate it because we read the same transcript Claude CLI wrote.
 */
function countGraphToolUses(transcript: unknown[]): GraphToolUseRecord {
  const uses = new Map<string, number>();
  let nonGraphCount = 0;
  const useByCallId = new Map<string, { tool: string; callIndex: number }>();
  let callIndex = 0;
  const overflows: GraphToolUseRecord['overflows'] = [];
  const globPatterns = new Set<string>();

  for (const msg of transcript) {
    if (!isObject(msg)) continue;
    const wrapped = isObject(msg.message) ? msg.message : msg;
    const content = wrapped.content;
    if (!Array.isArray(content)) continue;

    if (wrapped.role === 'assistant') {
      for (const block of content) {
        if (!isObject(block) || block.type !== 'tool_use') continue;
        const name = typeof block.name === 'string' ? block.name : '';
        if (!name) continue;
        if (name.startsWith(CODE_GRAPH_TOOL_PREFIX)) {
          uses.set(name, (uses.get(name) ?? 0) + 1);
          callIndex += 1;
          if (typeof block.id === 'string' && block.id.length > 0) {
            useByCallId.set(block.id, { tool: name, callIndex });
          }
        } else {
          nonGraphCount += 1;
          if (name === 'Glob' && isObject(block.input)) {
            const pattern = (block.input as Record<string, unknown>).pattern;
            if (typeof pattern === 'string' && pattern.length > 0) {
              globPatterns.add(pattern);
            }
          }
        }
      }
    }

    if (wrapped.role === 'user') {
      for (const block of content) {
        if (!isObject(block) || block.type !== 'tool_result') continue;
        const useId = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
        const matched = useId ? useByCallId.get(useId) : undefined;
        if (!matched) continue;
        const raw = block.content;
        const text = Array.isArray(raw)
          ? raw
              .filter((c): c is { type: string; text: string } => isObject(c) && 'text' in c)
              .map((c) => String(c.text))
              .join('\n')
          : typeof raw === 'string'
            ? raw
            : '';
        if (SPILLOVER_SENTINEL.test(text)) {
          overflows.push(matched);
        }
      }
    }
  }

  const total = Array.from(uses.values()).reduce((sum, n) => sum + n, 0);
  const nameCounts: Record<string, number> = {};
  for (const [name, n] of uses.entries()) nameCounts[name] = n;
  return {
    count: total,
    uniqueNames: Array.from(uses.keys()).sort(),
    nameCounts,
    nonGraphCount,
    overflows,
    globPatterns: Array.from(globPatterns).sort(),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Loads the authoritative service IDs the structure-analyzer
 * persisted at `<tempDir>/phase1-outputs/01-structure-architecture.json`.
 * The downstream analyzers (tech-stack / code-patterns / data-flows)
 * MUST stay within this set — any service-shaped key referencing an ID
 * that isn't in the authoritative set is a regression.
 *
 * Returns an empty `Set` when the file is missing or malformed (e.g. a
 * single-analyzer replay where structure wasn't run). The caller
 * treats an empty set as "no consistency check possible — skip".
 *
 * Stack-agnostic: only consumes service `id` strings; no language or
 * framework assumptions.
 */
function loadAuthoritativeServiceIds(cwd: string | undefined): Set<string> {
  const tempCandidates = candidateTempDirs(cwd);
  for (const tempDir of tempCandidates) {
    const outputPath = path.join(tempDir, 'phase1-outputs', '01-structure-architecture.json');
    if (!fs.existsSync(outputPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as unknown;
      if (!isObject(parsed)) continue;
      const findings = (parsed as Record<string, unknown>).findings;
      if (!isObject(findings)) continue;
      const services = (findings as Record<string, unknown>).services;
      if (!Array.isArray(services)) continue;
      const ids = new Set<string>();
      for (const s of services) {
        if (isObject(s) && typeof s.id === 'string' && s.id.trim()) {
          ids.add(s.id.trim());
        }
      }
      if (ids.size > 0) return ids;
    } catch {
      continue;
    }
  }
  return new Set();
}

/**
 * Resolves the candidate `<tempDir>` directories where Phase 1 outputs may
 * live. Mirrors the resolveTempPath() lookup order without the runtime
 * dependency: `.claude-temp/initialize-project/` (Claude provider) and
 * `.codex-temp/initialize-project/` (Codex). Returns absolute paths.
 */
function candidateTempDirs(cwd: string | undefined): string[] {
  const root = cwd && cwd.length > 0 ? cwd : process.cwd();
  return [
    path.join(root, '.claude-temp', 'initialize-project'),
    path.join(root, '.codex-temp', 'initialize-project'),
  ];
}

/**
 * Return the first candidate `<tempDir>` that already exists on disk. Falls
 * back to the first candidate (Claude default) when neither exists so the
 * caller can still derive a path for fresh runs.
 */
function resolveActiveTempDir(cwd: string | undefined): string {
  const candidates = candidateTempDirs(cwd);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

/**
 * Walk every leaf string value in a parsed analyzer output looking
 * for service IDs that don't appear in the authoritative set.
 * Returns an array of `{id, location}` records describing every
 * offending appearance so the feedback message can list them
 * precisely.
 */
function findUnknownServiceIds(
  data: unknown,
  authoritative: Set<string>,
): Array<{ id: string; location: string }> {
  if (!isObject(data) || authoritative.size === 0) return [];
  const findings = (data as Record<string, unknown>).findings;
  if (!isObject(findings)) return [];

  const offenders: Array<{ id: string; location: string }> = [];

  for (const [parentKey, parentValue] of Object.entries(findings)) {
    if (!isObject(parentValue)) continue;
    if (parentKey === 'dependencies') {
      const inner = (parentValue as Record<string, unknown>).by_service;
      if (isObject(inner)) {
        for (const id of Object.keys(inner)) {
          if (!authoritative.has(id)) {
            offenders.push({ id, location: `findings.dependencies.by_service.${id}` });
          }
        }
      }
      continue;
    }
    for (const candidateId of Object.keys(parentValue)) {
      if (candidateId.length < 2) continue;
      if (/\s/.test(candidateId)) continue;
      if (
        ['source', 'conflicts', 'by_task', 'main', 'orm', 'package_manager'].includes(candidateId)
      ) {
        continue;
      }
      if (
        /^[a-z][a-z0-9_-]+$/i.test(candidateId) &&
        !authoritative.has(candidateId) &&
        !STRUCTURAL_KEY_ALLOWLIST.has(`${parentKey}.${candidateId}`)
      ) {
        if (isObject((parentValue as Record<string, unknown>)[candidateId])) {
          if (BY_SERVICE_PARENT_KEYS.has(parentKey)) {
            offenders.push({
              id: candidateId,
              location: `findings.${parentKey}.${candidateId}`,
            });
          }
        }
      }
    }
  }

  return offenders;
}

/**
 * Conservative allowlist of parent keys whose immediate subkeys are
 * conventionally service IDs. Unknown IDs are only flagged inside these
 * parents — every other shape is left alone so non-service-id-keyed
 * structures don't trigger false positives. `environment` is intentionally
 * excluded: its subkeys (`required_vars`, `template_files`, `environments`,
 * `config_approach`) are config metadata, not service IDs.
 */
const BY_SERVICE_PARENT_KEYS = new Set<string>([
  'testing',
  'api_patterns',
  'service_communication',
  'naming_conventions',
  'error_handling',
  'async_patterns',
]);

/**
 * Subkeys to ignore even when they appear inside a by-service parent —
 * container metadata rather than service IDs.
 */
const STRUCTURAL_KEY_ALLOWLIST = new Set<string>([
  'testing.unit',
  'testing.integration',
  'testing.e2e',
  'service_communication.protocols',
]);

/**
 * Write the deterministic graph-tool-use record next to the transcript so the
 * orchestration node can merge it into the persisted analyzer output. The
 * orchestration node is the single writer of the agent's `output.json` file —
 * the hook only emits a sidecar; the node does the rewrite.
 */
function writeGraphToolUseSidecar(transcriptPath: string, data: GraphToolUseRecord): void {
  try {
    const sidecarPath = transcriptPath.replace(/\.jsonl$/, '') + '.graph-tool-uses.json';
    fs.writeFileSync(sidecarPath, JSON.stringify(data, null, 2));
  } catch {
    return;
  }
}

/**
 * Block Claude from finishing and provide retry feedback on stderr.
 * Exit code 2 is the Claude CLI signal for "block" (exit 1 is just an error).
 */
function blockWithFeedback(reason: string): void {
  console.error(reason);
  process.exit(2);
}

/**
 * Walk `data` along `path` and return a truncated preview of the offending
 * value (≤80 chars). Returns `null` when the path cannot be navigated — the
 * caller then omits the "current value:" suffix from the error message.
 *
 * Used to enrich Zod-derived E008 feedback so the model sees exactly what it
 * emitted at the rejected path, not just the abstract issue description.
 */
function formatOffendingValueAtPath(
  data: unknown,
  path: ReadonlyArray<PropertyKey>,
): string | null {
  let cur: unknown = data;
  for (const seg of path) {
    if (cur === null || cur === undefined) return null;
    if (Array.isArray(cur)) {
      const idx = typeof seg === 'number' ? seg : Number.parseInt(String(seg), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= cur.length) return null;
      cur = cur[idx];
      continue;
    }
    if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[String(seg)];
      continue;
    }
    return null;
  }
  if (cur === undefined) return null;
  const rendered = typeof cur === 'string' ? cur : JSON.stringify(cur);
  if (!rendered) return null;
  const safe = rendered.replace(/\s+/g, ' ');
  return safe.length > 80 ? `«${safe.slice(0, 77)}...»` : `«${safe}»`;
}

/**
 * Codes that are auto-downgraded to a soft warning after two consecutive
 * rejections of the same code on the same agent session. They cover
 * content-quality gates (needs_verification prose, judgment-field
 * groundedness) that are non-blocking from a workflow-correctness
 * perspective — if the model can't fix them in two tries, additional
 * regeneration just burns output tokens.
 *
 * Schema correctness (E001–E008), graph-fabrication (E007), and
 * hook-system errors (E014/E015) stay HARD blocks.
 */
const SOFT_GATE_CODES = new Set<string>([
  'E060_missing_attempted_resolution',
  'E061_invalid_attempted_resolution_entry',
  'E062_graph_internals_in_user_prose',
  'E063_fabricated_numbers_in_question',
  'E064_missing_or_generic_impact',
  'E065_found_no_evidence_yesno',
  'E066_confessed_incomplete_search',
  'E067_speculative_out_of_scope',
  'E068_missing_judgment_field_for_service',
]);

/**
 * Decide whether to block (hard reject) or attach the violation to
 * `data.soft_warning[]` and allow the session to finish. The decision is
 * keyed by `(agentName, code)`:
 *
 *   - If `code` is not in `SOFT_GATE_CODES` → always block.
 *   - If consecutive-rejection counter for `(agentName, code)` < threshold
 *     → increment, block.
 *   - Otherwise → attach to `data.soft_warning[]`, return `'soft'`.
 *
 * Returns `'hard'` when the caller should block, `'soft'` when the caller
 * should continue down the validation pipeline. When `'soft'`, the function
 * has already mutated `data` to record the warning.
 */
function classifyRejection(
  code: string,
  message: string,
  data: unknown,
  tempDir: string,
  agentName: string,
): 'hard' | 'soft' {
  if (!SOFT_GATE_CODES.has(code)) {
    return 'hard';
  }
  if (!agentName || !tempDir) {
    return 'hard';
  }
  if (shouldAutoDowngrade(tempDir, agentName, code)) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const rec = data as Record<string, unknown>;
      const existing = Array.isArray(rec.soft_warning) ? [...(rec.soft_warning as unknown[])] : [];
      existing.push(`${code}: ${message.replace(/\s+/g, ' ').trim().slice(0, 240)}`);
      rec.soft_warning = existing.filter((w): w is string => typeof w === 'string');
    }
    return 'soft';
  }
  recordRejection(tempDir, agentName, code);
  return 'hard';
}

/**
 * Allow Claude to finish.
 */
function allow(): void {
  process.exit(0);
}

/**
 * Read stdin via async iterator. Avoids EAGAIN on non-blocking pipes that
 * `fs.readFileSync(0)` runs into.
 */
async function readStdinAsync(): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return chunks.join('');
}

async function main() {
  try {
    const stdinBuffer = await readStdinAsync();
    const input: HookInput = JSON.parse(stdinBuffer);

    if (!input.transcript_path) {
      return blockWithFeedback(formatValidationError('E015_hook_transcript_missing', {}));
    }

    if (!fs.existsSync(input.transcript_path)) {
      return blockWithFeedback(
        formatValidationError('E015_hook_transcript_missing', { path: input.transcript_path }),
      );
    }

    const transcriptContent = fs.readFileSync(input.transcript_path, 'utf-8');
    const lines = transcriptContent.split('\n').filter((line: string) => line.trim());

    const transcript = lines
      .map((line: string) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    const assistantMessages = transcript
      .filter((msg: any) => {
        return msg.type === 'assistant' || (msg.message && msg.message.role === 'assistant');
      })
      .reverse();

    if (assistantMessages.length === 0) {
      return blockWithFeedback(formatValidationError('E001_no_assistant_message'));
    }

    const lastMessage = assistantMessages[0];

    const messageContent = lastMessage.message ? lastMessage.message.content : lastMessage.content;

    if (!messageContent || !Array.isArray(messageContent)) {
      return blockWithFeedback(formatValidationError('E002_invalid_content_structure'));
    }

    const textBlocks = messageContent.filter((c: any) => c.type === 'text');

    if (textBlocks.length === 0) {
      return blockWithFeedback(formatValidationError('E003_no_text_in_response'));
    }

    const text = textBlocks
      .map((t: any) => t.text)
      .join('\n')
      .trim();

    if (!text) {
      return blockWithFeedback(formatValidationError('E004_empty_output'));
    }

    const jsonString = extractJSON(text);

    if (!jsonString) {
      return blockWithFeedback(formatValidationError('E005_no_json_object'));
    }

    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
      return blockWithFeedback(
        formatValidationError('E006_json_parse_failed', { error: errorMsg }),
      );
    }

    const tempDir = resolveActiveTempDir(input.cwd);

    const graphUses = countGraphToolUses(transcript);
    writeGraphToolUseSidecar(input.transcript_path!, graphUses);

    const claimed =
      isObject(data) && Array.isArray((data as Record<string, unknown>).graph_queries_used)
        ? ((data as Record<string, unknown>).graph_queries_used as unknown[]).length
        : 0;
    if (claimed > 0 && graphUses.count === 0) {
      return blockWithFeedback(
        formatValidationError('E007_graph_use_fabricated', { claimed: String(claimed) }),
      );
    }

    const result = validateAgentOutput(data);

    if (!result.success) {
      const errors = result.errors
        ? result.errors.issues
            .map((err) => {
              const pathStr = err.path.length > 0 ? err.path.join('.') : 'root';
              if (err.code === 'too_big' && pathStr === 'needs_verification') {
                const actual = (err as any).actual ?? '?';
                const max = (err as any).maximum ?? 3;
                return `${pathStr}=${actual} (max ${max})`;
              }
              const offending = formatOffendingValueAtPath(data, err.path);
              return offending
                ? `${pathStr}: ${err.message} | current value: ${offending}`
                : `${pathStr}: ${err.message}`;
            })
            .join('; ')
        : 'unknown';

      return blockWithFeedback(
        formatValidationError('E008_schema_validation_failed', {
          agent: result.agentName ?? '',
          errors,
        }),
      );
    }

    const agentName =
      isObject(data) && typeof (data as Record<string, unknown>).agent_name === 'string'
        ? ((data as Record<string, unknown>).agent_name as string)
        : '';

    if (isObject(data) && Array.isArray((data as Record<string, unknown>).needs_verification)) {
      const proseViolations = validateNeedsVerificationProse(
        (data as Record<string, unknown>).needs_verification,
      );
      if (proseViolations.length > 0) {
        const lines = proseViolations.map((v) => {
          const key = NEEDS_VERIFICATION_SUBCODE_TO_KEY[v.code];
          return formatValidationError(key, v.args ?? { index: String(v.index) });
        });
        const message = lines.join('\n');
        const firstCode = NEEDS_VERIFICATION_SUBCODE_TO_KEY[proseViolations[0].code];
        const decision = classifyRejection(firstCode, message, data, tempDir, agentName);
        if (decision === 'hard') {
          return blockWithFeedback(message);
        }
      }
    }

    if (agentName === 'structure-architecture-analyzer') {
      const automationViolations = detectAutomationDiscoveryViolations(data, input.cwd);
      if (automationViolations.length > 0) {
        return blockWithFeedback(
          formatAutomationDiscoveryViolations(automationViolations).join('\n'),
        );
      }

      const portViolations = detectPortDiscoveryViolations(data);
      if (portViolations.length > 0) {
        return blockWithFeedback(formatPortDiscoveryViolations(portViolations).join('\n'));
      }

      const excludedDirs = input.cwd ? getExcludedDirectories(input.cwd) : [];
      const completenessViolations = detectServiceCompletenessViolations(
        data,
        input.cwd,
        excludedDirs,
      );
      if (completenessViolations.length > 0) {
        return blockWithFeedback(
          formatServiceCompletenessViolations(completenessViolations).join('\n'),
        );
      }
    }

    if (agentName === 'data-flows-integrations-analyzer') {
      const infraPortViolations = detectInfrastructurePortViolations(data);
      if (infraPortViolations.length > 0) {
        return blockWithFeedback(
          formatInfrastructurePortViolations(infraPortViolations).join('\n'),
        );
      }
    }

    if (DOWNSTREAM_ANALYZERS.has(agentName)) {
      const authoritative = loadAuthoritativeServiceIds(input.cwd);
      if (authoritative.size > 0) {
        const offenders = findUnknownServiceIds(data, authoritative);
        if (offenders.length > 0) {
          /*
           * Phase 1 now runs all four analyzers in parallel; the structure
           * analyzer's authoritative IDs may finish AFTER a downstream
           * analyzer's stop hook fires. Rather than block the run on a race
           * the framework intentionally tolerates, we surface the drift as
           * a soft warning recorded inside the output. Phase 2 consolidation
           * runs the hard reconciliation via `applyServiceIdRewritesToFindings`
           * once every Phase 1 output is on disk.
           */
          const driftSummary = offenders.map((o) => o.id).join(',');
          const dataObj = data as Record<string, unknown>;
          const warnings = Array.isArray(dataObj.soft_warning)
            ? [...(dataObj.soft_warning as unknown[])]
            : [];
          warnings.push(`service_id_drift:${driftSummary}`);
          dataObj.soft_warning = warnings.filter((w): w is string => typeof w === 'string');
        }
      }
    }

    if (
      agentName === 'code-patterns-testing-analyzer' ||
      agentName === 'data-flows-integrations-analyzer'
    ) {
      const typeMap = loadServiceTypeMap(input.cwd);
      const missing = detectMissingJudgmentFields(data, typeMap);
      if (missing.length > 0) {
        const message = formatJudgmentFieldViolations(missing).join('\n');
        const decision = classifyRejection(
          'E068_missing_judgment_field_for_service',
          message,
          data,
          tempDir,
          agentName,
        );
        if (decision === 'hard') {
          return blockWithFeedback(message);
        }
      }
    }

    return allow();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return blockWithFeedback(formatValidationError('E014_hook_crashed', { error: errorMsg }));
  }
}

main();
