import { describe, expect, it } from 'vitest';
import type { ProjectInspection } from '../../../../../src/schemas/project-inspection.schema.js';
import { buildServiceSeedFromInspection } from '../../../../../src/services/framework/project-inspection/service-seed.js';

function makeInspection(partial: Partial<ProjectInspection>): ProjectInspection {
  return {
    generated_at: '2026-05-14T00:00:00Z',
    schema_version: 1,
    repository_type: 'monorepo',
    runtime_versions: {},
    lock_files: [],
    manifests: [],
    infrastructure: [],
    port_candidates: {},
    ...partial,
  };
}

describe('buildServiceSeedFromInspection', () => {
  it('returns an empty array on undefined input', () => {
    expect(buildServiceSeedFromInspection(undefined, '/p')).toEqual([]);
  });

  it('returns an empty array when inspection has no manifests', () => {
    expect(buildServiceSeedFromInspection(makeInspection({}), '/p')).toEqual([]);
  });

  it('derives id = basename(dirname(manifest.path)) for each manifest', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'package.json', path: 'web/package.json', raw: { name: 'web' } },
        { kind: 'package.json', path: 'api/package.json', raw: { name: 'api' } },
      ],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/abs/project');
    expect(seed.map((s) => s.id)).toEqual(['web', 'api']);
    expect(seed.map((s) => s.path)).toEqual(['web', 'api']);
  });

  it('uses the project basename as id for a root manifest', () => {
    const inspection = makeInspection({
      manifests: [{ kind: 'package.json', path: 'package.json', raw: {} }],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/abs/stride-origin');
    expect(seed).toHaveLength(1);
    expect(seed[0].id).toBe('stride-origin');
    expect(seed[0].path).toBe('.');
  });

  it('infers type=frontend from React/Next/Vue deps', () => {
    const inspection = makeInspection({
      manifests: [
        {
          kind: 'package.json',
          path: 'web/package.json',
          raw: { dependencies: { react: '18', next: '15' } },
        },
      ],
    });
    expect(buildServiceSeedFromInspection(inspection, '/p')[0].type).toBe('frontend');
  });

  it('infers type=backend from Express/FastAPI/Spring deps', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['express', { express: '4' }],
      ['fastapi', { fastapi: '0.110' }],
      ['gin', { gin: '1.9' }],
    ];
    for (const [_label, deps] of cases) {
      const inspection = makeInspection({
        manifests: [
          { kind: 'package.json', path: 'api/package.json', raw: { dependencies: deps } },
        ],
      });
      expect(buildServiceSeedFromInspection(inspection, '/p')[0].type).toBe('backend');
    }
  });

  it('infers type=serverless from firebase-functions / aws-lambda / wrangler', () => {
    const inspection = makeInspection({
      manifests: [
        {
          kind: 'package.json',
          path: 'firebase/functions/package.json',
          raw: { dependencies: { 'firebase-functions': '6' } },
        },
      ],
    });
    expect(buildServiceSeedFromInspection(inspection, '/p')[0].type).toBe('serverless');
  });

  it('infers type=cli from commander/click/clap deps', () => {
    const inspection = makeInspection({
      manifests: [
        {
          kind: 'package.json',
          path: 'tools/cli/package.json',
          raw: { dependencies: { commander: '14' } },
        },
      ],
    });
    expect(buildServiceSeedFromInspection(inspection, '/p')[0].type).toBe('cli');
  });

  it('falls back to type=library when no framework tokens match', () => {
    const inspection = makeInspection({
      manifests: [
        {
          kind: 'package.json',
          path: 'packages/utils/package.json',
          raw: { dependencies: {} },
        },
      ],
    });
    expect(buildServiceSeedFromInspection(inspection, '/p')[0].type).toBe('library');
  });

  it('resolves language from the manifest kind via the language-config registry', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'package.json', path: 'web/package.json', raw: {} },
        { kind: 'pyproject.toml', path: 'svc/pyproject.toml', raw: {} },
        { kind: 'go.mod', path: 'svc-go/go.mod', raw: {} },
      ],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/p');
    const byId = Object.fromEntries(seed.map((s) => [s.id, s.language]));
    expect(byId.web).toBe('javascript');
    expect(byId.svc).toBe('python');
    expect(byId['svc-go']).toBe('go');
  });

  it('deduplicates manifests that share an (id, path) pair (e.g., overlapping detection)', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'package.json', path: 'web/package.json', raw: {} },
        { kind: 'package.json', path: 'web/package.json', raw: {} },
      ],
    });
    expect(buildServiceSeedFromInspection(inspection, '/p')).toHaveLength(1);
  });

  it('keeps two services with same basename but different paths (no false dedupe)', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'package.json', path: 'apps/utils/package.json', raw: {} },
        { kind: 'package.json', path: 'libs/utils/package.json', raw: {} },
      ],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/p');
    expect(seed).toHaveLength(2);
    expect(seed.map((s) => s.path).sort()).toEqual(['apps/utils', 'libs/utils']);
  });

  it('is stack-agnostic — works on Rust + Java + Ruby manifests without changes', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'Cargo.toml', path: 'cli/Cargo.toml', raw: {} },
        { kind: 'pom.xml', path: 'service/pom.xml', raw: {} },
        { kind: 'Gemfile', path: 'app/Gemfile', raw: {} },
      ],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/p');
    const byId = Object.fromEntries(seed.map((s) => [s.id, s.language]));
    expect(byId.cli).toBe('rust');
    expect(byId.service).toBe('java');
    expect(byId.app).toBe('ruby');
  });

  it('disambiguates colliding basenames by prefixing with the parent segment (stride-origin case)', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'package.json', path: 'firebase/functions/package.json', raw: {} },
        { kind: 'package.json', path: 'functions/package.json', raw: {} },
      ],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/p');
    const ids = seed.map((s) => s.id).sort();
    // Exactly one of the two collides at basename `functions`; the framework
    // prepends the parent segment so the seed never produces duplicates.
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('functions');
    expect(ids).toContain('firebase-functions');
  });

  it('walks multiple segments when needed to break a 3-way collision', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'package.json', path: 'a/api/package.json', raw: {} },
        { kind: 'package.json', path: 'b/api/package.json', raw: {} },
        { kind: 'package.json', path: 'c/api/package.json', raw: {} },
      ],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/p');
    const ids = seed.map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(expect.arrayContaining(['a-api', 'b-api', 'c-api']));
  });

  it('leaves the basename id alone when there is no collision (regression guard)', () => {
    const inspection = makeInspection({
      manifests: [
        { kind: 'package.json', path: 'web/package.json', raw: {} },
        { kind: 'package.json', path: 'api/package.json', raw: {} },
      ],
    });
    const seed = buildServiceSeedFromInspection(inspection, '/p');
    expect(seed.map((s) => s.id).sort()).toEqual(['api', 'web']);
  });
});
