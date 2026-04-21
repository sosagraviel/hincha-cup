import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  assertAgentHasCodeGraphTool,
  assertCodeGraphReady,
  loadAiKnowledgeContext,
} from '../../../../src/services/implement-ticket/graph-context.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('graph-context.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assertCodeGraphReady', () => {
    it('returns graph path when .code-graph.db exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const graphPath = assertCodeGraphReady('/test/project');

      expect(graphPath).toBe('/test/project/.code-graph.db');
    });

    it('fails with initialize-project guidance when graph database is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => assertCodeGraphReady('/test/project')).toThrow(/Run initialize-project/);
    });
  });

  describe('assertAgentHasCodeGraphTool', () => {
    it('passes when generated agent includes mcp__code_graph', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('tools: Read, Grep, mcp__code_graph');

      expect(() =>
        assertAgentHasCodeGraphTool('/test/project/.claude/agents/planner.md'),
      ).not.toThrow();
    });

    it('fails with reinitialize guidance when generated agent is missing graph tools', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('tools: Read, Grep, Glob');

      expect(() => assertAgentHasCodeGraphTool('/test/project/.claude/agents/planner.md')).toThrow(
        /Run initialize-project or sync framework resources/,
      );
    });
  });

  describe('loadAiKnowledgeContext', () => {
    it('returns empty context when AI knowledge docs are absent', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(loadAiKnowledgeContext('/test/project')).toBe('');
    });

    it('loads and truncates available AI knowledge docs', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) =>
        String(path).endsWith('ARCHITECTURE.md'),
      );
      vi.mocked(fs.readFileSync).mockReturnValue(`---
document_type: architecture
---
# Architecture

${'A'.repeat(6500)}`);

      const context = loadAiKnowledgeContext('/test/project');

      expect(context).toContain('# AI Knowledge Wiki Context');
      expect(context).toContain('## ARCHITECTURE');
      expect(context).toContain('[Truncated to 6000 characters for prompt budget]');
      expect(context).not.toContain('document_type: architecture');
    });
  });
});
