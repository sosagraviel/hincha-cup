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

    it('cites the upstream AttributeError symptom + the framework-side patch path', () => {
      // The bug fires regardless of whether the agent passes repo_root —
      // the upstream code-review-graph installs `--repo <path>` from the
      // framework's launch flags into `_default_repo_root`, and
      // `_resolve_repo_root(None)` returns that string, which
      // `_validate_repo_root(str)` then crashes on. The framework's
      // setup-code-graph.sh applies a post-install patch that fixes
      // this; the discipline tells the agent what to do if the patch
      // fails to apply on a given machine.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain("'str' object has no attribute 'resolve'");
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('get_hub_nodes_tool');
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('get_bridge_nodes_tool');
    });

    it('lists every tool affected by the upstream bug, not just hub/bridge', () => {
      // analysis_tools.py has the same bug in five tool functions.
      // Naming all five so the agent recognises the same symptom on any
      // of them.
      for (const tool of [
        'get_hub_nodes_tool',
        'get_bridge_nodes_tool',
        'get_knowledge_gaps_tool',
        'get_surprising_connections_tool',
        'get_suggested_questions_tool',
      ]) {
        expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain(tool);
      }
    });

    it('points the agent at the framework patch path, not at "do not pass repo_root"', () => {
      // The previous wording told the agent the bug only fires when
      // repo_root is passed — false; it fires regardless because the
      // framework launcher sets _default_repo_root via --repo. The new
      // wording correctly attributes the fix to setup-code-graph.sh
      // and tells the agent to surface a needs_verification entry if
      // it still trips the bug.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/setup-code-graph\.sh/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/needs_verification/i);
    });

    it('does NOT tell the agent the str/resolve error only fires if it passes repo_root', () => {
      // Anti-regression: the bug fires regardless of agent input because
      // `--repo` populates _default_repo_root. Don't promise the agent a
      // guarantee the framework cannot keep.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).not.toMatch(
        /not an actual error you should expect to see/,
      );
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).not.toMatch(
        /as long as you do not pass `repo_root`/,
      );
    });

    it('names the alternative-tool fallback for the affected tools', () => {
      // If the patch fails on a given machine, the agent must know
      // which alternative graph tools cover the same ground. Names
      // get_minimal_context + list_communities + get_community.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/get_minimal_context_tool/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/list_communities_tool/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/get_community_tool/);
    });

    it('documents the first-call MCP startup race and the retry-once mitigation', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/First-call startup race/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toContain('tool_use_error: No such tool available');
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/retry the SAME call once/);
    });

    it('tells the agent NOT to invent a fallback on the first-call race', () => {
      // Agents have been seen silently switching tools when the first MCP
      // call raced, wasting the prescribed cheapest entry point. The
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
    // The prior wording "switch to query_graph_tool ..." read as a soft
    // suggestion. Agents kept the partial spillover data and limped along
    // instead of switching tools. The new wording must say HARD FAILURE
    // plainly.
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

    // The recovery protocol must explicitly forbid walking away from the
    // graph for file-system calls after an overflow.
    it('mandates RECOVER, not abandon', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/RECOVER, do not abandon/);
    });

    it('names filesystem-enumeration tools the agent must NOT switch to', () => {
      // Stack-agnostic — the body must mention shell-equivalent tools
      // across operating systems so agents on macOS/Linux/Windows all
      // recognize the prohibition.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/Glob/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/find/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/grep/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/Get-ChildItem/);
    });

    it('explains why filesystem enumeration is wrong (parameter problem, not data problem)', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/parameter problem, not a data problem/i);
    });

    it('encodes the "continue the planned graph workflow" instruction', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/continue the planned graph workflow/i);
    });
  });

  // get_community_tool can overflow on community names that aggregate
  // many test cases. The discipline warns about fat communities BEFORE
  // the drill-in attempt.
  describe('Section 0 — fat-community pre-drill guidance', () => {
    it('introduces the "Fat communities" subsection', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/Fat communities/);
    });

    it('names verb-like prefix patterns (test aggregations)', () => {
      // Stack-agnostic: every language has test-aggregation communities
      // because parsers cluster test names with shared prefixes.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/it:|should|test:|describe:|assert:/);
    });

    it('names cross-cutting noun roots that produce fat communities', () => {
      // Same shape across languages — utils/helpers/exceptions clusters
      // form in every codebase the parser indexes.
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/exceptions/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/helpers/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/utils/);
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(/shared/);
    });

    it('prescribes query_graph_tool(file_summary) as the alternative drill-in', () => {
      expect(GRAPH_NAVIGATION_DISCIPLINE_TEXT).toMatch(
        /query_graph_tool[\s\S]*?pattern:\s*"file_summary"/,
      );
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
