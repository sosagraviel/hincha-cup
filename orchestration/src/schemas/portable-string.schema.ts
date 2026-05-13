/**
 * Zod refinement that refuses non-portable absolute paths in persisted JSON.
 *
 * Apply to any string field in a schema that describes content committed under
 * `.claude/` or `.codex/`. Phase 6's existing validators already re-parse those
 * files; refining the schema is sufficient to fail validation if a regression
 * embeds a `/Users/<name>/...` or `/home/<name>/...` value.
 *
 * Allowlist mirrors PortablePathResolver: `/tmp/`, URLs, and explicit example
 * fences are accepted.
 */
import { z } from 'zod';

const NON_PORTABLE_ABSOLUTE_PATTERN = /(?<![A-Za-z])\/(?:Users|home)\/[a-zA-Z][a-zA-Z0-9_.-]*\//;

const ALLOWLIST_HINT_PREFIXES = ['/tmp/', 'https://', 'http://', 'file://'];

function isPortableValue(s: string): boolean {
  if (!s) return true;
  if (ALLOWLIST_HINT_PREFIXES.some((p) => s.startsWith(p))) {
    return !NON_PORTABLE_ABSOLUTE_PATTERN.test(s.replace(/^https?:\/\/[^\/]+/, ''));
  }
  return !NON_PORTABLE_ABSOLUTE_PATTERN.test(s);
}

export const portableString = z.string().refine(isPortableValue, {
  message:
    'absolute machine-specific paths (/Users/<name>/... or /home/<name>/...) are not allowed in committed framework artifacts',
});
