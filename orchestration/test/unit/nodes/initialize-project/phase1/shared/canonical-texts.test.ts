/**
 * Anti-regression net for canonical-texts.
 *
 * The cache-eligible Phase 1 prompt prefix is byte-identical across
 * all four analyzers. The moment any analyzer's own prompt file
 * (`agent.md` / `execution-instructions.md`) re-states a canonical
 * fragment that already lives in the cache-eligible prefix (or in the
 * centralized graph navigation discipline body), the shared content is
 * paid for twice. The savings vanish silently.
 *
 * This test scans every Phase 1 analyzer prompt file for the
 * FORBIDDEN_FRAGMENTS list maintained in `canonical-texts.ts`. When
 * a fragment is found in any prompt file, the test fails with the
 * canonical home and the rationale so the offending content can be
 * removed.
 */
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_FRAGMENTS_IN_ANALYZER_PROMPTS } from '../../../../../../src/nodes/initialize-project/phase1/shared/canonical-texts.js';

const REPO_ROOT = resolve(__dirname, '../../../../../../');

const PHASE1_ANALYZERS = [
  'structure-analyzer',
  'tech-stack-analyzer',
  'code-patterns-analyzer',
  'data-flows-analyzer',
] as const;

const PROMPT_FILES = ['agent.md', 'execution-instructions.md'] as const;

function analyzerPromptPath(analyzer: string, file: string): string {
  return join(REPO_ROOT, 'src', 'nodes', 'initialize-project', 'phase1', analyzer, 'prompts', file);
}

describe('Phase 1 analyzer prompts — canonical-text drift guard', () => {
  it('every analyzer + prompt file resolves to an existing path (sanity)', () => {
    // Without this check, a typo in PHASE1_ANALYZERS would silently
    // pass every fragment-search test below (nothing to scan = no
    // matches = green).
    for (const analyzer of PHASE1_ANALYZERS) {
      for (const file of PROMPT_FILES) {
        const path = analyzerPromptPath(analyzer, file);
        expect(existsSync(path), `missing analyzer prompt file: ${path}`).toBe(true);
      }
    }
  });

  for (const { fragment, canonicalHome, rationale } of FORBIDDEN_FRAGMENTS_IN_ANALYZER_PROMPTS) {
    it(`no analyzer prompt restates the forbidden fragment "${fragment}"`, () => {
      const violations: string[] = [];
      for (const analyzer of PHASE1_ANALYZERS) {
        for (const file of PROMPT_FILES) {
          const path = analyzerPromptPath(analyzer, file);
          const body = readFileSync(path, 'utf-8');
          if (body.includes(fragment)) {
            violations.push(`  - ${analyzer}/prompts/${file}`);
          }
        }
      }
      if (violations.length > 0) {
        const message = [
          `The forbidden fragment "${fragment}" was found in:`,
          ...violations,
          '',
          `Canonical home: ${canonicalHome}`,
          `Rationale: ${rationale}`,
          '',
          'Remove the duplicate from the analyzer prompt; reference the canonical block indirectly (e.g. "see the discipline in your system prompt").',
        ].join('\n');
        throw new Error(message);
      }
    });
  }
});
