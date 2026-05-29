/**
 * Branded types + error class for the portable-paths architecture.
 *
 * Why branded types: the framework's own absolute paths (e.g. `state.project_path`)
 * are runtime-only — they describe the developer's machine and must NEVER land
 * inside `.claude/` or `.codex/` artifacts that get committed and shipped to other
 * developers. Distinguishing AbsolutePath vs ProjectRelativePath at the type level
 * means a contributor cannot accidentally pass an absolute string into a writer
 * that's only supposed to emit relative content.
 */

declare const absoluteBrand: unique symbol;
declare const relativeBrand: unique symbol;

export type AbsolutePath = string & { readonly [absoluteBrand]: never };
export type ProjectRelativePath = string & { readonly [relativeBrand]: never };

/** Cast a known-absolute string to AbsolutePath. Use only at trusted boundaries. */
export function asAbsolutePath(p: string): AbsolutePath {
  return p as AbsolutePath;
}

/** Cast a known-relative string to ProjectRelativePath. Use only at trusted boundaries. */
export function asProjectRelativePath(p: string): ProjectRelativePath {
  return p as ProjectRelativePath;
}

/**
 * Thrown when content destined for a committed `.claude/` or `.codex/` artifact
 * would contain a non-portable absolute path (e.g. `/Users/foo/...`).
 *
 * Carries enough context to point the developer at the offending generator.
 */
export class PortabilityError extends Error {
  constructor(
    message: string,
    public readonly offendingPath: string,
    public readonly context?: { file?: string; field?: string; line?: number },
  ) {
    super(message);
    this.name = 'PortabilityError';
  }
}
