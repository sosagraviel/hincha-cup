import { describe, it, expect } from 'vitest';
import {
  PLACEHOLDERS,
  hasPlaceholders,
  substitutePlaceholders,
} from '../../../src/utils/skill-placeholders.js';
import { Provider } from '../../../src/providers/types.js';

describe('skill-placeholders', () => {
  describe('PLACEHOLDERS', () => {
    it('defines values for every supported provider', () => {
      for (const key of Object.keys(PLACEHOLDERS) as (keyof typeof PLACEHOLDERS)[]) {
        expect(PLACEHOLDERS[key][Provider.CLAUDE]).toBeTruthy();
        expect(PLACEHOLDERS[key][Provider.CODEX]).toBeTruthy();
      }
    });

    it('maps TEMP_DIR to provider-specific temp directories', () => {
      expect(PLACEHOLDERS.TEMP_DIR[Provider.CLAUDE]).toBe('.claude-temp');
      expect(PLACEHOLDERS.TEMP_DIR[Provider.CODEX]).toBe('.codex-temp');
    });

    it('maps CONFIG_DIR to provider-specific config directories', () => {
      expect(PLACEHOLDERS.CONFIG_DIR[Provider.CLAUDE]).toBe('.claude');
      expect(PLACEHOLDERS.CONFIG_DIR[Provider.CODEX]).toBe('.codex');
    });

    it('maps INSTRUCTION_FILE to provider-specific instruction file names', () => {
      expect(PLACEHOLDERS.INSTRUCTION_FILE[Provider.CLAUDE]).toBe('CLAUDE.md');
      expect(PLACEHOLDERS.INSTRUCTION_FILE[Provider.CODEX]).toBe('AGENTS.md');
    });
  });

  describe('hasPlaceholders', () => {
    it('detects placeholders', () => {
      expect(hasPlaceholders('See {{TEMP_DIR}}/file.txt')).toBe(true);
      expect(hasPlaceholders('Read {{CONFIG_DIR}}/{{INSTRUCTION_FILE}}')).toBe(true);
    });

    it('returns false for content without placeholders', () => {
      expect(hasPlaceholders('Plain markdown content')).toBe(false);
      expect(hasPlaceholders('')).toBe(false);
    });

    it('is safe to call repeatedly (regex state reset)', () => {
      const input = 'See {{TEMP_DIR}}/x';
      expect(hasPlaceholders(input)).toBe(true);
      expect(hasPlaceholders(input)).toBe(true);
      expect(hasPlaceholders(input)).toBe(true);
    });

    it('does not match lowercase tokens', () => {
      expect(hasPlaceholders('{{temp_dir}}')).toBe(false);
    });
  });

  describe('substitutePlaceholders', () => {
    it('replaces TEMP_DIR for Claude', () => {
      expect(substitutePlaceholders('Path: {{TEMP_DIR}}/foo', Provider.CLAUDE)).toBe(
        'Path: .claude-temp/foo',
      );
    });

    it('replaces TEMP_DIR for Codex', () => {
      expect(substitutePlaceholders('Path: {{TEMP_DIR}}/foo', Provider.CODEX)).toBe(
        'Path: .codex-temp/foo',
      );
    });

    it('replaces CONFIG_DIR and INSTRUCTION_FILE together', () => {
      const input = 'Read {{CONFIG_DIR}}/{{INSTRUCTION_FILE}} first';
      expect(substitutePlaceholders(input, Provider.CLAUDE)).toBe('Read .claude/CLAUDE.md first');
      expect(substitutePlaceholders(input, Provider.CODEX)).toBe('Read .codex/AGENTS.md first');
    });

    it('replaces multiple occurrences of the same placeholder', () => {
      const input = '{{TEMP_DIR}} and {{TEMP_DIR}} again';
      expect(substitutePlaceholders(input, Provider.CLAUDE)).toBe(
        '.claude-temp and .claude-temp again',
      );
    });

    it('replaces PROVIDER_NAME', () => {
      expect(substitutePlaceholders('Run under {{PROVIDER_NAME}}.', Provider.CLAUDE)).toBe(
        'Run under Claude Code.',
      );
      expect(substitutePlaceholders('Run under {{PROVIDER_NAME}}.', Provider.CODEX)).toBe(
        'Run under Codex CLI.',
      );
    });

    it('is a no-op for content without placeholders', () => {
      const input = '# Heading\n\nJust markdown.';
      expect(substitutePlaceholders(input, Provider.CLAUDE)).toBe(input);
    });

    it('throws on unknown placeholder', () => {
      expect(() => substitutePlaceholders('Hello {{UNKNOWN}}', Provider.CLAUDE)).toThrow(
        /Unknown placeholder.*UNKNOWN/,
      );
    });

    it('reports all unknown placeholders in one error', () => {
      expect(() => substitutePlaceholders('{{FOO}} and {{BAR}}', Provider.CLAUDE)).toThrow(
        /BAR.*FOO|FOO.*BAR/,
      );
    });

    it('does not match lowercase tokens (regex is case-sensitive)', () => {
      const input = 'literal {{temp_dir}} stays as-is';
      expect(substitutePlaceholders(input, Provider.CLAUDE)).toBe(input);
    });
  });
});
