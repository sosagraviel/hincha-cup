import { describe, expect, it } from 'vitest';
import {
  CANONICAL_LANGUAGES,
  isCanonicalLanguage,
  normalizeLanguage,
} from '../../../src/schemas/language-normalization.js';

describe('normalizeLanguage — stack-agnostic alias map', () => {
  describe('TypeScript / JavaScript dialects', () => {
    it.each([
      ['ts', 'typescript'],
      ['tsx', 'typescript'],
      ['mts', 'typescript'],
      ['cts', 'typescript'],
      ['typescript', 'typescript'],
      ['TypeScript', 'typescript'],
      ['TSX', 'typescript'],
      ['js', 'javascript'],
      ['jsx', 'javascript'],
      ['mjs', 'javascript'],
      ['cjs', 'javascript'],
      ['javascript', 'javascript'],
    ])('normalizes %s → %s', (input, expected) => {
      expect(normalizeLanguage(input)).toBe(expected);
    });
  });

  describe('.NET family', () => {
    it.each([
      ['cs', 'csharp'],
      ['c#', 'csharp'],
      ['C#', 'csharp'],
      ['c-sharp', 'csharp'],
      ['fs', 'fsharp'],
      ['f#', 'fsharp'],
      ['vb', 'vbnet'],
      ['vb.net', 'vbnet'],
      ['Visual Basic', 'vbnet'],
    ])('normalizes %s → %s', (input, expected) => {
      expect(normalizeLanguage(input)).toBe(expected);
    });
  });

  describe('Python / Ruby / Go / Rust / Kotlin', () => {
    it.each([
      ['py', 'python'],
      ['python3', 'python'],
      ['Python', 'python'],
      ['rb', 'ruby'],
      ['Ruby', 'ruby'],
      ['golang', 'go'],
      ['Go', 'go'],
      ['rs', 'rust'],
      ['kt', 'kotlin'],
      ['kts', 'kotlin'],
    ])('normalizes %s → %s', (input, expected) => {
      expect(normalizeLanguage(input)).toBe(expected);
    });
  });

  describe('legacy / unusual stacks pass through unchanged', () => {
    // Critical: the framework targets 600+ projects, including legacy stacks
    // we may not have aliased. Unknown values must NOT be rejected — they
    // pass through (lowercased) so the run keeps moving.
    it.each([
      ['cobol', 'cobol'],
      ['fortran', 'fortran'],
      ['ada', 'ada'],
      ['nim', 'nim'],
      ['zig', 'zig'],
      ['crystal', 'crystal'],
      ['v', 'v'],
      ['idris', 'idris'],
      ['raku', 'raku'],
      ['groovy', 'groovy'],
    ])('passes %s through (legacy-friendly)', (input, expected) => {
      expect(normalizeLanguage(input)).toBe(expected);
    });
  });

  describe('whitespace and casing tolerance', () => {
    it('lowercases mixed-case input', () => {
      expect(normalizeLanguage('TypeScript')).toBe('typescript');
      expect(normalizeLanguage('PYTHON')).toBe('python');
    });

    it('trims surrounding whitespace', () => {
      expect(normalizeLanguage('  ts  ')).toBe('typescript');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeLanguage('')).toBe('');
    });
  });
});

describe('isCanonicalLanguage', () => {
  it('returns true for every canonical language', () => {
    for (const lang of CANONICAL_LANGUAGES) {
      expect(isCanonicalLanguage(lang)).toBe(true);
    }
  });

  it('returns true for known aliases (after normalization)', () => {
    expect(isCanonicalLanguage('tsx')).toBe(true);
    expect(isCanonicalLanguage('cs')).toBe(true);
    expect(isCanonicalLanguage('py')).toBe(true);
  });

  it('returns false for legacy / unusual stacks (so caller can soft-warn)', () => {
    expect(isCanonicalLanguage('cobol')).toBe(false);
    expect(isCanonicalLanguage('fortran')).toBe(false);
    expect(isCanonicalLanguage('zig')).toBe(false);
  });
});

describe('CANONICAL_LANGUAGES — shape sanity', () => {
  // Stack-agnostic guarantee: the canonical set covers the major modern AND
  // legacy languages we know the framework will encounter on 6000+ machines.
  it.each([
    'typescript',
    'javascript',
    'python',
    'go',
    'java',
    'csharp',
    'kotlin',
    'ruby',
    'rust',
    'php',
    'swift',
    'cpp',
    'shell',
    'sql',
  ])('includes %s', (lang) => {
    expect(CANONICAL_LANGUAGES.has(lang)).toBe(true);
  });
});
