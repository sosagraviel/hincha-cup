/**
 * Plan §E.5 (2026-05-05) — soft signal that the synthesis omitted a
 * "Validation Rules" section even though the dependency manifest tells
 * us the project ships at least one validation library.
 *
 * The 2026-05-04 gira run shipped a `code-conventions/SKILL.md` that
 * documented controllers, repositories, error handling, and gotchas —
 * but said nothing about Zod (frontend forms) vs class-validator
 * (backend DTOs), even though both packages were in the dependency tree.
 * Validation rules are load-bearing project knowledge: a developer who
 * learns the wrong layer's rule from the agent ships unsafe code.
 *
 * This is a SOFT warning by design, not a hard validation gate:
 *   - Synthesis is an LLM. It may legitimately omit this section on a
 *     project that has a validation lib in `package.json` but no actual
 *     validation pipeline.
 *   - We don't want to retry the entire 15-minute synthesis over a soft
 *     signal — the cost outweighs the benefit on a per-run basis.
 *   - The warning surfaces in the run log so the operator can re-run if
 *     they care, and bubbles into observability for fleet-level signal.
 */

/**
 * Lower-cased package names that signal a validation library is in use.
 * Cross-language (TypeScript/JavaScript, Python, etc.). Match is
 * substring-based against package strings so versioned forms like
 * `"zod@3.22.4"` and `"class-validator >=0.14.0"` both hit.
 */
export const VALIDATION_LIBRARIES = [
  'zod',
  'class-validator',
  'joi',
  'yup',
  'valibot',
  'ajv',
  'pydantic',
  'marshmallow',
  'cerberus',
] as const;

/**
 * Lower-cased tokens that, when present in `code-conventions/SKILL.md`,
 * indicate the synthesis at least attempted to cover validation. Any one
 * is enough to suppress the warning.
 */
const VALIDATION_BODY_TOKENS = [
  'validat', // covers "validation", "validate", "validator"
  'zod',
  'class-validator',
  'joi',
  'yup',
  'valibot',
  'ajv',
  'pydantic',
  'marshmallow',
];

/**
 * Inspect a dependency map and return the validation libraries detected.
 * Stack-agnostic: walks every value array and tests substring matches
 * against `VALIDATION_LIBRARIES`. The Phase 1 tech-stack analyzer
 * outputs lower-cased package names already, but the function
 * defensively lower-cases anyway so it's robust to fixture variations.
 *
 * @param dependencyArrays - Arrays of dependency strings, e.g. each
 *   `production` / `development` array under `dependencies.by_service`.
 *   Caller flattens by service.
 */
export function findValidationLibrariesInDependencies(
  dependencyArrays: ReadonlyArray<ReadonlyArray<string> | undefined>,
): string[] {
  const found = new Set<string>();
  for (const arr of dependencyArrays) {
    if (!arr) continue;
    for (const pkg of arr) {
      const haystack = pkg.toLowerCase();
      for (const lib of VALIDATION_LIBRARIES) {
        if (haystack.includes(lib)) {
          found.add(lib);
        }
      }
    }
  }
  return [...found].sort();
}

/**
 * Returns a single warning string when the conditions match, or `null`.
 *
 * Triggers when:
 *   1. `validationLibrariesPresent` is non-empty (Phase 1 saw at least
 *      one validation lib in the dependency tree).
 *   2. The rendered `code-conventions/SKILL.md` body contains NONE of
 *      the validation tokens — neither "validat", nor any of the lib
 *      names. The body could legitimately mention a lib in passing
 *      (e.g. "we use Zod" inside the gotchas section); that's enough.
 *
 * Operates on lower-cased content so we don't miss "Zod" vs "zod" etc.
 */
export function detectMissingValidationRules(
  codeConventionsContent: string,
  validationLibrariesPresent: ReadonlyArray<string>,
): string | null {
  if (validationLibrariesPresent.length === 0) return null;
  if (!codeConventionsContent || !codeConventionsContent.trim()) return null;

  const lower = codeConventionsContent.toLowerCase();
  const hasAnyToken = VALIDATION_BODY_TOKENS.some((token) => lower.includes(token));
  if (hasAnyToken) return null;

  const libs = [...validationLibrariesPresent].sort().join(', ');
  return [
    `code-conventions/SKILL.md does not mention validation rules, but the project ships these validation libraries: ${libs}.`,
    'Re-run synthesis to pick up a "## Validation Rules" section, or accept the gap if the libs are imported but unused.',
  ].join(' ');
}
