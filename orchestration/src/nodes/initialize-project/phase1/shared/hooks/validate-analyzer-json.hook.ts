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
// Import centralized validator from Phase 0 schema registry
import { validateAgentOutput } from '../../../../../schemas/phase1-agent-outputs.schema.js';
import { extractJSON } from '../../../../../utils/validator.js';

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

const CODE_GRAPH_TOOL_PREFIX = 'mcp__code_graph__';

/**
 * Count code-graph MCP tool_use events across all assistant messages in a
 * transcript. Returns the unique tool names called and the total event count.
 *
 * This is the deterministic ground truth for `graph_queries_used` — the agent
 * cannot lie about it because we read the same transcript Claude CLI already
 * wrote. Used in two places below:
 *   1. The hook blocks when the agent claims graph use but the transcript
 *      count is zero (the gira-run failure mode).
 *   2. Even on success, the orchestration node will read this sidecar and
 *      replace whatever the agent put in `graph_queries_used` with the real
 *      list, eliminating the field from agent responsibility entirely.
 */
/**
 * MCP server sentinel emitted when a tool result exceeds the per-call token
 * cap. The full payload is dumped to a sidecar file under `~/.claude/projects/
 * <slug>/<sessionId>/tool-results/...` and the agent receives this message in
 * place of the result. Treated as a calling error: the framework counts
 * overflows so they cannot regress silently.
 */
const SPILLOVER_SENTINEL =
  /Error: result \(\d[\d,]* characters\) exceeds maximum allowed tokens\. Output has been saved to /;

interface GraphToolUseRecord {
  /** Total mcp__code_graph__* tool_use events across the transcript. */
  count: number;
  /** Sorted unique canonical tool names actually called. */
  uniqueNames: string[];
  /** One entry per overflowing tool result (sentinel match). */
  overflows: Array<{ tool: string; callIndex: number }>;
}

