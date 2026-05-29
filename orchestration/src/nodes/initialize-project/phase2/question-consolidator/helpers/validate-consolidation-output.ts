import type { QuestionConsolidationOutput } from '../types.js';
import { extractJSON, type ValidationResult } from '../../../../../utils/validator.js';

/**
 * Strict validator for the question-consolidator agent's output.
 *
 * The 2026-05-04 audit (gira run) showed the consolidator emitting a
 * 5-key shape (`consolidated_findings`, `identified_gaps`, `timestamp`,
 * `gaps`, `question_consolidation`) while the prompt promised exactly two
 * keys (`consolidated_gaps`, `consolidation_metadata`). The previous
 * validator papered over the divergence with auto-unwrap (`findings`
 * wrapper), auto-wrap (bare arrays), auto-remap (any array key), and
 * auto-generate (missing metadata) shims. The result: the prompt and
 * the validator no longer agreed on the contract, and shape regressions
 * went silent for runs.
 *
 * This validator is the single source of truth for "agent output is
 * accepted." It enforces:
 *
 *   1. EXACTLY two top-level keys: `consolidated_gaps`,
 *      `consolidation_metadata`. No more, no fewer. Extras are rejected
 *      with a feedback message that names them so the agent can fix
 *      its next attempt.
 *   2. `consolidated_gaps` is an array. Each entry has the eight
 *      required fields (agent, item, question, reason, priority, type,
 *      consolidated_from, original_count). Each `question` ends with
 *      `?`.
 *   3. `consolidation_metadata` is an object with the four required
 *      fields (original_gap_count, consolidated_gap_count,
 *      reduction_percentage, consolidation_groups). Extras inside the
 *      metadata object are tolerated; only the top-level shape is
 *      strict (because consolidation_groups is the natural home for
 *      anything the agent wants to attach about the merge).
 *
 * Stack-agnostic: the consolidator runs on every project shape. The
 * gap fields it emits are language-neutral (agent name + question
 * text); none of the validator rules touch language.
 */
export function validateConsolidationOutput(rawOutput: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJSON(rawOutput));
  } catch (err) {
    return {
      valid: false,
      errors: [
        `Output is not valid JSON: ${(err as Error).message}. The first character must be { and the last character must be }. Do not wrap in markdown fences and do not add prose around the object.`,
      ],
      data: null,
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: [
        'Output must be a JSON object with exactly two top-level keys: consolidated_gaps, consolidation_metadata. A bare array or non-object value is rejected.',
      ],
      data: null,
    };
  }

  const obj = parsed as Record<string, unknown>;
  const allowed = new Set(['consolidated_gaps', 'consolidation_metadata']);
  const present = Object.keys(obj);
  const missing = ['consolidated_gaps', 'consolidation_metadata'].filter((k) => !(k in obj));
  const extras = present.filter((k) => !allowed.has(k));

  if (missing.length > 0 || extras.length > 0) {
    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(`Missing required top-level key(s): ${missing.join(', ')}.`);
    }
    if (extras.length > 0) {
      errors.push(
        `Forbidden extra top-level key(s): ${extras.join(', ')}. The output MUST have EXACTLY two top-level keys: consolidated_gaps, consolidation_metadata. Do not include findings, gaps, identified_gaps, consolidated_findings, conflicting_findings, timestamp, or any other key.`,
      );
    }
    return { valid: false, errors, data: null };
  }

  const gaps = obj.consolidated_gaps;
  if (!Array.isArray(gaps)) {
    return {
      valid: false,
      errors: ['consolidated_gaps must be an array.'],
      data: null,
    };
  }

  const requiredGapFields = [
    'agent',
    'item',
    'question',
    'reason',
    'priority',
    'type',
    'consolidated_from',
    'original_count',
  ] as const;

  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i] as Record<string, unknown> | null;
    if (gap === null || typeof gap !== 'object' || Array.isArray(gap)) {
      return {
        valid: false,
        errors: [`consolidated_gaps[${i}] must be an object.`],
        data: null,
      };
    }
    const missingFields = requiredGapFields.filter((f) => !(f in gap));
    if (missingFields.length > 0) {
      return {
        valid: false,
        errors: [
          `consolidated_gaps[${i}] is missing required field(s): ${missingFields.join(', ')}. Every gap object MUST have all eight fields: agent, item, question, reason, priority, type, consolidated_from, original_count.`,
        ],
        data: null,
      };
    }
    const question = gap.question;
    if (typeof question !== 'string' || !question.endsWith('?')) {
      return {
        valid: false,
        errors: [
          `consolidated_gaps[${i}].question must be a string ending with '?' (got: ${JSON.stringify(question)}).`,
        ],
        data: null,
      };
    }
    if (!Array.isArray(gap.consolidated_from)) {
      return {
        valid: false,
        errors: [`consolidated_gaps[${i}].consolidated_from must be an array.`],
        data: null,
      };
    }
  }

  const metadata = obj.consolidation_metadata;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      valid: false,
      errors: ['consolidation_metadata must be an object.'],
      data: null,
    };
  }
  const md = metadata as Record<string, unknown>;
  const requiredMetaFields = [
    'original_gap_count',
    'consolidated_gap_count',
    'reduction_percentage',
    'consolidation_groups',
  ] as const;
  const missingMeta = requiredMetaFields.filter((f) => !(f in md));
  if (missingMeta.length > 0) {
    return {
      valid: false,
      errors: [
        `consolidation_metadata is missing required field(s): ${missingMeta.join(', ')}. Required fields: original_gap_count, consolidated_gap_count, reduction_percentage, consolidation_groups.`,
      ],
      data: null,
    };
  }
  if (!Array.isArray(md.consolidation_groups)) {
    return {
      valid: false,
      errors: ['consolidation_metadata.consolidation_groups must be an array.'],
      data: null,
    };
  }

  return {
    valid: true,
    errors: [],
    data: obj as unknown as QuestionConsolidationOutput,
  };
}
