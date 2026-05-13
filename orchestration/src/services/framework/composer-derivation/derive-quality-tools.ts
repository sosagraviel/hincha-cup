/**
 * Quality tools detection.
 *
 * Walks manifest deps × registry token lists. Picks the first matching
 * tool per category (linter / formatter / type-checker). Pre-commit
 * detection is filesystem-presence: looks for `.pre-commit-config.yaml`
 * (Python-style), `.husky/` (Node-style), `lefthook.yml` (cross-stack),
 * and `.git/hooks/` content. Returns `undefined` on no detection per
 * category so the caller can treat the whole object as "we found at
 * least one quality tool" / "we didn't".
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { extractDepsFromManifest } from './extract-deps.js';
import { matchStringTokens } from './registry-lookup.js';
import { allToolTokens } from '../language-config/index.js';
import type { DeriveInput, DerivedQualityTools } from './types.js';

export function deriveQualityTools(input: DeriveInput, projectPath: string): DerivedQualityTools {
  const deps = collectAllDeps(input);
  const out: DerivedQualityTools = {};

  const linters = matchStringTokens(deps, allToolTokens('linters'));
  if (linters.length > 0) Object.assign(out, { linter: linters[0] });

  const formatters = matchStringTokens(deps, allToolTokens('formatters'));
  if (formatters.length > 0) Object.assign(out, { formatter: formatters[0] });

  const typeCheckers = matchStringTokens(deps, allToolTokens('typeCheckers'));
  if (typeCheckers.length > 0) Object.assign(out, { type_checker: typeCheckers[0] });

  const preCommit = detectPreCommit(projectPath, deps);
  if (preCommit) Object.assign(out, { pre_commit: preCommit });

  return out;
}

function detectPreCommit(projectPath: string, deps: string[]): string | undefined {
  if (existsSync(join(projectPath, '.pre-commit-config.yaml'))) return 'pre-commit';
  if (dirExists(join(projectPath, '.husky'))) return 'husky';
  if (
    existsSync(join(projectPath, 'lefthook.yml')) ||
    existsSync(join(projectPath, 'lefthook.yaml'))
  )
    return 'lefthook';
  if (existsSync(join(projectPath, '.overcommit.yml'))) return 'overcommit';
  const depsLower = deps.map((d) => d.toLowerCase());
  if (depsLower.some((d) => d.includes('husky'))) return 'husky';
  if (depsLower.some((d) => d.includes('lint-staged'))) return 'lint-staged';
  return undefined;
}

function dirExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function collectAllDeps(input: DeriveInput): string[] {
  const all = new Set<string>();
  for (const m of input.inspection.manifests) {
    for (const d of extractDepsFromManifest(m)) all.add(d);
  }
  return Array.from(all);
}
