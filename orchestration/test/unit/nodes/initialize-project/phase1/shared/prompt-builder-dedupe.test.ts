import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Anti-regression: the four Phase 1 analyzer execution-instructions files
 * historically each restated `graph_queries_used` 3× and the forbidden-tool
 * warning 2× — pure within-prompt duplication that wasted tokens on every
 * spawn. The 2026-05-05 cleanup (plan §A) trimmed each restatement so each
 * rule is mentioned exactly where it's load-bearing:
 *
 *   - `graph_queries_used`: once in "Output Format Key Points" + once in
 *     the JSON example (== 2 mentions max). Removed from the
 *     self-verification checklist.
 *   - `get_architecture_overview` standalone "forbidden — overflows"
 *     restatement: removed from each prompt body. The canonical
 *     forbidden-tool block lives in `graph-navigation-discipline.ts §3`
 *     and gets injected once via `buildPhase1AnalyzerPrompt`.
 *
 * This test fails if any future edit reintroduces the duplication.
 */

const ANALYZER_DIRS = [
  'structure-analyzer',
  'tech-stack-analyzer',
  'code-patterns-analyzer',
  'data-flows-analyzer',
] as const;

const PROMPTS_ROOT = join(__dirname, '../../../../../../src/nodes/initialize-project/phase1');

function readExecutionInstructions(analyzerDir: string): string {
  return readFileSync(
    join(PROMPTS_ROOT, analyzerDir, 'prompts', 'execution-instructions.md'),
    'utf-8',
  );
}

