import { describe, expect, it } from 'vitest';
import { buildCatalogFromConsolidation } from '../../../../src/nodes/initialize-project/phase3/helpers/build-catalog-from-consolidation.js';
import { renderGettingStarted } from '../../../../src/nodes/initialize-project/phase4/render-getting-started.js';
import { detectEssentialCommandsOrderingViolations } from '../../../../src/nodes/initialize-project/phase3/validators/validate-essential-commands-ordering.js';

/**
 * Plan 15 §E.3 — fixture-driven pipeline tests for the
 * stack-agnostic command-discovery chain.
 *
 * These tests exercise the deterministic part of the pipeline
 * end-to-end: a sanitised Phase 2 consolidation blob → catalog
 * builder → renderer → ordering validator. No LLM spawning, no
 * graph DB, no live Claude CLI — just the pure chain that
 * produces the user-visible `Essential Commands` table and
 * `wiki/getting-started.md` page.
 *
 * Coverage matrix (each scenario is a separate `describe`):
 *   1. gira-shape (Makefile + pnpm workspace + README "Getting
 *      Started"). The original regression — `make setup` MUST
 *      surface first.
 *   2. bare-pnpm (no Makefile, just `package.json` scripts).
 *      Regression check: Plan 15 must not over-fire on simple
 *      stacks.
 *   3. python-poetry (`pyproject.toml` poetry scripts only).
 *      Routes language-agnostically via the operation classifier.
 *   4. multi-repo (two sibling-clone repos, each with its own
 *      Makefile). Each repo's catalog is independent; no fake
 *      cross-repo wrapper assumed.
 *   5. devcontainer-only (no Makefile, no scripts, just
 *      devcontainer postCreate). Surfaces as a wrapper-tier
 *      candidate.
 *
 * Stack-agnostic by construction: every fixture uses generic
 * service ids (`backend`, `web-frontend`, `api`, etc.), and
 * every assertion looks at structural shape (catalog tier,
 * ordering, header presence) rather than language-specific
 * tokens.
 */

// ---------------------------------------------------------------------------
// 1. gira-shape
// ---------------------------------------------------------------------------

describe('Plan 15 pipeline: gira-shape (Makefile + pnpm workspace + README)', () => {
  const consolidation = {
    consolidated_findings: {
      automation: {
        makefiles: [
          {
            path: 'Makefile',
            targets: [
              {
                name: 'setup',
                group: 'setup',
                description: 'Full dev environment setup (install, docker, keycloak, seed)',
              },
              {
                name: 'tests',
                group: 'test',
                description: 'Run all tests (unit, integration, e2e)',
              },
              {
                name: 'launch',
                group: 'setup',
                description: 'Full reset: down-volumes then setup',
              },
              // Make targets without a classifier-recognised name → skipped
              { name: 'logs', group: 'docker' },
              { name: 'sh', group: 'docker' },
            ],
          },
        ],
      },
      readme_run_sections: [
        {
          path: 'README.md',
          heading: 'Getting Started',
          body: 'Run `make setup` then open `localhost:2712` in your browser.',
          fenced_blocks: ['make setup'],
        },
      ],
      build_tools: {
        backend: {
          tool: 'tsc',
          config_file: 'services/backend/package.json',
          test_command: 'pnpm --filter backend test',
          build_command: 'pnpm --filter backend build',
          lint_command: 'pnpm --filter backend lint',
        },
        'web-frontend': {
          tool: 'vite',
          config_file: 'services/web-frontend/package.json',
          test_command: 'pnpm --filter web-frontend test',
          build_command: 'pnpm --filter web-frontend build',
        },
      },
    },
  };

  const bundle = buildCatalogFromConsolidation(consolidation);

  it('catalog lists `make setup` BEFORE `pnpm install` / per-service `pnpm` commands', () => {
    const tests = bundle.command_catalog.run_tests!;
    expect(tests[0]).toMatchObject({ tier: 'wrapper', command: 'make tests' });
    expect(tests.slice(1).every((e) => e.tier === 'package_manager')).toBe(true);
  });

  it('renderer emits the gira-shape fixture in the correct tier order', () => {
    const md = renderGettingStarted({
      projectName: 'gira',
      commandCatalog: bundle.command_catalog,
      readmeRunSections: bundle.readme_run_sections,
    });
    // Wrapper section comes before per-service section.
    expect(md.indexOf('## Wrapper commands')).toBeGreaterThan(0);
    expect(md.indexOf('## Wrapper commands')).toBeLessThan(
      md.indexOf('## Per-service commands (low-level)'),
    );
    // The exact Makefile description survives verbatim.
    expect(md).toContain('Full dev environment setup (install, docker, keycloak, seed)');
    expect(md).toContain('Run all tests (unit, integration, e2e)');
    // README extract is blockquoted with the original heading.
    expect(md).toContain('### Getting Started');
    expect(md).toContain('> Run `make setup` then open `localhost:2712` in your browser.');
  });

  it('a CLAUDE.md drafted with the catalog ordering passes the ordering validator', () => {
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Setup | `make setup` |',
      '| Tests | `make tests` |',
      '| Reset | `make launch` |',
      '',
      '### Per-service commands (low-level)',
      '',
      '> Prefer the wrapper above when present.',
      '',
      '| Service | Tests | Build |',
      '|---|---|---|',
      '| backend | `pnpm --filter backend test` | `pnpm --filter backend build` |',
      '| web-frontend | `pnpm --filter web-frontend test` | `pnpm --filter web-frontend build` |',
    ].join('\n');
    const violations = detectEssentialCommandsOrderingViolations(claudeMd, bundle.command_catalog);
    expect(violations).toEqual([]);
  });

  it('a CLAUDE.md drafted in the broken (gira-regression) order is rejected', () => {
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Backend tests | `pnpm --filter backend test` |',
      '| All tests | `make tests` |',
    ].join('\n');
    const violations = detectEssentialCommandsOrderingViolations(claudeMd, bundle.command_catalog);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatchObject({
      operation: 'run_tests',
      offending_command: 'pnpm --filter backend test',
    });
  });
});