function countGraphToolUses(transcript: unknown[]): GraphToolUseRecord {
  const uses = new Map<string, number>();
  // Track tool_use events by their `id` so we can attribute a later
  // overflowing tool_result back to the specific tool that produced it.
  const useByCallId = new Map<string, { tool: string; callIndex: number }>();
  let callIndex = 0;
  const overflows: GraphToolUseRecord['overflows'] = [];

  for (const msg of transcript) {
    if (!isObject(msg)) continue;
    const wrapped = isObject(msg.message) ? msg.message : msg;
    const content = wrapped.content;
    if (!Array.isArray(content)) continue;

    if (wrapped.role === 'assistant') {
      for (const block of content) {
        if (!isObject(block) || block.type !== 'tool_use') continue;
        const name = typeof block.name === 'string' ? block.name : '';
        if (!name.startsWith(CODE_GRAPH_TOOL_PREFIX)) continue;
        uses.set(name, (uses.get(name) ?? 0) + 1);
        callIndex += 1;
        if (typeof block.id === 'string' && block.id.length > 0) {
          useByCallId.set(block.id, { tool: name, callIndex });
        }
      }
    }

    if (wrapped.role === 'user') {
      for (const block of content) {
        if (!isObject(block) || block.type !== 'tool_result') continue;
        const useId = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
        const matched = useId ? useByCallId.get(useId) : undefined;
        if (!matched) continue;
        // Result content can be a string OR an array of `{type:"text", text}`
        // blocks. Normalize.
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
  return { count: total, uniqueNames: Array.from(uses.keys()).sort(), overflows };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Write the deterministic graph-tool-use record next to the transcript so the
 * orchestration node can merge it into the persisted analyzer output. The
 * orchestration node is the single writer of the agent's `output.json` file —
 * the hook only emits a sidecar; the node does the rewrite. This keeps the
 * hook's responsibility narrow (block on lies) and makes deterministic
 * `graph_queries_used` easy to verify in Phase 6 validation.
 */
function writeGraphToolUseSidecar(transcriptPath: string, data: GraphToolUseRecord): void {
  try {
    const sidecarPath = transcriptPath.replace(/\.jsonl$/, '') + '.graph-tool-uses.json';
    fs.writeFileSync(sidecarPath, JSON.stringify(data, null, 2));
  } catch {
    // Best-effort — sidecar failure must not block analyzer completion.
  }
}

/**
 * Block Claude from finishing with feedback
 * Exit code 2 signals blocking to Claude CLI (exit 1 is just an error, not a block!)
 */
function blockWithFeedback(reason: string): void {
  console.error(reason); // Print feedback to stderr for Claude CLI to show
  process.exit(2); // Exit code 2 = BLOCK agent from completing
}

/**
 * Allow Claude to finish
 */
function allow(): void {
  process.exit(0);
}

/**
 * Read stdin using async iterator (production-ready, handles non-blocking pipes)
 * Solves EAGAIN errors that occur with fs.readFileSync(0) on non-blocking stdin
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
    // Read stdin to get hook input metadata (production-ready async method)
    const stdinBuffer = await readStdinAsync();
    const input: HookInput = JSON.parse(stdinBuffer);

    // Require transcript for validation
    if (!input.transcript_path) {
      return blockWithFeedback(
        '❌ HOOK ERROR: No transcript path provided\n\n' +
          'The validation hook requires a transcript to validate output.\n' +
          'This is a framework error, not an agent error.',
      );
    }

    if (!fs.existsSync(input.transcript_path)) {
      return blockWithFeedback(
        '❌ HOOK ERROR: Transcript file not found\n\n' +
          `Expected transcript at: ${input.transcript_path}\n` +
          'This is a framework error, not an agent error.',
      );
    }

    // Read transcript file (JSONL format - one JSON object per line)
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

    // Find last assistant message (supports both direct and wrapped formats)
    const assistantMessages = transcript
      .filter((msg: any) => {
        return msg.type === 'assistant' || (msg.message && msg.message.role === 'assistant');
      })
      .reverse();

    if (assistantMessages.length === 0) {
      return blockWithFeedback(
        '❌ HOOK ERROR: No assistant messages found in transcript\n\n' +
          "The agent hasn't produced any output yet.\n" +
          'This is unexpected - the hook should only run after agent output.',
      );
    }

    const lastMessage = assistantMessages[0];

    // Get content from either direct format or wrapped format
    const messageContent = lastMessage.message ? lastMessage.message.content : lastMessage.content;

    if (!messageContent || !Array.isArray(messageContent)) {
      return blockWithFeedback(
        '❌ HOOK ERROR: Last message has invalid content structure\n\n' +
          'Expected an array of content blocks.\n' +
          'This is a framework error, not an agent error.',
      );
    }

    // Extract text blocks from content
    const textBlocks = messageContent.filter((c: any) => c.type === 'text');

    if (textBlocks.length === 0) {
      return blockWithFeedback(
        '❌ OUTPUT ERROR: No text content in response\n\n' +
          "Your response doesn't contain any text output.\n" +
          'You must output JSON in the required format.',
      );
    }

    const text = textBlocks
      .map((t: any) => t.text)
      .join('\n')
      .trim();

    if (!text) {
      return blockWithFeedback(
        '❌ OUTPUT ERROR: No output received\n\n' +
          'Your response is empty.\n' +
          'You must output JSON in the required format.',
      );
    }

    // Extract JSON from the output (handles markdown code blocks, explanatory text, etc.)
    const jsonString = extractJSON(text);

    if (!jsonString) {
      return blockWithFeedback(
        '❌ No JSON object found in your response.\n\n' +
          'REQUIRED FORMAT:\n' +
          '  1. Output ONLY raw JSON (no explanatory text)\n' +
          '  2. First character must be { and last character must be }\n' +
          '  3. Do NOT wrap in markdown code blocks (no ```json)\n' +
          '  4. Do NOT add any text before or after the JSON\n\n' +
          'Expected structure:\n' +
          '{\n' +
          '  "agent_name": "structure-architecture-analyzer",\n' +
          '  "timestamp": "2026-04-02T10:30:00.000Z",\n' +
          '  "findings": { /* your analysis data */ },\n' +
          '  "needs_verification": [] // Maximum 5 items\n' +
          '}\n\n' +
          'Please output the corrected JSON now.',
      );
    }

    // Parse the JSON
    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
      return blockWithFeedback(
        `❌ JSON parsing failed: ${errorMsg}\n\n` +
          'COMMON JSON SYNTAX ERRORS:\n' +
          '  1. Missing or extra commas between fields\n' +
          '  2. Unclosed braces { } or brackets [ ]\n' +
          '  3. Unquoted strings (all keys and values must use double quotes "")\n' +
          '  4. Trailing commas in objects or arrays (not allowed in JSON)\n' +
          '  5. Single quotes instead of double quotes\n\n' +
          'TIP: Copy your JSON to a validator (jsonlint.com) or check the exact error above.\n\n' +
          'Please fix these syntax errors and output valid JSON.',
      );
    }

    // Compute the deterministic graph-tool-use record from the transcript.
    // This is the load-bearing fix for D5: the agent claimed graph_queries_used
    // values that did not match its actual tool_use events. We read the same
    // transcript Claude CLI wrote and count for ourselves.
    const graphUses = countGraphToolUses(transcript);
    writeGraphToolUseSidecar(input.transcript_path!, graphUses);

    // Detect the "agent lied about graph usage" failure mode: the parsed JSON
    // claims one or more graph_queries_used entries but the transcript shows
    // zero `mcp__code_graph__*` tool_use events. Block + feedback so the agent
    // retries either by actually calling the graph or by honestly reporting
    // it had to fall back.
    const claimed =
      isObject(data) && Array.isArray((data as Record<string, unknown>).graph_queries_used)
        ? ((data as Record<string, unknown>).graph_queries_used as unknown[]).length
        : 0;
    if (claimed > 0 && graphUses.count === 0) {
      return blockWithFeedback(
        '❌ Output claims graph_queries_used has entries but the transcript records zero ' +
          `mcp__${CODE_GRAPH_TOOL_PREFIX.replace(/^mcp__/, '').replace(/__$/, '')}__* tool_use events.\n\n` +
          'You did not actually call any code-graph MCP tool. Either:\n' +
          '  1. Call at least one tool from the "Available MCP tools" list in your CODE GRAPH CONTEXT, OR\n' +
          '  2. Set graph_queries_used to [] and explain in your output why the graph was not used.\n\n' +
          'Do not invent tool names or fabricate query lists. The Stop hook reads the transcript directly ' +
          'and will reject any future attempt that does not match what you actually executed.',
      );
    }

    // Validate against schema
    const result = validateAgentOutput(data);

    if (!result.success) {
      // Enhanced error messages with specific guidance
      const agentInfo = result.agentName ? ` for agent "${result.agentName}"` : '';
      const errors = result.errors
        ? result.errors.issues
            .map((err, index) => {
              const pathStr = err.path.length > 0 ? `${err.path.join('.')}` : 'root';
              let errorMsg = `  ${index + 1}. Field "${pathStr}": ${err.message}`;

              // Add specific guidance for common errors
              if (err.code === 'too_big' && pathStr === 'needs_verification') {
                const actual = (err as any).actual || 'unknown';
                const max = (err as any).maximum || 5;
                errorMsg += `\n     → You provided ${actual} items, but the maximum is ${max}`;
                errorMsg += `\n     → Remove ${actual - max} item(s) from needs_verification array`;
                errorMsg += `\n     → Keep only the MOST IMPORTANT questions that cannot be determined from code`;
              }

              return errorMsg;
            })
            .join('\n')
        : 'Unknown validation error';

      return blockWithFeedback(
        `❌ Schema validation failed${agentInfo}. Fix these issues:\n\n${errors}\n\n` +
          'REQUIRED JSON STRUCTURE:\n' +
          '{\n' +
          '  "agent_name": "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer",\n' +
          '  "timestamp": "2026-04-02T10:30:00.000Z", // ISO 8601 format\n' +
          '  "findings": {\n' +
          '    "services": [ /* REQUIRED: Array of discovered services */ ],\n' +
          '    // Additional fields specific to each analyzer\n' +
          '  },\n' +
          '  "needs_verification": [\n' +
          '    { "id": "v1", "question": "Clear question?", "reason": "context" }\n' +
          '  ] // OPTIONAL, MAXIMUM 5 ITEMS\n' +
          '}\n\n' +
          'IMPORTANT:\n' +
          '  - agent_name must exactly match one of the 4 analyzer names above\n' +
          '  - timestamp must be valid ISO 8601 format\n' +
          '  - findings.services array is REQUIRED (at least 1 service)\n' +
          "  - Each service must have an 'id' field\n" +
          '  - ⚠️  needs_verification MAXIMUM 5 ITEMS - prioritize the most critical unknowns\n\n' +
          'Please output the corrected JSON with all required fields.',
      );
    }

    return allow();
  } catch (error) {
    // CRITICAL: On hook error, BLOCK (fail-safe) - don't allow potentially bad output
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return blockWithFeedback(
      `❌ HOOK CRASHED: ${errorMsg}\n\n` +
        'The validation hook encountered an unexpected error.\n' +
        'This is a framework error. The output cannot be validated.\n\n' +
        'Please report this issue if it persists.',
    );
  }
}

main();
