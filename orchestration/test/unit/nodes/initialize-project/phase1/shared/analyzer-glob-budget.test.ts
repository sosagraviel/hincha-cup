import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Anti-regression checks for analyzer Glob/Read prompt prescriptions.
 *
 * Verifies that:
 *   1. Per-language enumerations are gone or collapsed to language-neutral
 *      name-token tables.
 *   2. Glob fallbacks are framed as "the language family the structure
 *      analyzer detected" — not as repeated per-language sections.
 *   3. The aggregate execution-instructions size stays within budget.
 *
 * Failure means a regression toward per-language enumeration crept back in.
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

describe('analyzer Glob/Read budget — anti-regression', () => {
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
    it('total size meets the acceptance criterion (≥1% drop from 73938 baseline)', () => {
      let total = 0;
      for (const dir of ANALYZER_DIRS) {
        total += readExecutionInstructions(dir).length;
      }
      const baseline = 73938;
      const reduction = (baseline - total) / baseline;
      expect(reduction).toBeGreaterThanOrEqual(0.01);
    });
  });
});