describe('Phase 1 analyzer execution-instructions — within-prompt dedupe (plan §A regression)', () => {
  describe.each(ANALYZER_DIRS)('%s', (analyzerDir) => {
    const body = readExecutionInstructions(analyzerDir);

    it('mentions `graph_queries_used` at most twice (Output Format Key Points + JSON example)', () => {
      // Anti-regression: was 3× per file pre-cleanup (extra mention in the
      // self-verification checklist). Cap at 2 — bumping the cap means
      // duplication crept back in.
      const count = body.match(/graph_queries_used/g)?.length ?? 0;
      expect(count).toBeLessThanOrEqual(2);
    });

    it('does NOT carry the standalone "no calls to get_architecture_overview (forbidden — overflows)" restatement', () => {
      // The discipline (graph-navigation-discipline.ts §3) is the canonical
      // home for this rule. Each analyzer's body USED to restate it inline
      // in the self-verification checklist + at the top of discovery_process.
      // Both restatements are gone after the 2026-05-05 trim.
      expect(body).not.toMatch(
        /no calls to `get_architecture_overview`\s*\(forbidden\s*[—-]+\s*overflows?\)/i,
      );
    });

    it('does NOT carry the standalone "Forbidden: get_architecture_overview" callout', () => {
      // Three of the four analyzers used to ship a `> **Forbidden:**
      // \`get_architecture_overview\` — its response cannot be bounded …`
      // callout immediately after the discovery steps. That's a restatement
      // of §3 of the discipline; the discipline injection is enough.
      expect(body).not.toMatch(
        /\*\*Forbidden:\*\*\s+`get_architecture_overview`\s*[—-]+\s*its response cannot be bounded/i,
      );
    });

    it('does NOT carry "no calls to `get_architecture_overview_tool`" inline in a sentence', () => {
      // The "lean parameters, drill-in caps, no calls to
      // `get_architecture_overview_tool`" preamble at the top of
      // discovery_process is a restatement of the discipline that gets
      // injected separately. Trimmed in the 2026-05-05 cleanup.
      expect(body).not.toMatch(/no calls to `get_architecture_overview_tool`/i);
    });
  });

  describe('aggregate', () => {
    it('total Phase 1 execution-instructions size stays within the working budget', () => {
      // Trajectory:
      //   - 2026-05-04 (pre-cleanup): 73938 chars (structure 23249 + tech-stack
      //     20377 + code-patterns 14525 + data-flows 15787).
      //   - 2026-05-05 (§A.5 within-prompt dedupe): ~73000.
      //   - 2026-05-05 (§C 1.2 canonical-name lists in tech-stack Step 12):
      //     budget loosened to 76000 to accommodate non-negotiable
      //     stack-agnostic content.
      //   - 2026-05-05 (§C 2.3 reduce Glob/Read prescriptions): collapsed
      //     per-language enumerations to language-neutral name-token tables
      //     and trimmed example outputs to language-neutral skeletons.
      //     Aggregate dropped to ≤56000 — meets the §C 2.3 acceptance
      //     criterion of ≥25% reduction from the 73938 baseline.
      //   - 2026-05-06 (Plan 16 §C.6): tech-stack-analyzer instructions
      //     gained ~150 chars of guidance to emit CONCRETE technology
      //     names (`docker`, `docker-compose`) instead of category
      //     abstractions. Budget bumped 56000 → 56500 to accommodate.
      //   - 2026-05-06 (Plan 17 + Plan 18): all four analyzers' NV
      //     verification-guidelines sections rewritten to forbid the
      //     credentials / production-endpoint / externally-managed
      //     items the Stop hook hard-rejects. This correctness
      //     content costs ~1600 chars across the four analyzers.
      //     Budget bumped 56500 → 58500.
      //   - 2026-05-06 (Plan 20): all four analyzers gained a
      //     "Record absence as a finding" paragraph closing a
      //     documented info-loss bug (Plan 17 blocks the question,
      //     agent silently drops the fact). ~700 chars per analyzer.
      //     Budget bumped 58500 → 62500.
      //   - 2026-05-06 (Plan 22): data-flows-analyzer gained
      //     "Step 9: Infrastructure-services port discovery"
      //     (~1300 chars) closing the documented gira regression
      //     — runtime infrastructure ports (Postgres / Redis /
      //     Keycloak server) were missing from CLAUDE.md
      //     `Services & Ports`. Budget bumped 62500 → 64500.
      //   - 2026-05-09 (Plan v4 Phase B): each analyzer's prompt
      //     gained a "Step 0 — read project-inspection.json" preamble.
      //     The tech-stack-analyzer additionally got a HARD GLOB BAN
      //     table mapping forbidden Glob patterns to the inspection
      //     fields that already cover them — load-bearing on
      //     archive/v3-iteration-100 (run 2026-05-09T00-21-00) the
      //     analyzer ran 9 redundant Globs. Budget bumped
      //     64500 → 70500. Phase H of v4 will reclaim some of this
      //     by trimming downstream steps the inspection makes
      //     redundant.
      //   - 2026-05-09 (Plan v4 Phase H — ratchet): current measured
      //     aggregate is ~70944 chars (structure 20393 + tech-stack
      //     22977 + code-patterns 12622 + data-flows 14952). Ratchet
      //     the cap to 71500 — leaves 556 chars of slack for surgical
      //     edits but blocks any silent regrowth back toward the
      //     2026-05-04 baseline. The plan's eventual target is ≤ 60 KB
      //     once Phase D's per-service fan-out lets us delete the
      //     per-service `code_patterns` snippet-selection guidance
      //     from code-patterns-analyzer's body.
      //   - 2026-05-11 (Plan v5):
      //       * structure-analyzer gained an inspection→output mapping
      //         table (~280 chars) so the agent knows which findings
      //         field each Phase 0 inspection slot maps to;
      //       * data-flows-analyzer Step 9 gained a "Framework-provided
      //         hints (Plan v5 Phase 4)" block (~900 chars) describing
      //         the new `infrastructure_services_hints[]` inspection
      //         field — eliminates the agent's docker-compose port
      //         re-discovery loop on the common shape;
      //       * code-patterns-analyzer Step 5 / Step 7 were net-rewritten
      //         to delegate `quality_tools` + readme/contributing
      //         booleans to the framework (smaller, not larger).
      //     Net delta: +~1100 chars. Bumping cap 71500 → 73000 keeps
      //     the prompt-size ratchet meaningful (still below the 73938
      //     pre-cleanup baseline) while accommodating the v5
      //     deterministic-post-fill documentation that the agents
      //     legitimately need to coordinate with the framework.
      let total = 0;
      for (const dir of ANALYZER_DIRS) {
        total += readExecutionInstructions(dir).length;
      }
      expect(total).toBeLessThan(73000);
    });
  });
});
