import { describe, expect, it } from 'vitest';
import {
  applyServiceIdRewritesToFindings,
  canonicalIdFromPath,
  computeServiceIdRewrites,
  normaliseServiceIds,
} from '../../../../../src/nodes/initialize-project/phase4/helpers/normalise-service-ids.js';

/**
 * Service-id normalisation.
 *
 * The structure analyzer occasionally emits graph-community names
 * (`src-app`, `chat-handle`) instead of folder basenames as
 * `services[].id`. Downstream consumers depend on stable,
 * predictable ids, so we rewrite to `slugify(basename(path))` and
 * propagate through every id-keyed map.
 *
 * Stack-agnostic — pure path manipulation.
 */

describe('canonicalIdFromPath', () => {
  it('returns the basename slugified', () => {
    expect(canonicalIdFromPath('services/backend')).toBe('backend');
    expect(canonicalIdFromPath('apps/web-frontend')).toBe('web-frontend');
    expect(canonicalIdFromPath('packages/shared')).toBe('shared');
    expect(canonicalIdFromPath('seeds/scripts')).toBe('scripts');
  });

  it('strips @scope segments (handles npm-style scoped paths)', () => {
    expect(canonicalIdFromPath('packages/@livonit/shared')).toBe('shared');
    expect(canonicalIdFromPath('@scope/pkg')).toBe('pkg');
  });

  it('lowercases mixed-case basenames and replaces non-alphanumeric runs', () => {
    expect(canonicalIdFromPath('services/MyBackend')).toBe('mybackend');
    expect(canonicalIdFromPath('services/foo.bar.baz')).toBe('foo-bar-baz');
    expect(canonicalIdFromPath('services/under_score_me')).toBe('under-score-me');
  });

  it('returns empty string for path-less inputs', () => {
    expect(canonicalIdFromPath('')).toBe('');
    expect(canonicalIdFromPath('.')).toBe('');
    expect(canonicalIdFromPath('/')).toBe('');
  });

  it('handles trailing / leading slashes', () => {
    expect(canonicalIdFromPath('/services/backend/')).toBe('backend');
  });
});

