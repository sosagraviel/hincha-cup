/**
 * Plan §E.5 (2026-05-05) — soft-warning detector for missing
 * "Validation Rules" sub-section in code-conventions/SKILL.md.
 *
 * The 2026-05-04 gira run shipped a code-conventions skill with no
 * Zod / class-validator coverage even though both packages were in the
 * dependency tree. This is a soft signal — synthesis is an LLM, may
 * legitimately omit on a project that imports a validation lib but
 * doesn't actually use it — so the warning surfaces in the run log
 * rather than failing the build.
 */
import { describe, it, expect } from 'vitest';
import {
  VALIDATION_LIBRARIES,
  detectMissingValidationRules,
  findValidationLibrariesInDependencies,
} from '../../../../../src/nodes/initialize-project/phase3/validators/detect-missing-validation-rules.js';

describe('findValidationLibrariesInDependencies', () => {
  it('returns empty array when no dependencies arrays are passed', () => {
    expect(findValidationLibrariesInDependencies([])).toEqual([]);
  });

  it('skips undefined or empty entries without throwing', () => {
    expect(findValidationLibrariesInDependencies([undefined, []])).toEqual([]);
  });

  it('detects each library by substring (lower-cased)', () => {
    const result = findValidationLibrariesInDependencies([['zod', 'class-validator', 'lodash']]);
    expect(result).toContain('zod');
    expect(result).toContain('class-validator');
    expect(result).not.toContain('lodash');
  });

  it('matches versioned forms like "zod@3.22.4" and "class-validator >=0.14"', () => {
    const result = findValidationLibrariesInDependencies([
      ['zod@3.22.4', 'class-validator >=0.14.0', 'react'],
    ]);
    expect(result).toEqual(['class-validator', 'zod']);
  });

  it('is case-insensitive on input', () => {
    expect(findValidationLibrariesInDependencies([['ZOD', 'Yup']])).toEqual(['yup', 'zod']);
  });

  it('flattens across multiple dependency arrays (production + dev across services)', () => {
    const result = findValidationLibrariesInDependencies([
      ['react', 'zod'],
      ['vitest', 'class-validator'],
      ['fastify', 'joi'],
    ]);
    expect(result).toEqual(['class-validator', 'joi', 'zod']);
  });

  it('returns deduplicated, sorted list', () => {
    const result = findValidationLibrariesInDependencies([['zod', 'zod-to-openapi'], ['zod@3.22']]);
    expect(result).toEqual(['zod']);
  });

  it('covers every documented library in the constant', () => {
    // Anti-regression: if the library list grows, the test suite should
    // surface it as something the docs/team need to know about.
    expect([...VALIDATION_LIBRARIES].sort()).toEqual([
      'ajv',
      'cerberus',
      'class-validator',
      'joi',
      'marshmallow',
      'pydantic',
      'valibot',
      'yup',
      'zod',
    ]);
  });

  it('detects pydantic and marshmallow (cross-language stack)', () => {
    const result = findValidationLibrariesInDependencies([['pydantic==2.0', 'marshmallow~=3.20']]);
    expect(result).toEqual(['marshmallow', 'pydantic']);
  });
});

describe('detectMissingValidationRules', () => {
  const COMPLETE_CODE_CONVENTIONS = `# Code Conventions

## Naming Conventions

PascalCase for classes.

## Validation Rules

Frontend forms use Zod. Backend DTOs use class-validator at the controller boundary.

\`\`\`typescript
// CORRECT
@UsePipes(new ValidationPipe()) handler() {}
\`\`\`
`;

  const NO_VALIDATION_BODY = `# Code Conventions

## Naming Conventions

camelCase for variables.

## Error Handling

Throw typed errors.
`;

  it('returns null when no validation libraries are present (nothing to warn about)', () => {
    expect(detectMissingValidationRules(NO_VALIDATION_BODY, [])).toBeNull();
  });

  it('returns null when the body covers validation even without naming the lib', () => {
    // The body uses the word "validate" — that's enough to suppress the
    // soft signal. The synthesis at least attempted coverage.
    const body =
      '# Code Conventions\n\n## Input Hygiene\n\nValidate every payload at the controller boundary.';
    expect(detectMissingValidationRules(body, ['zod'])).toBeNull();
  });

  it('returns null when the body explicitly names a known library', () => {
    expect(
      detectMissingValidationRules(COMPLETE_CODE_CONVENTIONS, ['zod', 'class-validator']),
    ).toBeNull();
  });

  it('returns null on empty body (the validator covers that separately)', () => {
    expect(detectMissingValidationRules('', ['zod'])).toBeNull();
    expect(detectMissingValidationRules('   \n\n  ', ['zod'])).toBeNull();
  });

  it('returns a warning when libs are present but body says nothing about validation', () => {
    const warning = detectMissingValidationRules(NO_VALIDATION_BODY, ['zod', 'class-validator']);
    expect(warning).not.toBeNull();
    expect(warning).toContain('class-validator');
    expect(warning).toContain('zod');
    expect(warning).toContain('Re-run synthesis');
  });

  it('lists the libraries sorted, deterministic message', () => {
    const warning = detectMissingValidationRules(NO_VALIDATION_BODY, ['zod', 'joi', 'yup']);
    expect(warning).toContain('joi, yup, zod');
  });

  it('matches case-insensitively on the body content', () => {
    // "ZOD" in the body should be enough — we don't want a false warning
    // because the synthesizer typed Zod with a capital Z.
    const body = '# Code Conventions\n\n## ZOD usage\n\nUse ZOD on the boundary.';
    expect(detectMissingValidationRules(body, ['zod'])).toBeNull();
  });

  it('the gira regression: zod + class-validator detected, no validation rules section', () => {
    // Reproduces the exact 2026-05-04 gira scenario: a body covering
    // controllers/repos/error handling but no validation guidance.
    const giraLikeBody = `# Code Conventions

## Repository Pattern

Use the repository for all DB access.

## Error Handling

Throw HttpException subtypes.

## Gotchas

### Don't forget transaction rollback
`;
    const warning = detectMissingValidationRules(giraLikeBody, ['class-validator', 'zod']);
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/class-validator/);
    expect(warning).toMatch(/zod/);
  });
});
