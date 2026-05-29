/**
 * Parse the `--ignore` flag value(s) into a sanitised string array.
 *
 * Accepts:
 *   - `undefined` / `null` (flag absent) → `{ paths: [] }`
 *   - a single string (one `--ignore` occurrence)
 *   - an array of strings (commander variadic form)
 *
 * Each value may itself be a comma-separated list of paths, for
 * shell-friendliness. Tokens are trimmed; leading and trailing slashes are
 * stripped (mirroring `.gitignore` convention where a leading `/` means
 * "anchored to repo root"); Windows backslashes are normalised to `/`; and
 * duplicates are removed.
 *
 * Rejects Windows drive-letter absolutes (`C:\…`), parent-directory escapes
 * (`..`), and glob characters (`*`, `?`, `[`, `]`) — keeps the surface
 * aligned with what `.gitignore` already supports (directory names matched
 * anywhere, or project-relative directory paths).
 */
export function parseIgnoreFlag(raw: unknown): { paths: string[]; error?: string } {
  if (raw === undefined || raw === null) return { paths: [] };
  const arr: string[] = Array.isArray(raw) ? raw : [String(raw)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of arr) {
    if (typeof entry !== 'string') continue;
    for (const token of entry.split(',')) {
      const original = token.trim();
      if (!original) continue;
      if (/^[a-zA-Z]:[\\/]/.test(original)) {
        return { paths: [], error: `absolute paths are not allowed: "${original}"` };
      }
      const trimmed = original.replace(/^[/\\]+|[/\\]+$/g, '');
      if (!trimmed) continue;
      if (trimmed.split(/[/\\]/).some((seg) => seg === '..')) {
        return { paths: [], error: `parent-directory traversal is not allowed: "${trimmed}"` };
      }
      if (/[*?[\]]/.test(trimmed)) {
        return { paths: [], error: `glob characters are not allowed: "${trimmed}"` };
      }
      const normalised = trimmed.replace(/[\\/]+/g, '/');
      if (!seen.has(normalised)) {
        seen.add(normalised);
        out.push(normalised);
      }
    }
  }
  return { paths: out };
}
