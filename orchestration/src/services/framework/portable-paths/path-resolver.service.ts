/**
 * Resolves absolute paths to project-relative form for committed artifacts.
 *
 * Scope: in-project absolutes are rewritten to relative; out-of-project absolutes
 * throw — they have no portable form and indicate an upstream bug. Allowlist
 * exceptions cover paths that are machine-agnostic by convention (`/tmp/...`),
 * URLs, and explicitly-marked example fences in markdown.
 *
 * The resolver is the single source of truth for "is this string portable?" —
 * the portable writer (next file) calls it on every value before flushing bytes.
 */
import { isAbsolute, relative, resolve } from 'path';

import type { AbsolutePath, ProjectRelativePath } from './types.js';
import { PortabilityError, asProjectRelativePath } from './types.js';

const NON_PORTABLE_ABSOLUTE_PATTERN = /(?<![A-Za-z])\/(?:Users|home)\/[a-zA-Z][a-zA-Z0-9_.-]*\//;

const ALLOWLIST_PREFIXES = ['/tmp/', 'https://', 'http://', 'file://'];

const EXAMPLE_FENCE_OPEN = '<!-- portable-example-start -->';
const EXAMPLE_FENCE_CLOSE = '<!-- portable-example-end -->';

export class PortablePathResolver {
  constructor(private readonly projectRoot: AbsolutePath) {}

  /**
   * Convert an in-project absolute path to project-relative.
   * Returns "." for the project root itself.
   * Throws PortabilityError if the path is outside the project root.
   */
  toProjectRelative(p: AbsolutePath): ProjectRelativePath {
    const abs = resolve(p);
    const rel = relative(this.projectRoot, abs);
    if (rel === '') {
      return asProjectRelativePath('.');
    }
    if (rel.startsWith('..')) {
      throw new PortabilityError(
        `Path "${p}" is outside the project root "${this.projectRoot}" — it has no portable form.`,
        p,
      );
    }
    return asProjectRelativePath(rel);
  }

  /**
   * Resolve a project-relative path back to absolute (for read-time consumers).
   */
  toAbsolute(p: ProjectRelativePath): AbsolutePath {
    return resolve(this.projectRoot, p) as AbsolutePath;
  }

  /**
   * True iff the string contains a non-portable absolute filesystem path.
   * Allowlist: /tmp/, URLs, and explicitly-fenced example regions.
   */
  isNonPortable(s: string): boolean {
    if (!s) return false;
    const stripped = stripExampleFences(s);
    return scanNonPortableAbsolute(stripped, ALLOWLIST_PREFIXES);
  }

  /**
   * Returns the project root (for callers that need to anchor a path computation).
   */
  getProjectRoot(): AbsolutePath {
    return this.projectRoot;
  }
}

function scanNonPortableAbsolute(content: string, allowlistPrefixes: string[]): boolean {
  let cursor = 0;
  while (cursor < content.length) {
    const match = NON_PORTABLE_ABSOLUTE_PATTERN.exec(content.slice(cursor));
    if (!match || match.index === undefined) return false;
    const absoluteStart = cursor + match.index;
    const matchedPrefix = match[0];
    const preceding = content.slice(Math.max(0, absoluteStart - 8), absoluteStart);
    const isLikelyUrl =
      preceding.endsWith('://') ||
      ALLOWLIST_PREFIXES.some((p) => p !== '/tmp/' && content.includes(p));
    if (!isLikelyUrl && !allowlistPrefixes.some((p) => matchedPrefix.startsWith(p))) {
      return true;
    }
    cursor = absoluteStart + matchedPrefix.length;
  }
  return false;
}

function stripExampleFences(content: string): string {
  if (!content.includes(EXAMPLE_FENCE_OPEN)) return content;
  let result = '';
  let cursor = 0;
  while (cursor < content.length) {
    const open = content.indexOf(EXAMPLE_FENCE_OPEN, cursor);
    if (open === -1) {
      result += content.slice(cursor);
      break;
    }
    result += content.slice(cursor, open);
    const close = content.indexOf(EXAMPLE_FENCE_CLOSE, open);
    cursor = close === -1 ? content.length : close + EXAMPLE_FENCE_CLOSE.length;
  }
  return result;
}

/** Test-only sanity wrapper for the export. */
export function _isValidAbsoluteForTesting(p: string): boolean {
  return isAbsolute(p);
}