describe('computeServiceIdRewrites', () => {
  it('returns no rewrites when every id matches its basename', () => {
    const findings = {
      services: [
        { id: 'backend', path: 'services/backend' },
        { id: 'web-frontend', path: 'apps/web-frontend' },
      ],
    };
    expect(computeServiceIdRewrites([findings])).toEqual({});
  });

  it('detects graph-community ids and rewrites to folder basenames', () => {
    const findings = {
      services: [
        { id: 'src-app', path: 'services/backend' },
        { id: 'chat-handle', path: 'services/web-frontend' },
        { id: 'scripts-upsert', path: 'seeds/scripts' },
        { id: 'base-aggregation', path: 'packages/shared' },
        { id: 'keycloak', path: 'services/keycloak' }, // already canonical
      ],
    };
    expect(computeServiceIdRewrites([findings])).toEqual({
      'src-app': 'backend',
      'chat-handle': 'web-frontend',
      'scripts-upsert': 'scripts',
      'base-aggregation': 'shared',
      // `keycloak` -> `keycloak` is a no-op, omitted
    });
  });

  it('skips entries with missing path or non-string id', () => {
    const findings = {
      services: [
        { id: 'a', path: 'services/a' },
        { id: 'no-path' /* no path */ },
        { /* no id */ path: 'services/x' },
        { id: 42, path: 'services/y' },
      ],
    };
    expect(computeServiceIdRewrites([findings])).toEqual({});
  });

  it('first source wins when multiple analyzers disagree (rare in practice)', () => {
    const findingsA = { services: [{ id: 'src-app', path: 'services/backend' }] };
    const findingsB = { services: [{ id: 'src-app', path: 'apps/different' }] };
    expect(computeServiceIdRewrites([findingsA, findingsB])).toEqual({
      'src-app': 'backend',
    });
  });

  it('ignores non-array `services` field', () => {
    expect(computeServiceIdRewrites([{ services: 'not-array' }])).toEqual({});
    expect(computeServiceIdRewrites([{ services: null }])).toEqual({});
  });

  describe('collision safety', () => {
    /*
     * The Phase 4 stack-profile validator requires unique service IDs.
     * Two analyzer-emitted services that share the same path basename
     * (e.g. `firebase/functions` and `functions/` both canonicalise to
     * `functions`) MUST NOT both be rewritten to the same canonical id —
     * the rewrite would create duplicates and break
     * `StackProfileSchema.refine()`. The structure analyzer already
     * disambiguates these with multi-segment ids (`firebase-functions`),
     * so the safe behaviour is to keep the legacy ids when a rewrite
     * would introduce a collision.
     */
    it('skips both rewrites when two services would collapse onto the same canonical', () => {
      const findings = {
        services: [
          { id: 'firebase-functions', path: 'firebase/functions' },
          { id: 'app-functions', path: 'functions' },
        ],
      };
      expect(computeServiceIdRewrites([findings])).toEqual({});
    });

    it('still rewrites non-colliding services when one collision exists', () => {
      const findings = {
        services: [
          { id: 'firebase-functions', path: 'firebase/functions' },
          { id: 'app-functions', path: 'functions' },
          { id: 'web-frontend', path: 'apps/web-frontend' },
          { id: 'shared-lib', path: 'packages/shared' },
        ],
      };
      const rewrites = computeServiceIdRewrites([findings]);
      expect(rewrites).toEqual({ 'shared-lib': 'shared' });
    });

    it('skips a rewrite when the canonical id is already used by another service as its literal id', () => {
      // `path: 'a'` is already at id=`a`; `path: 'b/a'` would also normalise to `a`.
      // Rewriting the second would create a duplicate `a` id.
      const findings = {
        services: [
          { id: 'a', path: 'a' },
          { id: 'nested-a', path: 'b/a' },
        ],
      };
      expect(computeServiceIdRewrites([findings])).toEqual({});
    });

    it('handles the stride-origin 11-service shape end-to-end (regression)', () => {
      const findings = {
        services: [
          { id: 'web', path: 'web' },
          { id: 'firebase-functions', path: 'firebase/functions' },
          { id: 'python-functions', path: 'functions/python' },
          { id: 'functions-js', path: 'functions/js' },
          { id: 'stride-lib', path: 'packages/stride-lib' },
          { id: 'stride-lib-packed', path: 'packages/stride-lib/packed' },
          { id: 'firebase', path: 'firebase' },
          { id: 'functions', path: 'functions' },
          { id: 'devops', path: 'devops' },
          { id: 'crx', path: 'crx' },
          { id: 'firebase-migrations-migrator', path: 'firebase/migrations/migrator' },
          { id: 'python-logging-lib', path: 'functions/python/lib/logging' },
          { id: 'python-unit-tests', path: 'functions/python/unit_tests' },
        ],
      };
      const rewrites = computeServiceIdRewrites([findings]);
      // `firebase-functions` and `functions` collide on canonical=`functions` → both skipped.
      // `python-functions` and `python-logging-lib` produce distinct canonicals
      // (`python` vs `logging`) — both safe to rewrite.
      expect(rewrites['firebase-functions']).toBeUndefined();
      // Sanity: other unique services still get their basename normalisation.
      expect(rewrites['python-functions']).toBe('python');
      expect(rewrites['functions-js']).toBe('js');
      expect(rewrites['python-logging-lib']).toBe('logging');
      expect(rewrites['python-unit-tests']).toBe('unit-tests');
      // After applying these rewrites the final id set is unique.
      const finalIds = findings.services.map((s) => rewrites[s.id] ?? s.id);
      expect(new Set(finalIds).size).toBe(finalIds.length);
    });
  });
});

