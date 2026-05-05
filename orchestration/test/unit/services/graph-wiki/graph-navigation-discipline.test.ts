import { describe, expect, it } from 'vitest';
import {
  GRAPH_NAVIGATION_DISCIPLINE_HEADING,
  GRAPH_NAVIGATION_DISCIPLINE_TEXT,
} from '../../../../src/services/graph-wiki/graph-navigation-discipline.js';

describe('graph navigation discipline — single source of truth', () => {
  it('exports a stable heading', () => {
    expect(GRAPH_NAVIGATION_DISCIPLINE_HEADING).toBe('## Graph navigation discipline');
  });

  describe('Section 0 — tool-call conventions', () => {
    it('forbids passing repo_root in MCP tool arguments', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/Do not pass `repo_root`/);
    });

    it('explains why repo_root is redundant (launcher pins via flags)', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain(
        'The MCP launcher already pins the server to this project',
      );
    });

    it('cites the upstream bug repo_root triggers on hub/bridge tools', () => {
      // Stack-agnostic phrasing: name the symptom, not a project-specific fix.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain("'str' object has no attribute 'resolve'");
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('get_hub_nodes_tool');
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('get_bridge_nodes_tool');
    });

    it('frames the str/resolve text as a defensive warning, not an active error', () => {
      // The 2026-05-04 gira run audit found the agent (and the user reading
      // the transcript) sometimes mistook the warning text for an active
      // tool-result error. The phrasing must make clear this is a known
      // upstream bug avoided by NOT passing repo_root, not something the
      // agent should expect to see.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(
        /not an actual error you should expect to see in this session/,
      );
    });

    it('documents the first-call MCP startup race and the retry-once mitigation', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/First-call startup race/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('tool_use_error: No such tool available');
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/retry the SAME call once/);
    });

    it('tells the agent NOT to invent a fallback on the first-call race', () => {
      // The gira run showed agents silently switching tools when the first
      // MCP call raced, wasting the prescribed cheapest entry point. The
      // mitigation must explicitly forbid that behaviour.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/do not abandon the graph/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/do not invent a fallback/);
    });

    it('Section 0 appears BEFORE Section 1 (cheapest entry point)', () => {
      const section0 = GRAPH_NAVIGATION_DISCIPLINE_TEXT.indexOf('### 0. Tool-call conventions');
      const section1 = GRAPH_NAVIGATION_DISCIPLINE_TEXT.indexOf(
        '### 1. Always start with the cheapest entry point',
      );
      expect(section0).toBeGreaterThanOrEqual(0);
      expect(section1).toBeGreaterThan(section0);
    });
  });

  describe('Section 5 — result-spill protocol (HARD FAILURE semantics)', () => {
    // The 2026-05-04 gira run had 10 get_community_tool overflows in Phase 1.
    // Root cause: the prior wording "switch to query_graph_tool ..." read as
    // a soft suggestion. Agents kept the partial spillover data and limped
    // along instead of switching tools. The new wording must say HARD
    // FAILURE plainly.
    it('labels the overflow sentinel as a HARD FAILURE', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/HARD FAILURE/);
    });

    it('forbids reading the spillover file', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/Do not read the (?:file|spillover)/i);
    });

    it('mandates a concrete remediation per overflowing tool', () => {
      // get_community_tool overflow → query_graph_tool({ pattern: "file_summary", ... })
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('get_community_tool` overflow');
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('pattern: "file_summary"');
    });

    it('encodes the "overflow counts double against budget" rule', () => {
      // The discipline's per-tool budget enforcement leans on this rule.
      // computeSoftWarnings() in graph-tool-usage.ts implements it; the
      // agent-facing prose must match.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/counts? DOUBLE/i);
    });

    it('tells the agent the overflow count is rendered in the run report', () => {
      // Closes the loop: the agent knows the framework SEES every overflow,
      // so silently absorbing one is not a quiet escape hatch.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/index\.html/);
    });
  });

  describe('stack-agnosticism — no project/language/framework names', () => {
    // The discipline text must work for 600+ projects across legacy + modern
    // stacks. Sample a list of project/language tokens that have appeared in
    // recent runs and assert none of them leak into the canonical text.
    const FORBIDDEN_TOKENS = [
      'gira',
      'qubika',
      'TypeScript',
      'React',
      'Node.js',
      'Python',
      'Django',
      'Rails',
      'Spring',
      '.NET',
      'PHP',
      'Laravel',
    ];
    for (const token of FORBIDDEN_TOKENS) {
      it(`does not mention "${token}"`, () => {
        expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).not.toContain(token);
      });
    }
  });
});
