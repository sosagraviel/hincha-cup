/**
 * Extract a short, human-readable error summary from CLI output, without
 * echoing the prompt back. Moved verbatim from the legacy diagnostics-store
 * module so the new debug-store package is self-contained.
 */
export function summarizeCliError(stdout: string, stderr: string, maxLines = 6): string {
  const apiErrorRe = /^ERROR:\s*\{[\s\S]*?\}/m;
  const stderrMatch = stderr.match(apiErrorRe);
  const stdoutMatch = stdout.match(apiErrorRe);
  const apiError = stderrMatch?.[0] ?? stdoutMatch?.[0];
  if (apiError) {
    const parsed = tryParseError(apiError);
    if (parsed) return parsed;
    return firstLines(apiError, maxLines);
  }

  const tail = tailLines(stderr || stdout, maxLines);
  if (tail) return tail;

  return 'CLI exited with a non-zero code (no error output captured)';
}

function tryParseError(raw: string): string | null {
  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart < 0) return null;
    const obj = JSON.parse(raw.slice(jsonStart)) as {
      error?: { code?: string; message?: string; type?: string };
    };
    const e = obj.error;
    if (!e) return null;
    const code = e.code ? `[${e.code}] ` : '';
    const type = e.type ? ` (${e.type})` : '';
    return `${code}${e.message ?? 'unknown error'}${type}`;
  } catch {
    return null;
  }
}

function tailLines(text: string, count: number): string {
  if (!text) return '';
  const lines = text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);
  return lines.slice(-count).join('\n');
}

function firstLines(text: string, count: number): string {
  const lines = text.split('\n');
  return lines.slice(0, count).join('\n');
}
