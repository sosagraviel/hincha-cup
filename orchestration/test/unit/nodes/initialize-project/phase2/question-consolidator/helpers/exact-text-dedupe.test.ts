import { describe, expect, it } from 'vitest';
import {
  exactTextDedupe,
  normaliseQuestion,
} from '../../../../../../../src/nodes/initialize-project/phase2/question-consolidator/helpers/exact-text-dedupe.js';
import type { Gap } from '../../../../../../../src/nodes/initialize-project/phase2/question-consolidator/types.js';

/**
 * Plan 14 §C.9.3 — deterministic exact-text dedupe pre-pass for
 * the Phase 2 consolidator.
 *
 * The pre-pass collapses normalised-text duplicates into a single
 * canonical entry whose `consolidated_from` is the union of source
 * agents. Anything left in `dedupedGaps` is genuinely paraphrased
 * (or genuinely unique) and worth the LLM round-trip.
 *
 * Stack-agnostic: text normalisation is whitespace + case only.
 */

function gap(overrides: Partial<Gap> & { question: string; agent: string }): Gap {
  return {
    type: 'needs_verification',
    item: overrides.item ?? overrides.question.slice(0, 30),
    priority: 'medium',
    ...overrides,
  };
}

describe('normaliseQuestion', () => {
  it('lowercases and trims', () => {
    expect(normaliseQuestion('  What Is X?  ')).toBe('what is x');
  });

  it('collapses internal whitespace runs', () => {
    expect(normaliseQuestion('What    is\t\tx?')).toBe('what is x');
  });

  it('strips trailing question / exclamation / period', () => {
    expect(normaliseQuestion('Same question?')).toBe('same question');
    expect(normaliseQuestion('Same question.')).toBe('same question');
    expect(normaliseQuestion('Same question!')).toBe('same question');
  });

  it('treats two byte-identical-after-normalisation questions as one', () => {
    expect(normaliseQuestion('What is the auth strategy?')).toBe(
      normaliseQuestion('  what  is THE auth strategy '),
    );
  });
});

