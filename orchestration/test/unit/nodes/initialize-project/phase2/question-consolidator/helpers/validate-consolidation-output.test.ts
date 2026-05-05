import { describe, it, expect } from 'vitest';
import { validateConsolidationOutput } from '../../../../../../../src/nodes/initialize-project/phase2/question-consolidator/helpers/validate-consolidation-output.js';

/**
 * Wave 1.5 — Phase 2 consolidator schema enforcement.
 *
 * The 2026-05-04 gira run had the consolidator emit a 5-key shape
 * (`consolidated_findings`, `identified_gaps`, `timestamp`, `gaps`,
 * `question_consolidation`) while the prompt promised a 2-key shape.
 * The previous validator papered the divergence over with auto-shims
 * (unwrap `findings`, wrap bare arrays, remap unknown array keys, fill
 * in missing metadata). The strict validator below is the new contract:
 * any divergence from `{ consolidated_gaps, consolidation_metadata }`
 * is rejected with feedback the agent can act on.
 *
 * Stack-agnostic: every assertion is shape-only — no language, no
 * project, no framework names appear in either the validator or these
 * tests.
 */

const validGap = {
  agent: '01-structure-architecture',
  item: 'src/services/foo',
  question: 'What does foo do?',
  reason: 'Surfaced by structure analyzer with no detail.',
  priority: 'medium',
  type: 'needs_verification',
  consolidated_from: ['01-structure-architecture'],
  original_count: 1,
};

const validMetadata = {
  original_gap_count: 5,
  consolidated_gap_count: 3,
  reduction_percentage: 40,
  consolidation_groups: [],
};

function asJson(obj: unknown): string {
  return JSON.stringify(obj);
}

describe('validateConsolidationOutput — strict 2-key contract', () => {
  describe('happy path', () => {
    it('accepts the canonical 2-key shape', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [validGap],
          consolidation_metadata: validMetadata,
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toBeTruthy();
    });

    it('accepts an empty consolidated_gaps array', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [],
          consolidation_metadata: validMetadata,
        }),
      );
      expect(result.valid).toBe(true);
    });

    it('accepts metadata with extra fields inside consolidation_groups entries', () => {
      // The strict validator only constrains the TOP-level shape and the
      // four metadata required fields; agents can decorate group entries.
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [validGap],
          consolidation_metadata: {
            ...validMetadata,
            consolidation_groups: [
              {
                group_id: 1,
                topic: 'foo',
                original_items: ['a', 'b'],
                consolidated_to: 'c',
                reason: 'optional, allowed',
              },
            ],
          },
        }),
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('rejects the gira divergent shape (anti-regression)', () => {
    it('rejects the 5-key shape observed in the 2026-05-04 audit', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_findings: { x: 1 },
          identified_gaps: [],
          timestamp: '2026-05-04T00:00:00Z',
          gaps: [validGap],
          question_consolidation: validMetadata,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/Forbidden extra top-level key/);
      expect(result.errors.join(' ')).toMatch(/Missing required top-level key/);
    });
  });

  describe('rejects auto-shim regressions', () => {
    it('rejects the `findings` wrapper that the old validator unwrapped', () => {
      const result = validateConsolidationOutput(
        asJson({
          findings: {
            consolidated_gaps: [validGap],
            consolidation_metadata: validMetadata,
          },
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/findings/);
    });

    it('rejects a bare array at the top level', () => {
      const result = validateConsolidationOutput(asJson([validGap]));
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/bare array|two top-level keys/i);
    });

    it('rejects when `consolidated_gaps` is renamed to a different array key', () => {
      const result = validateConsolidationOutput(
        asJson({
          gaps: [validGap],
          consolidation_metadata: validMetadata,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/Missing required top-level key.*consolidated_gaps/);
      expect(result.errors.join(' ')).toMatch(/Forbidden extra top-level key.*gaps/);
    });

    it('rejects when consolidation_metadata is missing entirely', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [validGap],
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /Missing required top-level key.*consolidation_metadata/,
      );
    });
  });

  describe('top-level type checks', () => {
    it('rejects non-JSON output', () => {
      const result = validateConsolidationOutput('not json');
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/not valid JSON|Output is not/);
    });

    it('rejects a JSON null', () => {
      const result = validateConsolidationOutput('null');
      expect(result.valid).toBe(false);
    });

    it('rejects a JSON primitive', () => {
      const result = validateConsolidationOutput('42');
      expect(result.valid).toBe(false);
    });
  });

  describe('consolidated_gaps element validation', () => {
    it('rejects a gap missing one of the eight required fields', () => {
      const { reason: _r, ...gapMissingReason } = validGap;
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [gapMissingReason],
          consolidation_metadata: validMetadata,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/missing required field.*reason/);
    });

    it('rejects a question that does not end with `?`', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [{ ...validGap, question: 'What does foo do' }],
          consolidation_metadata: validMetadata,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/must be a string ending with '\?'/);
    });

    it('rejects a non-array consolidated_gaps', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: 'not an array',
          consolidation_metadata: validMetadata,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/consolidated_gaps must be an array/);
    });

    it('rejects a non-array consolidated_from on a gap', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [{ ...validGap, consolidated_from: '01-structure-architecture' }],
          consolidation_metadata: validMetadata,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/consolidated_from must be an array/);
    });
  });

  describe('consolidation_metadata field checks', () => {
    it('rejects when metadata is not an object', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [validGap],
          consolidation_metadata: 'oops',
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/consolidation_metadata must be an object/);
    });

    it('rejects when a required metadata field is missing', () => {
      const { consolidation_groups: _g, ...metaMissingGroups } = validMetadata;
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [validGap],
          consolidation_metadata: metaMissingGroups,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /consolidation_metadata is missing required field.*consolidation_groups/,
      );
    });

    it('rejects when consolidation_groups is not an array', () => {
      const result = validateConsolidationOutput(
        asJson({
          consolidated_gaps: [validGap],
          consolidation_metadata: { ...validMetadata, consolidation_groups: { not: 'array' } },
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /consolidation_metadata\.consolidation_groups must be an array/,
      );
    });
  });
});
