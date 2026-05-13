/**
 * Service-completeness validator. The structure-architecture-analyzer is
 * the single source of truth for service discovery; when it misses a
 * manifest-bearing directory every downstream phase loses that service.
 * This validator catches the case deterministically: it globs the project
 * for every manifest pattern in the language registry, dedupes candidates
 * by directory, then compares against the analyzer's
 * `findings.services[].path`.
 *
 * Stack-agnostic: never reads any source file, never matches on framework
 * names, and reuses the manifest patterns that drive Phase 0 inspection —
 * adding a new language to the registry automatically widens the discovery
 * surface.
 *
 * Recovery hatch: a candidate counts as covered when the analyzer's
 * `findings.needs_verification[]` cites the path verbatim, which is treated
 * as an explicit "saw this directory and decided not to list it" annotation.
 */

import fs from 'fs';
import path from 'path';
import { allManifestPatternsForDiscovery } from '../../../../../services/framework/language-config/index.js';
import {
  formatValidationError,
  type ValidationCodeKey,
} from '../../../shared/validation-codes/index.js';

export interface ServiceCompletenessViolation {
  /** Project-relative path to the candidate service directory. */
  path: string;
  /** Manifest filename (or wildcard pattern) that anchored the discovery. */
  manifest: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalise a path emitted by the analyzer for comparison: strip leading
 * `./`, trailing `/`, leading slashes (relative form), and collapse `\\`
 * to `/` for Windows-emitted values.
 */
function normaliseDir(input: string): string {
  let s = input.trim().replace(/\\/g, '/');
  s = s.replace(/^\.\/+/, '');
  s = s.replace(/^\/+/, '');
  s = s.replace(/\/+$/, '');
  if (s === '.') return '';
  return s;
}

/**
 * Match a relative path against the excluded-directory list. A path is
 * excluded when any of its segments equals an excluded name. The list
 * comes from the framework's standard exclusions
 * (`STANDARD_IGNORE_DIRS` + project gitignore).
 */
function isExcluded(relPath: string, excludedDirs: ReadonlyArray<string>): boolean {
  const segments = relPath.split('/');
  for (const seg of segments) {
    if (excludedDirs.includes(seg)) return true;
  }
  return false;
}

/**
 * Resolve a manifest pattern to a list of candidate directories under
 * `cwd`. Both exact filenames (`package.json`, `AndroidManifest.xml`)
 * and wildcard kinds (`*.xcodeproj`, `*.csproj`) are supported.
 *
 * Wildcard manifests can also be directories (Xcode `*.xcodeproj`) —
 * we check both file-form and directory-form matches.
 */
function findManifestDirs(
  pattern: string,
  cwd: string,
  excludedDirs: ReadonlyArray<string>,
): Array<{ dir: string; manifest: string }> {
  const out: Array<{ dir: string; manifest: string }> = [];
  const seen = new Set<string>();

  function walk(rel: string): void {
    const abs = path.join(cwd, rel);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (isExcluded(childRel, excludedDirs)) continue;

      const isMatch = matchesPattern(ent.name, pattern);
      if (isMatch) {
        const dir = rel;
        if (!seen.has(dir)) {
          seen.add(dir);
          out.push({ dir, manifest: ent.name });
        }
      }

      if (ent.isDirectory()) {
        if (isMatch && pattern.startsWith('*.')) continue;
        walk(childRel);
      }
    }
  }

  walk('');
  return out;
}

function matchesPattern(name: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1).toLowerCase();
    return name.toLowerCase().endsWith(ext);
  }
  return name === pattern;
}

/**
 * Extract every `findings.services[].path` from the analyzer output,
 * normalised. Tolerant of missing / malformed shapes — invalid entries
 * are silently dropped (the Zod schema catches them upstream).
 */
function extractListedServicePaths(data: unknown): Set<string> {
  const out = new Set<string>();
  if (!isObject(data)) return out;
  const findings = data.findings;
  if (!isObject(findings)) return out;
  const services = (findings as Record<string, unknown>).services;
  if (!Array.isArray(services)) return out;
  for (const svc of services) {
    if (isObject(svc) && typeof svc.path === 'string' && svc.path.length > 0) {
      out.add(normaliseDir(svc.path));
    }
  }
  return out;
}

/**
 * Collect every needs_verification entry's prose surface (question +
 * reason + each attempted_resolution string) into a single lower-cased
 * blob. The validator searches this for candidate-path mentions — when
 * the agent explicitly explains why a directory is not a service, that
 * directory counts as covered.
 */
function collectNeedsVerificationProse(data: unknown): string {
  if (!isObject(data)) return '';
  const items = data.needs_verification;
  if (!Array.isArray(items)) return '';
  const parts: string[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    for (const field of ['question', 'reason']) {
      const v = (item as Record<string, unknown>)[field];
      if (typeof v === 'string') parts.push(v);
    }
    const attempts = (item as Record<string, unknown>).attempted_resolution;
    if (Array.isArray(attempts)) {
      for (const a of attempts) if (typeof a === 'string') parts.push(a);
    }
  }
  return parts.join('\n').toLowerCase();
}

/**
 * Pure detector: returns every candidate service directory the analyzer
 * did not list AND did not explain away via needs_verification.
 *
 * `cwd` is the project root the structure analyzer ran against. The
 * Stop hook passes it verbatim from the hook input.
 */
export function detectServiceCompletenessViolations(
  data: unknown,
  cwd: string | undefined,
  excludedDirs: ReadonlyArray<string>,
): ServiceCompletenessViolation[] {
  if (!cwd) return [];
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) return [];

  const patterns = allManifestPatternsForDiscovery();
  const candidates = new Map<string, string>();
  for (const pattern of patterns) {
    for (const { dir, manifest } of findManifestDirs(pattern, cwd, excludedDirs)) {
      if (!candidates.has(dir)) candidates.set(dir, manifest);
    }
  }

  candidates.delete('');

  if (candidates.size === 0) return [];

  const listed = extractListedServicePaths(data);
  const proseBlob = collectNeedsVerificationProse(data);

  const violations: ServiceCompletenessViolation[] = [];
  for (const [dir, manifest] of candidates) {
    if (listed.has(dir)) continue;
    if (proseBlob.length > 0 && proseBlob.includes(dir.toLowerCase())) continue;
    violations.push({ path: dir, manifest });
  }

  violations.sort((a, b) => a.path.localeCompare(b.path));
  return violations;
}

/**
 * Render violations as `VALIDATION_E015_*` lines. The Stop hook calls
 * `blockWithFeedback(lines.join('\n'))` so the agent sees one block of
 * one-line directives.
 */
export function formatServiceCompletenessViolations(
  violations: ServiceCompletenessViolation[],
): string[] {
  if (violations.length === 0) return [];
  const code: ValidationCodeKey = 'E016_missing_service_paths';
  const pathList = violations.map((v) => `${v.path} (${v.manifest})`).join(', ');
  return [
    formatValidationError(code, {
      count: String(violations.length),
      paths: pathList,
    }),
  ];
}
