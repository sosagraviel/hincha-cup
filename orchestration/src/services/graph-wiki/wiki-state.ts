/**
 * Helpers for `docs/llm-wiki/.state.json`. The state file tracks the per-repo
 * commit shas the wiki was last refreshed against — `{ ".": <sha> }` for
 * single-repo or `{ <child-name>: <sha>, ... }` for multi-repo. All graph
 * state lives in `.code-review-graph/.state.json`, not here.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import type { WikiStateJson } from './types.js';

/**
 * Detect multi-repo layout: parent dir is a git repo OR is not (project root
 * with no `.git/`) but contains top-level child dirs that ARE git repos.
 * Mirrors the bash `is_multi_repo` in `scripts/lib/register-submodules.sh`:
 * a multi-repo workspace has nested top-level child git repos and no
 * `.gitmodules` at the parent.
 */
function discoverChildRepos(projectPath: string, frameworkPath: string): string[] {
  // If the parent has .gitmodules, it's a normal submodule layout — treat
  // as single-repo for wiki-state purposes (HEAD of parent moves with children).
  if (existsSync(join(projectPath, '.gitmodules'))) {
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(projectPath);
  } catch {
    return [];
  }

  const frameworkBase = basename(frameworkPath);
  const children: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    if (entry === frameworkBase) continue;
    const full = join(projectPath, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (!existsSync(join(full, '.git'))) continue;
    // Skip empty repos (no HEAD).
    if (gitHead(full) === null) continue;
    children.push(entry);
  }
  return children.sort();
}

function gitHead(repoPath: string): string | null {
  try {
    const out = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Build a fresh wiki state at HEAD. Used by Phase 4 (initial generation) and
 * by the `/wiki-refresh` skill after a successful refresh — the resulting
 * `repos` map records "wiki is in sync with this snapshot."
 */
export function buildWikiStateAtHead(projectPath: string, frameworkPath: string): WikiStateJson {
  const children = discoverChildRepos(projectPath, frameworkPath);
  const repos: Record<string, string> = {};

  if (children.length === 0) {
    // Single-repo: project root tracks one HEAD.
    repos['.'] = gitHead(projectPath) ?? 'unknown';
  } else {
    // Multi-repo: each child tracks its own HEAD.
    for (const child of children) {
      repos[child] = gitHead(join(projectPath, child)) ?? 'unknown';
    }
  }

  return {
    repos,
    last_refresh_at: new Date().toISOString(),
  };
}

export function readWikiState(projectPath: string): WikiStateJson | null {
  const path = join(projectPath, 'docs', 'llm-wiki', '.state.json');
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.repos &&
      typeof parsed.repos === 'object' &&
      typeof parsed.last_refresh_at === 'string'
    ) {
      return parsed as WikiStateJson;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeWikiState(projectPath: string, state: WikiStateJson): void {
  const path = join(projectPath, 'docs', 'llm-wiki', '.state.json');
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}
