import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const SKILL_PATH = join(
  __dirname,
  '../../../../skills/020-development-workflow/create-sdd-ticket/SKILL.md',
);

describe('create-sdd-ticket SKILL.md structure regression', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(SKILL_PATH, 'utf-8');
  });

  describe('Phase 0.5 existence', () => {
    it('contains Phase 0.5 heading', () => {
      expect(content).toContain('### Phase 0.5: Wiki & Graph Context Preload');
    });

    it('Phase 0.5 appears between Phase 0 and Phase 1', () => {
      const phase0Idx = content.indexOf('### Phase 0: Inject Project Context');
      const phase05Idx = content.indexOf('### Phase 0.5: Wiki & Graph Context Preload');
      const phase1Idx = content.indexOf('### Phase 1: Parse Input Source');

      expect(phase0Idx).toBeGreaterThanOrEqual(0);
      expect(phase05Idx).toBeGreaterThan(phase0Idx);
      expect(phase1Idx).toBeGreaterThan(phase05Idx);
    });

    it('Phase 0.5 references docs/llm-wiki/wiki/', () => {
      expect(content).toContain('docs/llm-wiki/wiki/');
    });

    it('Phase 0.5 includes WIKI_CORE collection step', () => {
      expect(content).toContain('WIKI_CORE');
    });

    it('Phase 0.5 includes WIKI_SERVICES collection step', () => {
      expect(content).toContain('WIKI_SERVICES');
    });

    it('Phase 0.5 includes mcp__code_graph__get_minimal_context_tool call', () => {
      expect(content).toContain('mcp__code_graph__get_minimal_context_tool');
    });

    it('Phase 0.5 documents the wiki-context.md persistence path', () => {
      expect(content).toContain('wiki-context.md');
    });
  });

  describe('fallback behavior', () => {
    it('contains exact fallback log string required by tests', () => {
      expect(content).toContain('wiki unavailable — falling back to project-context only');
    });

    it('fallback log string appears at least twice (missing wiki + --skip-wiki paths)', () => {
      const occurrences = (
        content.match(/wiki unavailable — falling back to project-context only/g) ?? []
      ).length;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    });

    it('fallback instructs skill not to fail', () => {
      expect(content).toContain('Do NOT fail the skill');
    });
  });

  describe('--skip-wiki flag', () => {
    it('documents --skip-wiki in optional flags', () => {
      expect(content).toContain('--skip-wiki');
    });

    it('--skip-wiki flag is listed in the Invocation optional flags section', () => {
      const invocationSection = content.slice(
        content.indexOf('## Invocation'),
        content.indexOf('## Input And Output Modes'),
      );
      expect(invocationSection).toContain('--skip-wiki');
    });

    it('--skip-wiki is also documented within Phase 0.5', () => {
      const phase05Section = content.slice(
        content.indexOf('### Phase 0.5:'),
        content.indexOf('### Phase 1:'),
      );
      expect(phase05Section).toContain('--skip-wiki');
    });
  });

  describe('Phase 2 inference order', () => {
    it('contains the Required inference order heading', () => {
      expect(content).toContain('Required inference order:');
    });

    it('inference order has WIKI_CORE as first step (wiki before grep)', () => {
      const inferenceSection = content.slice(
        content.indexOf('Required inference order:'),
        content.indexOf('UI-specific handling must remain available:'),
      );
      const step1Idx = inferenceSection.indexOf('1.');
      const wikiCoreIdx = inferenceSection.indexOf('WIKI_CORE');
      const codebaseGrepIdx = inferenceSection.indexOf('Codebase grep');

      expect(wikiCoreIdx).toBeGreaterThanOrEqual(0);
      expect(codebaseGrepIdx).toBeGreaterThan(wikiCoreIdx);
      expect(wikiCoreIdx).toBeGreaterThan(step1Idx);
    });

    it('inference order uses mcp__code_graph__semantic_search_nodes_tool before codebase grep', () => {
      const inferenceSection = content.slice(
        content.indexOf('Required inference order:'),
        content.indexOf('UI-specific handling must remain available:'),
      );
      const graphToolIdx = inferenceSection.indexOf('mcp__code_graph__semantic_search_nodes_tool');
      const codebaseGrepIdx = inferenceSection.indexOf('Codebase grep');

      expect(graphToolIdx).toBeGreaterThanOrEqual(0);
      expect(codebaseGrepIdx).toBeGreaterThan(graphToolIdx);
    });

    it('inference order has exactly 6 numbered steps', () => {
      const inferenceSection = content.slice(
        content.indexOf('Required inference order:'),
        content.indexOf('UI-specific handling must remain available:'),
      );
      const stepMatches = inferenceSection.match(/^\d+\./gm) ?? [];
      expect(stepMatches).toHaveLength(6);
    });
  });

  describe('canonical ticket structure — wikiEvidence and graphEvidence', () => {
    it('technicalContext contains wikiEvidence field', () => {
      expect(content).toContain('"wikiEvidence"');
    });

    it('technicalContext contains graphEvidence field', () => {
      expect(content).toContain('"graphEvidence"');
    });

    it('wikiEvidence example references docs/llm-wiki/wiki/', () => {
      const jsonBlock = content.slice(
        content.indexOf('```json'),
        content.indexOf('```', content.indexOf('```json') + 6),
      );
      expect(jsonBlock).toContain('docs/llm-wiki/wiki/');
    });

    it('graphEvidence example references mcp__code_graph__semantic_search_nodes_tool', () => {
      const jsonBlock = content.slice(
        content.indexOf('```json'),
        content.indexOf('```', content.indexOf('```json') + 6),
      );
      expect(jsonBlock).toContain('mcp__code_graph__semantic_search_nodes_tool');
    });

    it('wikiEvidence and graphEvidence appear inside technicalContext', () => {
      const jsonBlock = content.slice(
        content.indexOf('```json'),
        content.indexOf('```', content.indexOf('```json') + 6),
      );
      const techContextStart = jsonBlock.indexOf('"technicalContext"');
      const wikiEvidenceIdx = jsonBlock.indexOf('"wikiEvidence"');
      const graphEvidenceIdx = jsonBlock.indexOf('"graphEvidence"');

      expect(techContextStart).toBeGreaterThanOrEqual(0);
      expect(wikiEvidenceIdx).toBeGreaterThan(techContextStart);
      expect(graphEvidenceIdx).toBeGreaterThan(techContextStart);
    });
  });

  describe('markdown template — Wiki Evidence and Graph Evidence sections', () => {
    it('markdown template includes ## Wiki Evidence section', () => {
      expect(content).toContain('## Wiki Evidence');
    });

    it('markdown template includes ## Graph Evidence section', () => {
      expect(content).toContain('## Graph Evidence');
    });

    it('## Wiki Evidence appears before ## Graph Evidence in the template', () => {
      const wikiEvidenceIdx = content.lastIndexOf('## Wiki Evidence');
      const graphEvidenceIdx = content.lastIndexOf('## Graph Evidence');
      expect(wikiEvidenceIdx).toBeLessThan(graphEvidenceIdx);
    });

    it('Wiki Evidence example references docs/llm-wiki/wiki/', () => {
      const templateSection = content.slice(
        content.lastIndexOf('## Wiki Evidence'),
        content.lastIndexOf('## Graph Evidence'),
      );
      expect(templateSection).toContain('docs/llm-wiki/wiki/');
    });
  });

  describe('quality checks — Technical Clarity', () => {
    it('Technical Clarity section contains wiki evidence checkbox', () => {
      const techClaritySection = content.slice(
        content.indexOf('### Technical Clarity'),
        content.indexOf('## Integration Notes'),
      );
      expect(techClaritySection).toContain('wiki evidence cited when available');
    });

    it('Technical Clarity section contains graph evidence checkbox', () => {
      const techClaritySection = content.slice(
        content.indexOf('### Technical Clarity'),
        content.indexOf('## Integration Notes'),
      );
      expect(techClaritySection).toContain('graph evidence cited when the graph is available');
    });

    it('wiki and graph evidence items are formatted as unchecked checkboxes', () => {
      expect(content).toContain('- [ ] wiki evidence cited when available');
      expect(content).toContain('- [ ] graph evidence cited when the graph is available');
    });
  });

  describe('integration notes', () => {
    it('Integration Notes contains LLM wiki entry', () => {
      const integrationSection = content.slice(
        content.indexOf('## Integration Notes'),
        content.indexOf('## Version History'),
      );
      expect(integrationSection).toContain('LLM wiki');
    });

    it('LLM wiki note describes soft-optional fallback', () => {
      expect(content).toContain(
        'LLM wiki: required in Phase 0.5 when available; soft-optional when missing',
      );
    });
  });

  describe('version history', () => {
    it('version 3.1.0 entry exists', () => {
      expect(content).toContain('**3.1.0**');
    });

    it('3.1.0 entry is dated 2026-04-24', () => {
      expect(content).toContain('**3.1.0** (2026-04-24)');
    });

    it('3.1.0 entry mentions Phase 0.5', () => {
      const versionSection = content.slice(content.indexOf('**3.1.0**'));
      const entry = versionSection.slice(0, versionSection.indexOf('\n- **'));
      expect(entry).toContain('Phase 0.5');
    });

    it('3.1.0 entry appears before 3.0.0 entry (newest first)', () => {
      const v31Idx = content.indexOf('**3.1.0**');
      const v30Idx = content.indexOf('**3.0.0**');
      expect(v31Idx).toBeLessThan(v30Idx);
    });

    it('version 3.2.0 entry exists', () => {
      expect(content).toContain('**3.2.0**');
    });

    it('3.2.0 entry appears before 3.1.0 entry (newest first)', () => {
      const v32Idx = content.indexOf('**3.2.0**');
      const v31Idx = content.indexOf('**3.1.0**');
      expect(v32Idx).toBeLessThan(v31Idx);
    });
  });

  describe('Phase 2 multi-tool graph routing', () => {
    it('Phase 2 step 2 mentions all six question classes', () => {
      const phase2Section = content.slice(
        content.indexOf('### Phase 2: Intelligent Gap Detection'),
        content.indexOf('### Phase 3: Batch Question Generation'),
      );
      expect(phase2Section).toContain('symbol_lookup');
      expect(phase2Section).toContain('relationship');
      expect(phase2Section).toContain('data_flow');
      expect(phase2Section).toContain('boundary');
      expect(phase2Section).toContain('impact');
      expect(phase2Section).toContain('overview');
    });

    it('Phase 2 step 2 references at least 4 distinct graph MCP tools by name', () => {
      const phase2Section = content.slice(
        content.indexOf('### Phase 2: Intelligent Gap Detection'),
        content.indexOf('### Phase 3: Batch Question Generation'),
      );
      expect(phase2Section).toContain('mcp__code_graph__semantic_search_nodes_tool');
      expect(phase2Section).toContain('mcp__code_graph__query_graph_tool');
      expect(phase2Section).toContain('mcp__code_graph__get_community_tool');
      expect(phase2Section).toContain('mcp__code_graph__list_flows_tool');
    });

    it('Phase 2 documents the cap of 6 graph queries', () => {
      const phase2Section = content.slice(
        content.indexOf('### Phase 2: Intelligent Gap Detection'),
        content.indexOf('### Phase 3: Batch Question Generation'),
      );
      expect(phase2Section).toContain('6 graph queries');
    });

    it('graphEvidence in canonical structure is an array of {tool, params, finding} entries with multiple tools', () => {
      const jsonBlock = content.slice(
        content.indexOf('```json'),
        content.indexOf('```', content.indexOf('```json') + 6),
      );
      const graphEvidenceStart = jsonBlock.indexOf('"graphEvidence"');
      const graphEvidenceBlock = jsonBlock.slice(
        graphEvidenceStart,
        jsonBlock.indexOf(']', graphEvidenceStart) + 1,
      );
      expect(graphEvidenceBlock).toContain('"tool"');
      expect(graphEvidenceBlock).toContain('"params"');
      expect(graphEvidenceBlock).toContain('"finding"');
      const toolCount = (graphEvidenceBlock.match(/"tool"/g) ?? []).length;
      expect(toolCount).toBeGreaterThanOrEqual(2);
    });
  });
});
