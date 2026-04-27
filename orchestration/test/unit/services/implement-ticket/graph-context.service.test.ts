import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  assertAgentHasCodeGraphTool,
  assertCodeGraphReady,
  loadLlmWikiContext,
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

  describe('loadLlmWikiContext', () => {
    it('returns empty context when LLM wiki docs are absent', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(loadLlmWikiContext('/test/project')).toBe('');
    });

    it('loads and truncates available LLM wiki docs', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) =>
        String(path).endsWith('ARCHITECTURE.md'),
      );
      vi.mocked(fs.readFileSync).mockReturnValue(`---
document_type: architecture
---
# Architecture

${'A'.repeat(6500)}`);

      const context = loadLlmWikiContext('/test/project');

      expect(context).toContain('# LLM Wiki Context');
      expect(context).toContain('## ARCHITECTURE');
      expect(context).toContain('[Truncated to 6000 characters for prompt budget]');
      expect(context).not.toContain('document_type: architecture');
    });

    it('reads from docs/llm-wiki/wiki/ directory', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) =>
        String(path).endsWith('ARCHITECTURE.md'),
      );
      vi.mocked(fs.readFileSync).mockReturnValue('# Architecture\n\nContent.');

      const context = loadLlmWikiContext('/test/project');

      expect(context).toBe('# LLM Wiki Context\n\n## ARCHITECTURE\n\n# Architecture\n\nContent.');
    });

    it('includes index.md as part of WIKI_CORE', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => String(path).endsWith('index.md'));
      vi.mocked(fs.readFileSync).mockReturnValue('# Project Index\n\nNavigation hub for the wiki.');

      const context = loadLlmWikiContext('/test/project');

      expect(context).toContain('## index');
      expect(context).toContain('Navigation hub for the wiki.');
    });

    it('loads all five core wiki files when present (index + 4 core docs)', () => {
      const presentFiles = new Set([
        'index.md',
        'ARCHITECTURE.md',
        'SERVICES.md',
        'DATA-FLOWS.md',
        'PATTERNS.md',
      ]);
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const name = String(path).split('/').pop();
        return presentFiles.has(String(name));
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        const name = String(path).split('/').pop();
        return `# ${String(name).replace('.md', '')}\n\nBody for ${String(name)}.`;
      });

      const context = loadLlmWikiContext('/test/project');

      expect(context).toContain('## index');
      expect(context).toContain('## ARCHITECTURE');
      expect(context).toContain('## SERVICES');
      expect(context).toContain('## DATA-FLOWS');
      expect(context).toContain('## PATTERNS');
    });
  });
});
