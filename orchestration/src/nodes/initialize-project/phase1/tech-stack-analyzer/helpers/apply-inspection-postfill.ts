/**
 * Deterministic post-fill from `project-inspection.json` for the tech-stack
 * analyzer.
 *
 * Fills `findings.runtime_versions` and per-service `manager` when the agent
 * leaves them empty. The agent owns interpretation (notable frameworks,
 * classification); the framework owns the deterministic copy from inspection
 * into the output schema.
 *
 * Agent-emitted values are preserved — the post-fill only sets fields the
 * agent left empty / null. The agent can override for genuine corrections
 * on exotic monorepo shapes.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface InspectionLockFile {
  path: string;
  manager: string;
}

interface InspectionManifest {
  path: string;
  kind: string;
}

interface InspectionMonorepo {
  package_manager?: string;
}

interface ProjectInspection {
  runtime_versions?: Record<string, string>;
  lock_files?: InspectionLockFile[];
  manifests?: InspectionManifest[];
  monorepo?: InspectionMonorepo;
}

import { manifestKindToManagerMap } from '../../../../../services/framework/language-config/index.js';

/**
 * Manifest-kind → manager map computed from the centralized language-config
 * registry. Adding a new language with an unambiguous manager populates this
 * map automatically.
 */
const MANIFEST_KIND_TO_MANAGER: Record<string, string> = manifestKindToManagerMap();

/**
 * Mutates `data` in place to deterministically fill fields from
 * `<tempDir>/project-inspection.json`. Returns the same object (for
 * chaining). Silent no-op when the inspection file is missing or
 * malformed — the analyzer's pre-fill output stays unchanged.
 */
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

  if (inspection.runtime_versions && Object.keys(inspection.runtime_versions).length > 0) {
    const agentVersions: Record<string, string> = isRecord(findings.runtime_versions)
      ? (findings.runtime_versions as Record<string, string>)
      : {};
    const cleanedInspection: Record<string, string> = {};
    for (const [k, v] of Object.entries(inspection.runtime_versions)) {
      if (k === 'tool-versions-raw') continue;
      cleanedInspection[k] = v;
    }
    const merged: Record<string, string> = { ...cleanedInspection };
    for (const [k, v] of Object.entries(agentVersions)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        merged[k] = v;
      }
    }
    findings.runtime_versions = merged;
  }

  const deps = isRecord(findings.dependencies) ? findings.dependencies : null;
  if (deps) {
    const byService = isRecord(deps.by_service)
      ? (deps.by_service as Record<string, unknown>)
      : null;
    if (byService) {
      const lockFiles = Array.isArray(inspection.lock_files) ? inspection.lock_files : [];
      const manifests = Array.isArray(inspection.manifests) ? inspection.manifests : [];
      const fallbackManager = inspection.monorepo?.package_manager;

      for (const [serviceId, value] of Object.entries(byService)) {
        if (!isRecord(value)) continue;
        const existing = (value as Record<string, unknown>).manager;
        if (typeof existing === 'string' && existing.trim().length > 0) continue;

        let match: string | undefined;
        for (const lf of lockFiles) {
          if (!lf?.manager) continue;
          if (typeof lf.path === 'string' && lf.path.includes(serviceId)) {
            match = lf.manager;
            break;
          }
        }
        if (!match) {
          for (const m of manifests) {
            if (!m?.kind || !m?.path) continue;
            if (typeof m.path !== 'string' || !m.path.includes(serviceId)) continue;
            const fromKind = MANIFEST_KIND_TO_MANAGER[m.kind];
            if (fromKind) {
              match = fromKind;
              break;
            }
          }
        }
        if (!match && lockFiles.length === 1 && lockFiles[0]?.manager) {
          match = lockFiles[0].manager;
        }
        if (!match && fallbackManager) {
          match = fallbackManager;
        }
        if (match) {
          (value as Record<string, unknown>).manager = match;
        }
      }
    }
  }

  base.findings = findings;
  return base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
