/**
 * Reads the structure-architecture-analyzer's persisted output and returns
 * the canonical, authoritative service list that downstream Phase 1 analyzers
 * (02 tech-stack, 03 code-patterns, 04 data-flows) must consume verbatim.
 *
 * Single source of truth — see plans/2026-04-29-gira-init-run-audit-refactor.md
 * (findings F7, F8, F9, F22). The earlier parallel topology let every analyzer
 * re-derive its own service list, producing inconsistent IDs and dropped
 * services across runs. With the new sequential head, structure runs first
 * and persists `01-structure-architecture.json`; the downstream nodes call
 * `loadAuthoritativeServices()` before building their own prompts.
 *
 * Stack-agnostic: every field surfaced here (`id`, `path`, `type`, `language`)
 * is descriptive, not language- or framework-specific. Works on PHP monoliths,
 * .NET Framework solutions, Python services, Go binaries, Rust crates, or
 * any mix of legacy + modern stacks the same way.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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
   * When the structure-analyzer output cannot be loaded, the downstream
   * analyzer falls back to its prior behaviour (re-deriving its own service
   * list). This is the legacy path and SHOULD be fixed by the topology change,
   * but the loader returns a soft `error` instead of throwing so the node can
   * decide its own failure semantics. Empty when loading succeeds.
   */
  error?: string;
}

const STRUCTURE_OUTPUT_FILE = '01-structure-architecture.json';

/**
 * Loads the authoritative service list from `<tempDir>/phase1-outputs/01-structure-architecture.json`.
 *
 * Returns `{ services: [], error: string }` when the file is missing,
 * malformed, or contains zero services — the caller decides how to surface
 * that. Returns `{ services: [...] }` (no error) on success.
 */
export function loadAuthoritativeServices(tempDir: string): LoadAuthoritativeServicesResult {
  const outputPath = join(tempDir, 'phase1-outputs', STRUCTURE_OUTPUT_FILE);
  if (!existsSync(outputPath)) {
    return {
      services: [],
      error: `structure-analyzer output not found at ${outputPath} — downstream analyzer cannot inject authoritative services`,
    };
  }

  let raw: string;
  try {
    raw = readFileSync(outputPath, 'utf-8');
  } catch (err) {
    return {
      services: [],
      error: `failed to read ${outputPath}: ${(err as Error).message}`,
    };
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
