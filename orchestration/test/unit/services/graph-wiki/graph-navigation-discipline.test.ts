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
