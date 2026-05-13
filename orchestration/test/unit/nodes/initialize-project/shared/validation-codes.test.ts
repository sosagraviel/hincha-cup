import { describe, it, expect } from 'vitest';
import {
  VALIDATION_CODES,
  NEEDS_VERIFICATION_SUBCODE_TO_KEY,
  formatValidationError,
  formatValidationErrorLong,
} from '../../../../../src/nodes/initialize-project/shared/validation-codes/index.js';

describe('validation-codes subsystem', () => {
  describe('VALIDATION_CODES table', () => {
    it('has at least the 8 needs_verification sub-codes plus framework + agent codes', () => {
      const keys = Object.keys(VALIDATION_CODES);
      expect(keys.length).toBeGreaterThanOrEqual(20);
      for (const subkey of Object.values(NEEDS_VERIFICATION_SUBCODE_TO_KEY)) {
        expect(VALIDATION_CODES).toHaveProperty(subkey);
      }
    });

    it('every code field matches its registry key', () => {
      for (const [key, spec] of Object.entries(VALIDATION_CODES)) {
        expect(spec.code).toBe(key);
      }
    });

    it('every code starts with an E<NNN>_ prefix', () => {
      for (const key of Object.keys(VALIDATION_CODES)) {
        expect(key).toMatch(/^E\d{3}_[a-z0-9_]+$/);
      }
    });
  });

  describe('formatValidationError', () => {
    it('produces VALIDATION_<code>: <what> | <fix> format', () => {
      const out = formatValidationError('E007_graph_use_fabricated', { claimed: '3' });
      expect(out).toMatch(/^VALIDATION_E007_graph_use_fabricated: /);
      expect(out).toContain(' | ');
      expect(out).toContain('claims 3 entries');
    });

    it('produces a string ≤180 chars for every code with empty args', () => {
      for (const key of Object.keys(VALIDATION_CODES) as Array<keyof typeof VALIDATION_CODES>) {
        const out = formatValidationError(key, {});
        expect(out.length).toBeLessThanOrEqual(180);
      }
    });

    it('falls back to "<key?>" placeholders when args are missing', () => {
      const out = formatValidationError('E006_json_parse_failed', {});
      expect(out).toContain('<error?>');
    });

    it('truncates oversize args without overflowing the 180-char budget', () => {
      const huge = 'x'.repeat(500);
      const out = formatValidationError('E006_json_parse_failed', { error: huge });
      expect(out.length).toBeLessThanOrEqual(180);
    });

    it('emits no emojis or multi-paragraph prose (one-line repair)', () => {
      // Emoji code-points the v6 formatters used to inject — listed
      // explicitly to keep the regex `u`-flag-clean (no surrogate
      // pairs in character classes).
      const EMOJI_RE = /\uD83D[\uDD34\uDFE1\uDFE2\uDD35]|⚠|❌|✅|✗|✓|️/u;
      for (const key of Object.keys(VALIDATION_CODES) as Array<keyof typeof VALIDATION_CODES>) {
        const out = formatValidationError(key, {});
        expect(out).not.toMatch(/\n/);
        expect(out).not.toMatch(EMOJI_RE);
      }
    });
  });

  describe('formatValidationErrorLong', () => {
    it('returns multi-line debug-renderer prose distinct from the short form', () => {
      const short = formatValidationError('E007_graph_use_fabricated', { claimed: '3' });
      const long = formatValidationErrorLong('E007_graph_use_fabricated', { claimed: '3' });
      expect(long).toContain('VALIDATION_E007_graph_use_fabricated');
      expect(long.length).toBeGreaterThan(short.length);
    });
  });

  describe('NEEDS_VERIFICATION_SUBCODE_TO_KEY', () => {
    it('maps every NeedsVerificationViolation sub-code to an E06x_ key', () => {
      const expected = [
        'missing_attempted_resolution',
        'invalid_attempted_resolution_entry',
        'graph_internals_in_user_prose',
        'fabricated_numbers_in_question',
        'missing_or_generic_impact',
        'found_no_evidence_yesno',
        'confessed_incomplete_search',
        'speculative_out_of_scope',
      ];
      for (const sub of expected) {
        const key = NEEDS_VERIFICATION_SUBCODE_TO_KEY[sub];
        expect(key, `subcode ${sub} must map to a registry key`).toBeTruthy();
        expect(VALIDATION_CODES).toHaveProperty(key);
      }
    });
  });
});
