/**
 * Codex parity for graph-tool-uses telemetry. The extractor walks a
 * Codex rollout JSONL and produces the same `GraphToolUsesSidecar`
 * shape Claude's Stop hook writes, so downstream
 * `applyGraphToolUsageFromSidecar` and `computeSoftWarnings` see
 * identical inputs regardless of provider.
 */
import { describe, expect, it } from 'vitest';
import { extractGraphToolUsesFromCodexJsonl } from '../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-uses-extractor.js';

/**
 * Helper — build a minimal Codex rollout line for a function_call event.
 * Mirrors the actual rollout protocol: top-level `type: response_item`
 * with the call payload nested under `item`.
 */
function functionCall(name: string, callId: string): string {
  return JSON.stringify({
    type: 'response_item',
    item: { type: 'function_call', name, call_id: callId },
  });
}

function functionCallOutput(callId: string, output: unknown): string {
  return JSON.stringify({
    type: 'response_item',
    item: { type: 'function_call_output', call_id: callId, output },
  });
}

const SPILL =
  'Error: result (87,797 characters) exceeds maximum allowed tokens. Output has been saved to /tmp/spill-1.txt';

describe('extractGraphToolUsesFromCodexJsonl — empty / malformed input', () => {
  it('returns zeroed sidecar for an empty string', () => {
    const result = extractGraphToolUsesFromCodexJsonl('');
    expect(result.count).toBe(0);
    expect(result.uniqueNames).toEqual([]);
    expect(result.nameCounts).toEqual({});
    expect(result.nonGraphCount).toBe(0);
    expect(result.overflows).toEqual([]);
  });

  it('skips malformed JSONL lines without throwing', () => {
    const lines = [
      'not-json{',
      functionCall('mcp__code_graph__list_communities_tool', 'c1'),
      '   ',
      'also-not-json',
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.count).toBe(1);
    expect(result.nameCounts?.['mcp__code_graph__list_communities_tool']).toBe(1);
  });

  it('ignores entries that lack an `item` object', () => {
    const lines = [
      JSON.stringify({ type: 'session_meta', payload: { id: 'abc' } }),
      JSON.stringify({ type: 'turn_context', cwd: '/tmp' }),
      JSON.stringify({ type: 'event_msg', msg: { type: 'task_started' } }),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.count).toBe(0);
    expect(result.nonGraphCount).toBe(0);
  });
});

describe('extractGraphToolUsesFromCodexJsonl — graph tool counting', () => {
  it('counts unique mcp__code_graph__ tool names', () => {
    const lines = [
      functionCall('mcp__code_graph__list_communities_tool', 'c1'),
      functionCall('mcp__code_graph__semantic_search_nodes_tool', 'c2'),
      functionCall('mcp__code_graph__semantic_search_nodes_tool', 'c3'),
      functionCall('mcp__code_graph__get_community_tool', 'c4'),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.count).toBe(4);
    expect(result.uniqueNames).toEqual([
      'mcp__code_graph__get_community_tool',
      'mcp__code_graph__list_communities_tool',
      'mcp__code_graph__semantic_search_nodes_tool',
    ]);
    expect(result.nameCounts).toEqual({
      mcp__code_graph__list_communities_tool: 1,
      mcp__code_graph__semantic_search_nodes_tool: 2,
      mcp__code_graph__get_community_tool: 1,
    });
  });

  it('counts non-graph tool calls separately (drives low_graph_ratio warning)', () => {
    const lines = [
      functionCall('mcp__code_graph__list_communities_tool', 'c1'),
      functionCall('Read', 'r1'),
      functionCall('Glob', 'g1'),
      functionCall('Bash', 'b1'),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.count).toBe(1);
    expect(result.nonGraphCount).toBe(3);
  });

  it('tolerates `tool_name` as an alternative to `name` (older protocol shape)', () => {
    const line = JSON.stringify({
      type: 'response_item',
      item: {
        type: 'function_call',
        tool_name: 'mcp__code_graph__list_communities_tool',
        call_id: 'c1',
      },
    });
    const result = extractGraphToolUsesFromCodexJsonl(line);
    expect(result.count).toBe(1);
    expect(result.nameCounts?.['mcp__code_graph__list_communities_tool']).toBe(1);
  });
});

describe('extractGraphToolUsesFromCodexJsonl — overflow detection', () => {
  it('attributes overflow to the originating tool via call_id', () => {
    const lines = [
      functionCall('mcp__code_graph__get_community_tool', 'c1'),
      functionCallOutput('c1', SPILL),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.overflows).toEqual([
      { tool: 'mcp__code_graph__get_community_tool', callIndex: 1 },
    ]);
  });

  it('handles output as an array of {type:"output_text", text} blocks', () => {
    const lines = [
      functionCall('mcp__code_graph__list_communities_tool', 'c1'),
      functionCallOutput('c1', [{ type: 'output_text', text: SPILL }]),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.overflows).toHaveLength(1);
    expect(result.overflows?.[0].tool).toBe('mcp__code_graph__list_communities_tool');
  });

  it('handles output as { output: "<text>" } shape', () => {
    const lines = [
      functionCall('mcp__code_graph__list_communities_tool', 'c1'),
      functionCallOutput('c1', { output: SPILL }),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.overflows).toHaveLength(1);
  });

  it('does NOT mark normal results as overflows', () => {
    const lines = [
      functionCall('mcp__code_graph__list_communities_tool', 'c1'),
      functionCallOutput('c1', 'Found 12 communities. Here is the summary...'),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.overflows).toEqual([]);
  });

  it('counts overflows on multiple tools independently', () => {
    const lines = [
      functionCall('mcp__code_graph__get_community_tool', 'c1'),
      functionCallOutput('c1', SPILL),
      functionCall('mcp__code_graph__semantic_search_nodes_tool', 'c2'),
      functionCallOutput('c2', SPILL),
      functionCall('mcp__code_graph__get_community_tool', 'c3'),
      functionCallOutput('c3', SPILL),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.overflows).toHaveLength(3);
    const tools = result.overflows!.map((o) => o.tool);
    expect(tools.filter((t) => t === 'mcp__code_graph__get_community_tool')).toHaveLength(2);
    expect(tools.filter((t) => t === 'mcp__code_graph__semantic_search_nodes_tool')).toHaveLength(
      1,
    );
  });

  it('skips orphaned tool_results (call_id without a matching function_call)', () => {
    const lines = [
      functionCallOutput('c-orphan', SPILL),
      functionCall('mcp__code_graph__list_communities_tool', 'c1'),
    ].join('\n');
    const result = extractGraphToolUsesFromCodexJsonl(lines);
    expect(result.overflows).toEqual([]);
    expect(result.count).toBe(1);
  });

  it('regression: 38 tool calls + 4 overflows on a single tool', () => {
    // Reproduces the exact distribution that motivated the per-tool
    // budget caps in commit 1: structure-architecture-analyzer hit
    // get_community_tool 38 times and 4 of them overflowed.
    const lines: string[] = [];
    for (let i = 0; i < 38; i++) {
      lines.push(functionCall('mcp__code_graph__get_community_tool', `c${i}`));
      const text = i < 4 ? SPILL : 'normal result';
      lines.push(functionCallOutput(`c${i}`, text));
    }
    const result = extractGraphToolUsesFromCodexJsonl(lines.join('\n'));
    expect(result.nameCounts?.['mcp__code_graph__get_community_tool']).toBe(38);
    expect(result.overflows).toHaveLength(4);
  });
});
