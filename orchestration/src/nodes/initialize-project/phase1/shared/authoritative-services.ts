/**
 * Resolves the authoritative service list that downstream Phase 1 analyzers
 * (tech-stack, code-patterns, data-flows) inject into their prompts.
 *
 * Lookup order:
 *   1. The structure-architecture-analyzer's persisted output
 *      (`<tempDir>/phase1-outputs/01-structure-architecture.json`). This is
 *      the SINGLE SOURCE OF TRUTH once Phase 1 finishes.
 *   2. The Phase 0 project-inspection seed
 *      (`<tempDir>/project-inspection.json`). When the four analyzers run in
 *      parallel, the structure output may not exist yet — the seed provides
 *      a deterministic, inspection-derived service list so downstream
 *      analyzers can start immediately. Phase 2 reconciles drift via the
 *      `applyServiceIdRewritesToFindings` helper.
 *
 * Stack-agnostic: every field surfaced here (`id`, `path`, `type`,
 * `language`) is descriptive, not language- or framework-specific.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { readProjectInspection } from '../../../../services/framework/project-inspection/index.js';
import { buildServiceSeedFromInspection } from '../../../../services/framework/project-inspection/service-seed.js';

export interface AuthoritativeService {
  id: string;
  /** Relative path from repo root to the service directory. */
  path: string;
  /** Service role from structure-analyzer's enum (backend/frontend/library/etc.). */
  type?: string;
  /** Primary language for this service after normalization (lowercase canonical). */
  language?: string;
  /** Human-readable name from manifest or folder. Optional. */
  name?: string;
}

export interface LoadAuthoritativeServicesResult {
  services: AuthoritativeService[];
  /**
   * When neither the structure-analyzer output nor the Phase 0 inspection
   * seed can provide a service list, downstream analyzers fall back to
   * re-deriving their own list. The loader returns a soft `error` instead
   * of throwing so the node can decide its own failure semantics. Empty
   * when loading succeeds.
   */
  error?: string;
  /**
   * Provenance for the returned `services[]`. `structure` means the
   * structure-architecture-analyzer's persisted output supplied the list
   * (the canonical SSoT). `inspection-seed` means the Phase 0 inspection
   * derived a stack-agnostic seed because the structure output wasn't on
   * disk yet (parallel Phase 1 fan-out). Phase 2 consolidation reconciles
   * any seed-vs-structure drift before any artefact is generated.
   */
  source: 'structure' | 'inspection-seed' | 'none';
}

const STRUCTURE_OUTPUT_FILE = '01-structure-architecture.json';

/**
 * Loads the authoritative service list. Prefers
 * `<tempDir>/phase1-outputs/01-structure-architecture.json` when present;
 * otherwise falls back to the Phase 0 inspection-derived seed.
 *
 * Returns `{ services: [...], source: 'structure' }` on success, or
 * `{ services: [...], source: 'inspection-seed' }` when the structure
 * output isn't on disk yet. `error` is populated only when neither source
 * yields any usable services.
 */
export function loadAuthoritativeServices(tempDir: string): LoadAuthoritativeServicesResult {
  const fromStructure = loadFromStructureOutput(tempDir);
  if (fromStructure.services.length > 0) {
    return { services: fromStructure.services, source: 'structure' };
  }

  const projectPath = dirname(dirname(tempDir));
  const inspection = readProjectInspection(tempDir);
  const seed = buildServiceSeedFromInspection(inspection, projectPath);
  if (seed.length > 0) {
    return { services: seed, source: 'inspection-seed' };
  }

  const reasons: string[] = [];
  if (fromStructure.error) reasons.push(fromStructure.error);
  if (!inspection) reasons.push(`project-inspection.json missing under ${tempDir}`);
  else if (seed.length === 0) reasons.push('inspection seed yielded zero services');

  return {
    services: [],
    source: 'none',
    error:
      reasons.length > 0
        ? reasons.join(' | ')
        : 'no authoritative services available from structure output or inspection seed',
  };
}

interface StructureLoadResult {
  services: AuthoritativeService[];
  error?: string;
}

function loadFromStructureOutput(tempDir: string): StructureLoadResult {
  const outputPath = join(tempDir, 'phase1-outputs', STRUCTURE_OUTPUT_FILE);
  if (!existsSync(outputPath)) {
    return {
      services: [],
      error: `structure-analyzer output not found at ${outputPath}`,
    };
  }

  let raw: string;
  try {
    raw = readFileSync(outputPath, 'utf-8');
  } catch (err) {
    return { services: [], error: `failed to read ${outputPath}: ${(err as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      services: [],
      error: `failed to parse ${outputPath} as JSON: ${(err as Error).message}`,
    };
  }

  if (!isObject(parsed)) {
    return { services: [], error: `${outputPath} is not a JSON object` };
  }

  const findings = (parsed as Record<string, unknown>).findings;
  if (!isObject(findings)) {
    return { services: [], error: `${outputPath} missing findings object` };
  }

  const rawServices = (findings as Record<string, unknown>).services;
  if (!Array.isArray(rawServices)) {
    return { services: [], error: `${outputPath} missing findings.services array` };
  }

  const services: AuthoritativeService[] = [];
  for (const entry of rawServices) {
    if (!isObject(entry)) continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const path = typeof entry.path === 'string' ? entry.path.trim() : '';
    if (!id) continue;
    services.push({
      id,
      path,
      type: typeof entry.type === 'string' ? entry.type : undefined,
      language: typeof entry.language === 'string' ? entry.language : undefined,
      name: typeof entry.name === 'string' ? entry.name : undefined,
    });
  }

  if (services.length === 0) {
    return {
      services: [],
      error: `${outputPath} contains no usable services (each must have an id)`,
    };
  }

  return { services };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
