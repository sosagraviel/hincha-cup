/**
 * Single source of truth for the character classes that identify a
 * machine-specific (non-portable) absolute filesystem path.
 *
 * Several layers of the portability guarantee independently scan for
 * `/Users/<name>/...` and `/home/<name>/...`: the runtime path resolver, the
 * post-generation directory validator, the Zod string refinement, and the
 * synthesis-body validator. Deriving every matcher from the tokens here keeps
 * them from drifting apart.
 */

/**
 * Home-directory roots whose presence in an absolute path makes it
 * machine-specific. Shared so callers building their own matcher cannot drift
 * on which roots count.
 */
export const NON_PORTABLE_HOME_ROOTS = 'Users|home';

/**
 * Canonical detector for the leading `/Users/<name>/` or `/home/<name>/`
 * segment of a machine-specific absolute path. Matches anywhere in a string;
 * the negative lookbehind avoids matching inside a longer alphanumeric token.
 *
 * Non-global on purpose — callers use `.test()`/`.exec()` against fresh slices,
 * so a single shared instance carries no `lastIndex` state between calls.
 */
export const NON_PORTABLE_ABSOLUTE_PATTERN = new RegExp(
  `(?<![A-Za-z])/(?:${NON_PORTABLE_HOME_ROOTS})/[a-zA-Z][a-zA-Z0-9_.-]*/`,
);
