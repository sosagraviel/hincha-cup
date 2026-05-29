import path from 'path';
import os from 'os';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../../../utils/logger.js';

/**
 * Translate an absolute POSIX path to Claude Code's project-slug convention.
 *
 * Claude's CLI stores JSONL transcripts at
 *   `~/.claude/projects/<slug>/<sessionId>.jsonl`
 * where `<slug>` is the absolute cwd with every `/` replaced by `-`.
 */
export function claudeProjectSlug(absPath: string): string {
  return absPath.replace(/\//g, '-');
}

/**
 * Poll for Claude's JSONL transcript for the given (projectPath, sessionId).
 *
 * Claude writes the transcript asynchronously after the subprocess exits, so
 * we retry briefly. Returns the absolute path or null if we give up.
 */
export async function locateClaudeTranscript(
  projectPath: string,
  sessionId: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const slug = claudeProjectSlug(path.resolve(projectPath));
  const base = path.join(os.homedir(), '.claude', 'projects', slug);
  const target = path.join(base, `${sessionId}.jsonl`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(target)) return target;
    await new Promise((r) => setTimeout(r, 100));
  }
  return existsSync(target) ? target : null;
}

/**
 * Find the newest Codex rollout file whose name includes the given session id.
 *
 * Codex rollouts are organized by year/month/day:
 *   $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<iso>-<sessionId>.jsonl
 * Honours $CODEX_HOME → fallback ~/.codex.
 */
export async function locateCodexRollout(
  sessionId: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
  const sessionsDir = path.join(codexHome, 'sessions');
  if (!existsSync(sessionsDir)) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = await searchRollout(sessionsDir, sessionId);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 150));
  }
  return searchRollout(sessionsDir, sessionId);
}

async function searchRollout(root: string, sessionId: string): Promise<string | null> {
  const entries = await safeReaddir(root);
  let newest: { path: string; mtime: number } | null = null;
  for (const yearEntry of entries) {
    if (!yearEntry.isDirectory()) continue;
    const yearPath = path.join(root, yearEntry.name);
    for (const monthEntry of await safeReaddir(yearPath)) {
      if (!monthEntry.isDirectory()) continue;
      const monthPath = path.join(yearPath, monthEntry.name);
      for (const dayEntry of await safeReaddir(monthPath)) {
        if (!dayEntry.isDirectory()) continue;
        const dayPath = path.join(monthPath, dayEntry.name);
        for (const file of await safeReaddir(dayPath)) {
          if (!file.isFile() || !file.name.endsWith('.jsonl')) continue;
          if (!file.name.includes(sessionId)) continue;
          const full = path.join(dayPath, file.name);
          const s = await stat(full).catch(() => null);
          const mtime = s?.mtimeMs ?? 0;
          if (!newest || mtime > newest.mtime) newest = { path: full, mtime };
        }
      }
    }
  }
  return newest?.path ?? null;
}

async function safeReaddir(dir: string): Promise<import('fs').Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function readFileIfExists(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf-8');
  } catch (err) {
    logger.warn(
      `[transcripts] unable to read ${p}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