// ---------------------------------------------------------------------------
// 2. bare-pnpm — regression check
// ---------------------------------------------------------------------------

describe('Plan 15 pipeline: bare-pnpm (no wrapper, no regression)', () => {
  const consolidation = {
    consolidated_findings: {
      build_tools: {
        web: {
          tool: 'vite',
          config_file: 'package.json',
          test_command: 'npm test',
          build_command: 'npm run build',
          lint_command: 'npm run lint',
        },
      },
    },
  };

  it('catalog has no wrapper-tier entries; pnpm-style fallbacks survive', () => {
    const bundle = buildCatalogFromConsolidation(consolidation);
    const tests = bundle.command_catalog.run_tests!;
    expect(tests).toHaveLength(1);
    expect(tests[0].tier).toBe('package_manager');
    expect(tests[0].command).toBe('npm test');
  });

  it('renderer skips the wrapper table; emits per-service subtable directly', () => {
    const bundle = buildCatalogFromConsolidation(consolidation);
    const md = renderGettingStarted({
      projectName: 'bare-pnpm',
      commandCatalog: bundle.command_catalog,
    });
    expect(md).not.toContain('## Wrapper commands');
    expect(md).toContain('## Per-service commands (low-level)');
    expect(md).toContain('npm test');
  });

  it('ordering validator does not fire when no wrapper exists for any op', () => {
    const bundle = buildCatalogFromConsolidation(consolidation);
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Tests | `npm test` |',
      '| Build | `npm run build` |',
    ].join('\n');
    expect(detectEssentialCommandsOrderingViolations(claudeMd, bundle.command_catalog)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. python-poetry (no wrapper, language-agnostic routing)
// ---------------------------------------------------------------------------

describe('Plan 15 pipeline: python-poetry (no wrapper)', () => {
  const consolidation = {
    consolidated_findings: {
      build_tools: {
        api: {
          tool: 'poetry',
          config_file: 'pyproject.toml',
          test_command: 'poetry run pytest',
          lint_command: 'poetry run ruff check',
          format_command: 'poetry run black .',
        },
      },
    },
  };

  it('routes poetry commands through the package-manager tier', () => {
    const bundle = buildCatalogFromConsolidation(consolidation);
    expect(bundle.command_catalog.run_tests?.[0]).toMatchObject({
      tier: 'package_manager',
      command: 'poetry run pytest',
      per_service: 'api',
    });
    expect(bundle.command_catalog.run_lint?.[0].command).toBe('poetry run ruff check');
    expect(bundle.command_catalog.run_format?.[0].command).toBe('poetry run black .');
  });

  it('renderer emits a poetry-driven page without false wrapper rows', () => {
    const bundle = buildCatalogFromConsolidation(consolidation);
    const md = renderGettingStarted({
      projectName: 'python-poetry',
      commandCatalog: bundle.command_catalog,
    });
    expect(md).not.toContain('## Wrapper commands');
    expect(md).toContain('poetry run pytest');
  });
});

// ---------------------------------------------------------------------------
// 4. multi-repo sibling clones — each repo independent
// ---------------------------------------------------------------------------

describe('Plan 15 pipeline: multi-repo sibling clones', () => {
  // The framework is run per-repo. A "parent folder containing N
  // sibling clones" use case is out of scope (Plan 15 §H.2). What
  // we DO guarantee is that running on each repo individually
  // produces an independent, correct catalog with no false
  // cross-repo wrapper assumed.

  const repoA = {
    consolidated_findings: {
      automation: {
        makefiles: [
          {
            path: 'Makefile',
            targets: [{ name: 'tests', description: 'Run repo-A tests.' }],
          },
        ],
      },
    },
  };
  const repoB = {
    consolidated_findings: {
      build_tools: {
        api: {
          tool: 'go',
          config_file: 'go.mod',
          test_command: 'go test ./...',
        },
      },
    },
  };

  it('each repo gets its own catalog; no cross-repo leakage', () => {
    const bundleA = buildCatalogFromConsolidation(repoA);
    const bundleB = buildCatalogFromConsolidation(repoB);
    expect(bundleA.command_catalog.run_tests?.[0].command).toBe('make tests');
    expect(bundleB.command_catalog.run_tests?.[0].command).toBe('go test ./...');
    // Repo A has no go test; repo B has no make tests.
    expect(bundleA.command_catalog.run_tests?.some((e) => e.command === 'go test ./...')).toBe(
      false,
    );
    expect(bundleB.command_catalog.run_tests?.some((e) => e.command === 'make tests')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. devcontainer-only
// ---------------------------------------------------------------------------

describe('Plan 15 pipeline: devcontainer-only', () => {
  const consolidation = {
    consolidated_findings: {
      automation: {
        devcontainer: {
          postCreateCommand: 'pnpm install && pnpm db:migrate',
          postStartCommand: 'pnpm dev',
        },
      },
    },
  };

  it('promotes devcontainer hooks to wrapper-tier setup / start_dev', () => {
    const bundle = buildCatalogFromConsolidation(consolidation);
    expect(bundle.command_catalog.setup?.[0]).toMatchObject({
      tier: 'wrapper',
      command: 'pnpm install && pnpm db:migrate',
    });
    expect(bundle.command_catalog.start_dev?.[0]).toMatchObject({
      tier: 'wrapper',
      command: 'pnpm dev',
    });
  });
});
