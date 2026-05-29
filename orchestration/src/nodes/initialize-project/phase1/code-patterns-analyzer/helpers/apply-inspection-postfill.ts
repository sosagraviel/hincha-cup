/**
 * Deterministic post-fill from `project-inspection.json` for the
 * code-patterns-testing-analyzer.
 *
 * Fills three fields the agent regularly leaves null/empty even though
 * inspection has authoritative data:
 *
 *   - `findings.documentation.readme` ← inspection.documentation.readme_paths.length > 0
 *   - `findings.documentation.contributing_guide` ← inspection.documentation.contributing_paths.length > 0
 *   - `findings.quality_tools.{linter, formatter, type_checker, pre_commit}`
 *     ← scan inspection.manifests[].raw dependencies for canonical name tokens.
 *
 * Contract: agent values win on conflicts (purely additive fill); silent
 * no-op when inspection is missing or malformed. Stack-agnostic.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { allToolTokens } from '../../../../../services/framework/language-config/index.js';

interface InspectionManifest {
  path: string;
  kind: string;
  raw?: Record<string, unknown> | null;
}

interface InspectionDocumentation {
  readme_paths?: string[];
  contributing_paths?: string[];
  docs_dirs?: string[];
}

interface ProjectInspection {
  manifests?: InspectionManifest[];
  documentation?: InspectionDocumentation;
}

/**
 * Framework-agnostic pre-commit tool tokens. Language-specific linter /
 * formatter / type-checker tokens come from the language-config registry.
 */
const PRE_COMMIT_TOKENS = ['husky', 'lefthook', 'pre-commit', 'overcommit', 'git-hooks-go'];

export function applyInspectionPostFill(
  data: unknown,
  tempDir: string | undefined,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  if (!tempDir) return base;

  const inspectionPath = join(tempDir, 'project-inspection.json');
  if (!existsSync(inspectionPath)) return base;

  let inspection: ProjectInspection;
  try {
    inspection = JSON.parse(readFileSync(inspectionPath, 'utf-8')) as ProjectInspection;
  } catch {
    return base;
  }

  const findings = isRecord(base.findings) ? base.findings : ({} as Record<string, unknown>);

  const docs = isRecord(findings.documentation)
    ? findings.documentation
    : ({} as Record<string, unknown>);

  const insDocs = inspection.documentation;
  if (insDocs) {
    const insHasReadme = Array.isArray(insDocs.readme_paths) && insDocs.readme_paths.length > 0;
    const insHasContrib =
      Array.isArray(insDocs.contributing_paths) && insDocs.contributing_paths.length > 0;
    if (insHasReadme && docs.readme !== true) {
      docs.readme = true;
    } else if (typeof docs.readme !== 'boolean') {
      docs.readme = insHasReadme;
    }
    if (insHasContrib && docs.contributing_guide !== true) {
      docs.contributing_guide = true;
    } else if (typeof docs.contributing_guide !== 'boolean') {
      docs.contributing_guide = insHasContrib;
    }
  }
  findings.documentation = docs;

  const quality = isRecord(findings.quality_tools)
    ? findings.quality_tools
    : ({} as Record<string, unknown>);

  const allDepNames = collectAllDependencyNames(inspection.manifests ?? []);

  fillFromTokens(quality, 'linter', allDepNames, allToolTokens('linters'));
  fillFromTokens(quality, 'formatter', allDepNames, allToolTokens('formatters'));
  fillFromTokens(quality, 'type_checker', allDepNames, allToolTokens('typeCheckers'));
  fillFromTokens(quality, 'pre_commit', allDepNames, PRE_COMMIT_TOKENS);

  findings.quality_tools = quality;
  base.findings = findings;
  return base;
}

/**
 * Walk every manifest's `raw` dependency sections and return the union of
 * declared package / library names. Stack-agnostic — pulls from any common
 * section name a manifest format uses.
 */
function collectAllDependencyNames(manifests: InspectionManifest[]): Set<string> {
  const names = new Set<string>();
  for (const m of manifests) {
    if (!m?.raw || !isRecord(m.raw)) continue;
    const sections = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
      'require',
      'require-dev',
      'tool',
      'project',
      'dev-dependencies',
      'build-dependencies',
    ];
    for (const key of sections) {
      const section = m.raw[key];
      if (!section) continue;
      if (isRecord(section)) {
        for (const dep of Object.keys(section)) {
          names.add(dep);
          const slashIdx = dep.indexOf('/');
          if (dep.startsWith('@') && slashIdx > 0) {
            names.add(dep.slice(slashIdx + 1));
          }
        }
        if (key === 'tool' || key === 'project') {
          for (const sub of Object.values(section)) {
            if (!isRecord(sub)) continue;
            for (const innerKey of ['dependencies', 'dev-dependencies', 'optional-dependencies']) {
              const inner = sub[innerKey];
              if (isRecord(inner)) {
                Object.keys(inner).forEach((n) => names.add(n));
              }
            }
          }
        }
      } else if (Array.isArray(section)) {
        for (const entry of section) {
          if (typeof entry === 'string') names.add(entry);
        }
      }
    }
  }
  return names;
}

function fillFromTokens(
  target: Record<string, unknown>,
  field: string,
  declaredNames: Set<string>,
  tokens: ReadonlyArray<string>,
): void {
  const existing = target[field];
  if (typeof existing === 'string') {
    const trimmed = existing.trim();
    const isSchemaDefault =
      trimmed.length === 0 || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'n/a';
    if (!isSchemaDefault) return;
  }

  for (const token of tokens) {
    if (declaredNames.has(token)) {
      target[field] = token;
      return;
    }
    for (const name of declaredNames) {
      if (name.startsWith(`${token}-`) || name.startsWith(`${token}_`)) {
        target[field] = token;
        return;
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
