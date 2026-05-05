/**
 * Codex parity for the gira-followup work — plan §C (commit A, 2026-05-05).
 *
 * Claude CLI sessions get a graph-tool-uses sidecar written by the Stop
 * hook (`validate-analyzer-json.hook.ts`). Codex CLI has no Stop hook
 * equivalent (per OpenAI's hook docs only `PreToolUse` is supported), so
 * the framework needs to do the same extraction in-process after the
 * Codex run completes.
 *
 * This module is the pure, testable extractor that walks a Codex rollout
 * JSONL stream and returns the same `GraphToolUsesSidecar` shape the
 * Claude path produces. Same downstream consumers, same telemetry, same
 * soft-warning vocabulary — the only difference is where the bytes
 * originated.
 *
 * Stack-agnostic by construction: works on any Codex rollout regardless
 * of which graph tools were called or which language the project is
 * written in.
 */
import type { GraphToolUsesSidecar } from './graph-tool-usage.js';

/**
 * Sentinel string the graph MCP server emits when a tool result exceeds
 * the per-call token cap. Matches the same regex the Claude Stop hook
 * uses (`validate-analyzer-json.hook.ts::SPILLOVER_SENTINEL`). Kept
 * separate (not imported) to avoid coupling the Codex extractor to the
 * Claude-specific hook module.
 */
const SPILLOVER_SENTINEL =
  /Error: result \(\d[\d,]* characters\) exceeds maximum allowed tokens\. Output has been saved to /;

/** Prefix that identifies graph MCP tool calls — matches Claude's hook. */
const CODE_GRAPH_TOOL_PREFIX = 'mcp__code_graph__';

interface CodexRolloutLine {
  type?: string;
  item?: {
    type?: string;
    name?: string;
    tool_name?: string;
    call_id?: string;
    function_call_id?: string;
    id?: string;
    output?: unknown;
    result?: unknown;
    is_error?: boolean;
  };
  msg?: { type?: string };
  payload?: { id?: string };
}

/**
 * Walk a Codex rollout JSONL and return the graph-tool-uses summary.
 *
 * The Codex rollout protocol distinguishes:
 *   - `response_item.item.type === 'function_call'` → equivalent of
 *     Claude's `assistant.tool_use` block. Carries the tool name in
 *     `name` (or `tool_name` on older releases) and a `call_id`.
 *   - `response_item.item.type === 'function_call_output'` →
 *     equivalent of Claude's `user.tool_result` block. Carries the
 *     result text in `output` (or `result`) and references the
 *     originating call via `call_id` / `function_call_id`.
 *
 * Both shapes are tolerated. Malformed lines are silently skipped —
 * better to under-count than crash the analyzer node on a parser
 * regression.
 */
export function extractGraphToolUsesFromCodexJsonl(jsonl: string): GraphToolUsesSidecar {
  const uses = new Map<string, number>();
  let nonGraphCount = 0;
  const useByCallId = new Map<string, { tool: string; callIndex: number }>();
  let callIndex = 0;
  const overflows: NonNullable<GraphToolUsesSidecar['overflows']> = [];

  for (const rawLine of jsonl.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    let entry: CodexRolloutLine;
    try {
      entry = JSON.parse(trimmed) as CodexRolloutLine;
    } catch {
      continue;
    }

    const item = entry.item;
    if (!item || typeof item !== 'object') continue;
    const itemType = item.type;

    if (itemType === 'function_call') {
      const name = item.name ?? item.tool_name ?? '';
      if (typeof name !== 'string' || !name) continue;
      if (name.startsWith(CODE_GRAPH_TOOL_PREFIX)) {
        uses.set(name, (uses.get(name) ?? 0) + 1);
        callIndex += 1;
        const callId = item.call_id ?? item.id;
        if (typeof callId === 'string' && callId.length > 0) {
          useByCallId.set(callId, { tool: name, callIndex });
        }
      } else {
        // Read / Glob / Grep / Bash / apply_patch / etc. — counted to
        // drive the `low_graph_ratio` soft warning downstream.
        nonGraphCount += 1;
      }
      continue;
    }

    if (itemType === 'function_call_output') {
      const callId = item.call_id ?? item.function_call_id;
      if (typeof callId !== 'string' || !callId) continue;
      const matched = useByCallId.get(callId);
      if (!matched) continue;
      const text = stringifyResultContent(item.output ?? item.result);
      if (text && SPILLOVER_SENTINEL.test(text)) {
        overflows.push(matched);
      }
      continue;
    }
  }

  const nameCounts: Record<string, number> = {};
  for (const [name, n] of uses.entries()) nameCounts[name] = n;
  const total = Array.from(uses.values()).reduce((sum, n) => sum + n, 0);

  return {
    count: total,
    uniqueNames: Array.from(uses.keys()).sort(),
    nameCounts,
    nonGraphCount,
    overflows,
  };
}

/**
 * Codex rollout output values can be:
 *   - a plain string
 *   - an object `{ type: 'output_text' | 'text', text: '...' }`
 *   - an array of the above
 *   - some other JSON shape (rare; we stringify defensively)
 *
 * Returns a single concatenated text payload suitable for sentinel
 * matching. Returns the empty string when nothing is recoverable.
 */
function stringifyResultContent(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map((part) => stringifyResultContent(part)).join('\n');
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.output === 'string') return obj.output;
    if (typeof obj.result === 'string') return obj.result;
    try {
      return JSON.stringify(raw);
    } catch {
      return '';
    }
  }
  return String(raw);
}
