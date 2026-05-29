/**
 * Shared extractor helpers for runtime-version detectors. Each language
 * config calls these when declaring its `runtimeVersionFiles` entries.
 */

export const trim = (s: string | null | undefined): string | null => {
  if (s == null) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
};

export const firstLine = (s: string): string | null => trim(s.split('\n')[0]);

export const regexFirstGroup =
  (re: RegExp) =>
  (contents: string): string | null => {
    const m = contents.match(re);
    return m ? trim(m[1] ?? null) : null;
  };