describe('applyServiceIdRewritesToFindings', () => {
  const rewrites = {
    'src-app': 'backend',
    'chat-handle': 'web-frontend',
  };

  it('rewrites services[].id in place', () => {
    const findings: Record<string, unknown> = {
      services: [
        { id: 'src-app', path: 'services/backend' },
        { id: 'chat-handle', path: 'services/web-frontend' },
        { id: 'keycloak', path: 'services/keycloak' },
      ],
    };
    applyServiceIdRewritesToFindings(findings, rewrites);
    const services = findings.services as Array<{ id: string }>;
    expect(services.map((s) => s.id)).toEqual(['backend', 'web-frontend', 'keycloak']);
  });

  it('rewrites top-level keys of build_tools', () => {
    const findings: Record<string, unknown> = {
      build_tools: {
        'src-app': { test_command: 'pnpm test' },
        'chat-handle': { build_command: 'vite build' },
        keycloak: { lint_command: 'eslint' },
      },
    };
    applyServiceIdRewritesToFindings(findings, rewrites);
    const bt = findings.build_tools as Record<string, unknown>;
    expect(Object.keys(bt).sort()).toEqual(['backend', 'keycloak', 'web-frontend']);
    expect((bt.backend as { test_command: string }).test_command).toBe('pnpm test');
    expect('src-app' in bt).toBe(false);
    expect('chat-handle' in bt).toBe(false);
  });

  it('rewrites dependencies.by_service keys', () => {
    const findings: Record<string, unknown> = {
      dependencies: {
        by_service: {
          'src-app': { production: ['express'] },
        },
      },
    };
    applyServiceIdRewritesToFindings(findings, rewrites);
    const deps = (findings.dependencies as { by_service: Record<string, unknown> }).by_service;
    expect('backend' in deps).toBe(true);
    expect('src-app' in deps).toBe(false);
  });

  it('rewrites custom *_by_service keys', () => {
    const findings: Record<string, unknown> = {
      patterns_by_service: {
        'src-app': { uses_repository_pattern: true },
      },
    };
    applyServiceIdRewritesToFindings(findings, rewrites);
    const patterns = findings.patterns_by_service as Record<string, unknown>;
    expect('backend' in patterns).toBe(true);
    expect('src-app' in patterns).toBe(false);
  });

  it('is a no-op when there are no rewrites', () => {
    const findings: Record<string, unknown> = {
      services: [{ id: 'backend', path: 'services/backend' }],
      build_tools: { backend: { test_command: 'pnpm test' } },
    };
    const before = JSON.stringify(findings);
    applyServiceIdRewritesToFindings(findings, {});
    expect(JSON.stringify(findings)).toBe(before);
  });

  it('preserves canonical entries when both legacy and canonical exist (defensive)', () => {
    const findings: Record<string, unknown> = {
      build_tools: {
        backend: { test_command: 'canonical-wins' },
        'src-app': { test_command: 'should-be-dropped' },
      },
    };
    applyServiceIdRewritesToFindings(findings, rewrites);
    const bt = findings.build_tools as Record<string, unknown>;
    expect((bt.backend as { test_command: string }).test_command).toBe('canonical-wins');
    expect('src-app' in bt).toBe(false);
  });
});

describe('normaliseServiceIds (full pipeline)', () => {
  it('rewrites an analyzer-keyed consolidation end-to-end', () => {
    const consolidation = {
      consolidated_findings: {
        '01-structure-architecture': {
          findings: {
            services: [
              { id: 'src-app', path: 'services/backend' },
              { id: 'chat-handle', path: 'services/web-frontend' },
            ],
          },
        },
        '02-tech-stack-dependencies': {
          findings: {
            build_tools: {
              'src-app': { test_command: 'pnpm test' },
              'chat-handle': { test_command: 'playwright test' },
            },
          },
        },
      },
    };
    const result = normaliseServiceIds(consolidation);
    expect(result.rewrites).toEqual({
      'src-app': 'backend',
      'chat-handle': 'web-frontend',
    });
    const cf = (result.consolidation as { consolidated_findings: Record<string, unknown> })
      .consolidated_findings;
    const sa = (
      cf['01-structure-architecture'] as { findings: { services: Array<{ id: string }> } }
    ).findings.services;
    expect(sa.map((s) => s.id)).toEqual(['backend', 'web-frontend']);
    const bt = (
      cf['02-tech-stack-dependencies'] as { findings: { build_tools: Record<string, unknown> } }
    ).findings.build_tools;
    expect(Object.keys(bt).sort()).toEqual(['backend', 'web-frontend']);
  });

  it('does not mutate the input', () => {
    const consolidation = {
      consolidated_findings: {
        '01-structure-architecture': {
          findings: { services: [{ id: 'src-app', path: 'services/backend' }] },
        },
      },
    };
    const before = JSON.stringify(consolidation);
    normaliseServiceIds(consolidation);
    expect(JSON.stringify(consolidation)).toBe(before);
  });

  it('returns a no-op result when every id is already canonical', () => {
    const consolidation = {
      consolidated_findings: {
        '01-structure-architecture': {
          findings: { services: [{ id: 'backend', path: 'services/backend' }] },
        },
      },
    };
    const result = normaliseServiceIds(consolidation);
    expect(result.rewrites).toEqual({});
  });
});