describe('exactTextDedupe', () => {
  it('returns the empty result on empty input', () => {
    const result = exactTextDedupe([]);
    expect(result.dedupedGaps).toEqual([]);
    expect(result.eliminatedDuplicates).toBe(0);
    expect(result.deterministicGroups).toEqual([]);
  });

  it('passes singletons through unchanged with original_count: 1', () => {
    const result = exactTextDedupe([
      gap({ question: 'What is X?', agent: '01-structure-architecture' }),
      gap({ question: 'What is Y?', agent: '02-tech-stack-dependencies' }),
    ]);
    expect(result.dedupedGaps).toHaveLength(2);
    expect(result.eliminatedDuplicates).toBe(0);
    for (const g of result.dedupedGaps) {
      expect(g.original_count).toBe(1);
      expect(g.consolidated_from).toHaveLength(1);
    }
  });

  it('collapses byte-identical questions across agents', () => {
    const result = exactTextDedupe([
      gap({ question: 'What testing framework is used?', agent: '01-structure-architecture' }),
      gap({ question: 'What testing framework is used?', agent: '03-code-patterns-testing' }),
      gap({ question: 'What testing framework is used?', agent: '04-data-flows-integrations' }),
    ]);
    expect(result.dedupedGaps).toHaveLength(1);
    expect(result.eliminatedDuplicates).toBe(2);
    expect(result.dedupedGaps[0].original_count).toBe(3);
    expect(result.dedupedGaps[0].consolidated_from).toEqual([
      '01-structure-architecture',
      '03-code-patterns-testing',
      '04-data-flows-integrations',
    ]);
  });

  it('treats whitespace / case differences as identical', () => {
    const result = exactTextDedupe([
      gap({ question: 'What testing framework is used?', agent: 'a' }),
      gap({ question: '  what  testing FRAMEWORK is used  ', agent: 'b' }),
      gap({ question: 'What\ttesting\tframework\tis\tused?', agent: 'c' }),
    ]);
    expect(result.dedupedGaps).toHaveLength(1);
    expect(result.eliminatedDuplicates).toBe(2);
  });

  it('preserves the FIRST gap canonical wording (not the normalised form)', () => {
    // The agent's chosen wording survives verbatim — normalisation is
    // for comparison only, not for output.
    const result = exactTextDedupe([
      gap({ question: 'What testing framework is used?', agent: 'a' }),
      gap({ question: '  what testing framework is used  ', agent: 'b' }),
    ]);
    expect(result.dedupedGaps[0].question).toBe('What testing framework is used?');
  });

  it('keeps semantically-different questions separate (no false merges)', () => {
    const result = exactTextDedupe([
      gap({ question: 'What testing framework is used?', agent: 'a' }),
      gap({ question: 'What database is used?', agent: 'b' }),
      gap({ question: 'What deployment target is used?', agent: 'c' }),
    ]);
    expect(result.dedupedGaps).toHaveLength(3);
    expect(result.eliminatedDuplicates).toBe(0);
  });

  it('records deterministic_groups for every multi-source merge', () => {
    const result = exactTextDedupe([
      gap({ question: 'What is X?', agent: 'a', item: 'X-topic' }),
      gap({ question: 'What is X?', agent: 'b', item: 'X-topic' }),
      gap({ question: 'What is Y?', agent: 'c', item: 'Y-topic' }),
    ]);
    expect(result.deterministicGroups).toHaveLength(1);
    expect(result.deterministicGroups[0].original_items).toContain('X-topic');
    expect(result.deterministicGroups[0].consolidated_to).toBe('What is X?');
    expect(result.deterministicGroups[0].reason).toMatch(/Identical question text/i);
  });

  it('unions attempted_resolution entries across the merged group (deduped, order preserved)', () => {
    const result = exactTextDedupe([
      gap({
        question: 'Same Q?',
        agent: 'a',
        attempted_resolution: ['Read x.ts', 'Grep "foo" src/'],
      } as never),
      gap({
        question: 'same q',
        agent: 'b',
        attempted_resolution: ['Read x.ts', 'Glob "**/y.ts"'],
      } as never),
    ]);
    const merged = result.dedupedGaps[0].attempted_resolution!;
    expect(merged).toEqual(['Read x.ts', 'Grep "foo" src/', 'Glob "**/y.ts"']);
  });

  it('keeps the LONGEST impact text on a merged group (most specific wording)', () => {
    const result = exactTextDedupe([
      gap({ question: 'Same Q?', agent: 'a', impact: 'Short impact text.' } as never),
      gap({
        question: 'same q',
        agent: 'b',
        impact:
          'Decides whether SERVICES.md mentions database X in the integrations block of every per-service doc.',
      } as never),
    ]);
    const merged = result.dedupedGaps[0].impact!;
    expect(merged).toContain('SERVICES.md');
  });

  it('eliminates the right count when multiple groups dedupe simultaneously', () => {
    const result = exactTextDedupe([
      gap({ question: 'Q1?', agent: 'a' }),
      gap({ question: 'Q1?', agent: 'b' }),
      gap({ question: 'Q1?', agent: 'c' }),
      gap({ question: 'Q2?', agent: 'd' }),
      gap({ question: 'Q2?', agent: 'e' }),
      gap({ question: 'Q3?', agent: 'f' }),
    ]);
    expect(result.dedupedGaps).toHaveLength(3);
    // Q1: 3→1 (drops 2). Q2: 2→1 (drops 1). Q3: 1→1 (drops 0). Total 3.
    expect(result.eliminatedDuplicates).toBe(3);
  });

  it('returns the empty result on non-array input (defensive)', () => {
    expect(exactTextDedupe(undefined as never)).toEqual({
      dedupedGaps: [],
      eliminatedDuplicates: 0,
      deterministicGroups: [],
    });
    expect(exactTextDedupe(null as never)).toEqual({
      dedupedGaps: [],
      eliminatedDuplicates: 0,
      deterministicGroups: [],
    });
  });
});
