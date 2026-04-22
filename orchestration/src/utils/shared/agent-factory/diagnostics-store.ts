import path from 'path';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { logger } from '../../logger.js';
import { resolveTempPath } from '../../provider-paths.js';

/**
 * Per-attempt diagnostic artifacts written under the active provider's temp
 * directory:
 *   Claude: <projectPath>/.claude-temp/<agentName>/<sessionId>/attempt-<N>/
 *   Codex:  <projectPath>/.codex-temp/<agentName>/<sessionId>/attempt-<N>/
 *
 * Always saved on failure (exit != 0, parse error, or external validation error).
 * Saved on success only when FRAMEWORK_DEBUG is truthy (e.g. `--debug` flag).
 */
export interface AttemptDiagnostics {
  projectPath: string;
  agentName: string;
  sessionId: string;
  attemptNumber: number;
  outcome: 'success' | 'failure';
  prompt?: string;
  stdout?: string;
  stderr?: string;
  output?: string;
  errorMessage?: string;
  validationErrors?: string[];
  meta?: Record<string, unknown>;
}

const MAX_STREAM_BYTES = 4 * 1024 * 1024; // 4 MB cap per stream

export function isDebugEnabled(): boolean {
  const raw = process.env.FRAMEWORK_DEBUG;
  if (!raw) return false;
  return raw !== '0' && raw.toLowerCase() !== 'false' && raw !== '';
}

export function getAttemptDir(
  projectPath: string,
  agentName: string,
  sessionId: string,
  attemptNumber: number,
): string {
  return resolveTempPath(projectPath, agentName, sessionId, `attempt-${attemptNumber}`);
}

function truncate(s: string | undefined, cap = MAX_STREAM_BYTES): string | undefined {
  if (s === undefined) return undefined;
  if (s.length <= cap) return s;
  return s.slice(0, cap) + `\n\n…[truncated ${s.length - cap} bytes]`;
}

/**
 * Save attempt diagnostics to disk. Swallows its own errors — diagnostics are
 * best-effort and must never mask the original failure.
 *
 * Always writes. Cleanup of attempt dirs from ultimately-successful attempts is
 * done by `cleanupAttemptDir` from the retry layer when FRAMEWORK_DEBUG is off.
 *
 * Merges into an existing meta.json so validation-failure callers (retry layer)
 * don't clobber the transport meta written by the agent impl.
 */
export async function saveAttemptDiagnostics(d: AttemptDiagnostics): Promise<string | null> {
  const dir = getAttemptDir(d.projectPath, d.agentName, d.sessionId, d.attemptNumber);
  try {
    await mkdir(dir, { recursive: true });

    const writes: Promise<unknown>[] = [];
    if (d.prompt !== undefined)
      writes.push(writeFile(path.join(dir, 'prompt.txt'), d.prompt, 'utf-8'));
    if (d.stdout !== undefined)
      writes.push(writeFile(path.join(dir, 'stdout.txt'), truncate(d.stdout) ?? '', 'utf-8'));
    if (d.stderr !== undefined)
      writes.push(writeFile(path.join(dir, 'stderr.txt'), truncate(d.stderr) ?? '', 'utf-8'));
    if (d.output !== undefined)
      writes.push(writeFile(path.join(dir, 'output.txt'), truncate(d.output) ?? '', 'utf-8'));
    if (d.errorMessage !== undefined)
      writes.push(writeFile(path.join(dir, 'error.txt'), d.errorMessage, 'utf-8'));
    if (d.validationErrors && d.validationErrors.length > 0) {
      writes.push(
        writeFile(path.join(dir, 'validation-errors.txt'), d.validationErrors.join('\n'), 'utf-8'),
      );
    }

    let existingMeta: Record<string, unknown> = {};
    try {
      const prev = await readFile(path.join(dir, 'meta.json'), 'utf-8');
      existingMeta = JSON.parse(prev) as Record<string, unknown>;
    } catch {
      // No prior meta — first writer in this attempt dir.
    }

    const meta = {
      ...existingMeta,
      agentName: d.agentName,
      sessionId: d.sessionId,
      attemptNumber: d.attemptNumber,
      outcome: d.outcome,
      timestamp: new Date().toISOString(),
      ...(d.meta ?? {}),
    };
    writes.push(writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8'));

    await Promise.all(writes);
    return dir;
  } catch (err) {
    logger.warn(
      `Failed to save diagnostics to ${dir}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Remove an attempt directory after a successful validation. No-op in debug mode
 * so troubleshooting artifacts remain. Swallows its own errors.
 */
export async function cleanupAttemptDir(
  projectPath: string,
  agentName: string,
  sessionId: string,
  attemptNumber: number,
): Promise<void> {
  if (isDebugEnabled()) return;

  const dir = getAttemptDir(projectPath, agentName, sessionId, attemptNumber);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (err) {
    logger.warn(
      `Failed to cleanup diagnostics dir ${dir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Extract a short, human-readable error summary from CLI output, without
 * echoing the prompt back. We look for explicit API error envelopes first,
 * then fall back to the last non-empty lines of stderr.
 */
export function summarizeCliError(stdout: string, stderr: string, maxLines = 6): string {
  const lines: string[] = [];

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
