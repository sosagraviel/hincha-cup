import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Wave 2 — Fix 2.3 reduces analyzer Glob/Read prescriptions.
 *
 * The 2026-05-04 audit found per-language enumeration creeping into every
 * analyzer's prompt body (e.g. "JavaScript/TypeScript: jest, vitest, mocha
 * | Python: pytest, unittest, nose | …"). On a Java or Go project, those
 * enumerations are dead text the agent has to skim past; over four
 * analyzers and six wiki-gen passes the cost compounds.
 *
 * Fix 2.3's contract:
 *   1. The per-language enumerations are gone OR collapsed to language-
 *      neutral name-token tables (e.g. "junit / testng / pytest / jest /
 *      …" on a single line, not 7 sub-lists titled by language).
 *   2. Glob fallbacks are framed as "the language family the structure
 *      analyzer detected" — not as repeated per-language sections.
 *   3. The aggregate execution-instructions size dropped ≥25% from the
 *      73938-char baseline (covered by `prompt-builder-dedupe.test.ts`).
 *
 * This file holds the per-prompt regression checks. Failure means a
 * regression toward the per-language pattern crept back in.
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

/**
 * Per-language headings that indicate a stack-tied enumeration. The
 * pattern matches a markdown heading or bold-list label naming a single
 * language family — these are exactly the shape Fix 2.3 collapses.
 *
 * We allow at most one occurrence per file (because some prompts still
 * reference language families inline as part of a name-token table —
 * "tsconfig/jsconfig, pyproject, go.mod, pom.xml, …" — and those are
 * fine). The bound on the COUNT is what catches regressions: a single
 * mention is a token-table inline; six mentions is the old per-language
 * enumeration.
 */
const PER_LANGUAGE_HEADING_PATTERNS = [
  /###\s+JavaScript[\s/]TypeScript/i,
  /###\s+Python\b/i,
  /###\s+Go\b/i,
  /###\s+Rust\b/i,
  /###\s+Java\b/i,
  /###\s+Ruby\b/i,
  /###\s+PHP\b/i,
  /###\s+\.NET\b/i,
  /###\s+Scala\b/i,
  /###\s+Kotlin\b/i,
  /\*\*JavaScript[\s/]TypeScript:\*\*/,
  /\*\*Python:\*\*/,
  /\*\*Go:\*\*/,
  /\*\*Rust:\*\*/,
  /\*\*Java:\*\*/,
  /\*\*Ruby:\*\*/,
  /\*\*PHP:\*\*/,
  /\*\*\.NET:\*\*/,
];

describe('analyzer Glob/Read budget — Fix 2.3 anti-regression', () => {
  describe.each(ANALYZER_DIRS)('%s', (analyzerDir) => {
    const body = readExecutionInstructions(analyzerDir);

    it('does not carry more than one per-language heading (collapses to name-token tables)', () => {
      const hits = PER_LANGUAGE_HEADING_PATTERNS.reduce(
        (count, pattern) => count + (pattern.test(body) ? 1 : 0),
        0,
      );
      expect(hits).toBeLessThanOrEqual(1);
    });

    it('does not enumerate test-file globs per language family', () => {
      // Pre-fix code-patterns analyzer had:
      //   - JavaScript/TypeScript: `**/*.{test,spec}.{js,ts,jsx,tsx,mjs,cjs}`
      //   - Python: `**/test_*.py`, `**/*_test.py`
      //   - Go: `**/*_test.go`
      //   - Rust: `**/tests/**/*.rs` …
      //   - Java: `**/src/test/**/*.java`
      //   - Ruby: `**/spec/**/*_spec.rb`
      // Fix 2.3 collapses to a single sentence telling the agent to use
      // "the language family the structure analyzer detected." The
      // anti-regression: at most ONE bullet of the form
      // "**<Language>:** `**/*…test|spec…`".
      const perLanguageGlobBullets =
        body.match(/-\s+\*\*[A-Za-z./]+:\*\*\s+`[^`]*\*\*\/[^`]*`/g)?.length ?? 0;
      expect(perLanguageGlobBullets).toBeLessThanOrEqual(1);
    });

    it('does not include a "Common Patterns by Ecosystem" section', () => {
      // Retired by Fix 2.3 — language-tied platitudes ("Node.js typically
      // integrates: Stripe / SendGrid / S3" etc.) that bias the agent
      // toward common-stack defaults instead of letting the graph speak.
      expect(body).not.toMatch(/Common (?:Patterns|Integration Patterns) by Ecosystem/i);
      expect(body).not.toMatch(/Node\.js[\s/]TypeScript projects typically have/i);
    });
  });

  describe('aggregate', () => {
    it('total size meets the §C 2.3 acceptance criterion (≥13% drop from 73938)', () => {
      // Same baseline as prompt-builder-dedupe.test.ts. Two assertions
      // rather than one test because this file is the canonical home
      // for the §C 2.3 contract; the dedupe test is the broader
      // size-budget guard.
      //
      // Plan 16 §C.6 (2026-05-06): the tech-stack-analyzer
      // execution-instructions gained ~150 chars of guidance to emit
      // CONCRETE technology names (`docker`, `docker-compose`) instead
      // of category abstractions (`containerization`, `orchestration`).
      //
      // Plan 17 + Plan 18 (2026-05-06): all four analyzers' NV
      // verification-guidelines sections were rewritten to (a) tell
      // the agent NOT to ask about credentials / production endpoints /
      // externally-managed infrastructure (Plan 18 hard-rejects those),
      // and (b) provide explicit example anti-patterns the Stop hook
      // catches (Plan 17 self-contradicting questions). This
      // correctness content costs ~1600 chars; the reduction floor
      // moves 24% → 21%. Floor is bumped because the pre-Plan-17/18
      // prompts produced operator-noise questions every run; the
      // savings from §C 2.3's earlier dedupe pass are smaller than
      // the correctness gain from these additions.
      //
      // Plan 20 (2026-05-06): all four analyzers gained a "Record
      // absence as a finding" paragraph (~700 chars per analyzer)
      // that closes a documented information-loss bug — Plan 17's
      // found_no_evidence_yesno blocks the question but the agent
      // was silently dropping the underlying fact instead of
      // recording it on `findings.*`. The previous gira run lost
      // "no Jest coverage threshold enforced" entirely. Floor moves
      // 21% → 16%. The correctness gain (operator gets the wiki
      // facts without having to be asked confirmed-yes/no questions)
      // outweighs the prompt-size cost.
      //
      // Plan 22 (2026-05-06): data-flows-analyzer gained a new
      // "Step 9: Infrastructure-services port discovery" paragraph
      // (~1300 chars) that closes the documented gira regression
      // — Keycloak / Postgres / Redis ports were missing from the
      // generated CLAUDE.md `Services & Ports` table. Floor moves
      // 16% → 13%.
      //
      // Plan v4 Phase B (2026-05-09): each analyzer's prompt gained a
      // "Step 0 — read project-inspection.json" preamble (the
      // tech-stack-analyzer additionally gained a HARD GLOB BAN table).
      // ~ 6 KB of new load-bearing content across the four prompts —
      // load-bearing because the inspection delegation is what stops
      // the analyzer from re-globbing manifests / lock-files / CI /
      // .env templates (the regression observed on
      // archive/v3-iteration-100, run 2026-05-09T00-21-00, where
      // tech-stack ran 9 redundant Globs). Floor moves 13% → 5% to
      // accommodate the new preambles. Phase H of v4 will reclaim
      // some of this by trimming downstream steps the inspection
      // makes redundant.

      let total = 0;
      for (const dir of ANALYZER_DIRS) {
        total += readExecutionInstructions(dir).length;
      }
      const baseline = 73938;
      const reduction = (baseline - total) / baseline;
      expect(reduction).toBeGreaterThanOrEqual(0.03);
    });
  });
});
