/**
 * Testing-stack derivation.
 *
 * `deriveTestingRunners`: project-wide list of detected test runners.
 * `deriveTestingFrameworksByService`: per-service test-framework map.
 * `deriveTestingProjectSummary`: templated 1–2 sentence baseline.
 *
 * Stack-agnostic: every detection flows through the registry's
 * `testRunners` token list × manifest deps.
 */

import { extractDepsFromManifest } from './extract-deps.js';
import { matchStringTokens } from './registry-lookup.js';
import { allToolTokens } from '../language-config/index.js';
import type { DeriveInput, DerivedTestingFrameworks, DeriveServiceRef } from './types.js';

export function deriveTestingRunners(input: DeriveInput): string[] {
  const deps = collectAllDeps(input);
  return matchStringTokens(deps, allToolTokens('testRunners'));
}

export function deriveTestingFrameworksByService(
  input: DeriveInput,
): Record<string, DerivedTestingFrameworks> {
  const services = input.services ?? servicesFromManifests(input);
  const out: Record<string, DerivedTestingFrameworks> = {};
  const tokens = allToolTokens('testRunners');

  for (const svc of services) {
    const svcManifests = input.inspection.manifests.filter((m) => {
      const dir = m.path.slice(0, m.path.length - m.kind.length).replace(/\/+$/, '');
      const svcPath = svc.path.replace(/\/+$/, '');
      return dir === svcPath || m.path === `${svcPath}/${m.kind}` || dir === `./${svcPath}`;
    });
    const deps = new Set<string>();
    for (const m of svcManifests) {
      for (const d of extractDepsFromManifest(m)) deps.add(d);
    }
    const runners = matchStringTokens(Array.from(deps), tokens);
    if (runners.length === 0) continue;
    const e2eIdx = runners.findIndex((r) => /playwright|cypress|selenium|webdriver/i.test(r));
    const frameworks: { unit?: string; integration?: string; e2e?: string } = {};
    if (runners[0] && !isE2eToken(runners[0])) frameworks.unit = runners[0];
    if (e2eIdx !== -1) frameworks.e2e = runners[e2eIdx];
    const integration = runners.find((r, i) => i !== 0 && i !== e2eIdx && !isE2eToken(r));
    if (integration) frameworks.integration = integration;
    if (Object.keys(frameworks).length > 0) out[svc.id] = frameworks as DerivedTestingFrameworks;
  }
  return out;
}

export function deriveTestingProjectSummary(
  _input: DeriveInput,
  runners: ReadonlyArray<string>,
): string {
  if (runners.length === 0) return 'No automated test runner detected.';
  const e2e = runners.filter(isE2eToken);
  const unit = runners.filter((r) => !isE2eToken(r));
  const parts: string[] = [];
  if (unit.length > 0) parts.push(`Unit / integration: ${unit.join(', ')}`);
  if (e2e.length > 0) parts.push(`End-to-end: ${e2e.join(', ')}`);
  return parts.join('. ') + '.';
}

function isE2eToken(token: string): boolean {
  return /playwright|cypress|selenium|webdriver/i.test(token);
}

function collectAllDeps(input: DeriveInput): string[] {
  const all = new Set<string>();
  for (const m of input.inspection.manifests) {
    for (const d of extractDepsFromManifest(m)) all.add(d);
  }
  return Array.from(all);
}

function servicesFromManifests(input: DeriveInput): DeriveServiceRef[] {
  const seen = new Set<string>();
  const out: DeriveServiceRef[] = [];
  for (const m of input.inspection.manifests) {
    const dir = m.path.slice(0, m.path.length - m.kind.length).replace(/\/+$/, '') || '.';
    if (seen.has(dir)) continue;
    seen.add(dir);
    const id = dir === '.' ? 'root' : (dir.split('/').pop() ?? 'root');
    out.push({ id, path: dir });
  }
  return out;
}
