import { describe, expect, it } from 'vitest';
import { buildCatalogFromConsolidation } from '../../../../../src/nodes/initialize-project/phase3/helpers/build-catalog-from-consolidation.js';

/**
 * Assemble a deterministic CommandCatalog from the Phase 2
 * consolidation blob. These tests pin the input-shape tolerance
 * + per-tier extraction guarantees.
 */

describe('buildCatalogFromConsolidation', () => {
  it('returns an empty catalog on empty / non-object input', () => {
    expect(buildCatalogFromConsolidation(undefined).command_catalog).toEqual({});
    expect(buildCatalogFromConsolidation(null).command_catalog).toEqual({});
    expect(buildCatalogFromConsolidation(42).command_catalog).toEqual({});
    expect(buildCatalogFromConsolidation({}).command_catalog).toEqual({});
  });

  it('extracts automation makefiles + targets and routes them to wrapper-tier entries', () => {
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
                { name: 'tests', group: 'test', description: 'Run all tests.' },
              ],
            },
          ],
        },
      },
    };
    const bundle = buildCatalogFromConsolidation(consolidation);
    expect(bundle.command_catalog.setup?.[0]).toMatchObject({
      tier: 'wrapper',
      command: 'make setup',
      description: 'Full dev environment setup (install, docker, keycloak, seed)',
    });
    expect(bundle.command_catalog.run_tests?.[0]).toMatchObject({
      tier: 'wrapper',
      command: 'make tests',
    });
    expect(bundle.automation?.makefiles).toHaveLength(1);
  });

  it('extracts per-service build_tools commands and emits package_manager-tier entries', () => {
    const consolidation = {
      consolidated_findings: {
        build_tools: {
          backend: {
            tool: 'tsc',
            config_file: 'services/backend/package.json',
            test_command: 'pnpm --filter backend test',
            build_command: 'pnpm --filter backend build',
            lint_command: 'pnpm --filter backend lint',
            format_command: 'pnpm --filter backend format',
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
    const catalog = buildCatalogFromConsolidation(consolidation).command_catalog;
    const testEntries = catalog.run_tests ?? [];
    expect(testEntries).toHaveLength(2);
    expect(testEntries.every((e) => e.tier === 'package_manager')).toBe(true);
    expect(testEntries.map((e) => e.per_service).sort()).toEqual(['backend', 'web-frontend']);
    expect(catalog.run_lint?.[0].command).toBe('pnpm --filter backend lint');
    expect(catalog.run_lint?.[0].source).toBe('services/backend/package.json');
  });

  it('lists wrapper-tier entries before package_manager-tier for the same op', () => {
    const consolidation = {
      consolidated_findings: {
        automation: {
          makefiles: [
            {
              path: 'Makefile',
              targets: [
                {
                  name: 'tests',
                  group: 'test',
                  description: 'Run all tests (unit, integration, e2e).',
                },
              ],
            },
          ],
        },
        build_tools: {
          backend: {
            config_file: 'services/backend/package.json',
            test_command: 'pnpm --filter backend test',
          },
        },
      },
    };
    const catalog = buildCatalogFromConsolidation(consolidation).command_catalog;
    const tests = catalog.run_tests!;
    expect(tests[0].tier).toBe('wrapper');
    expect(tests[0].command).toBe('make tests');
    expect(tests[1].tier).toBe('package_manager');
    expect(tests[1].command).toBe('pnpm --filter backend test');
  });

  it('extracts README run-sections verbatim and routes their command lines to readme-tier', () => {
    const consolidation = {
      consolidated_findings: {
        readme_run_sections: [
          {
            path: 'README.md',
            heading: 'Getting Started',
            body: '```sh\npnpm install\npnpm dev\n```',
            fenced_blocks: ['pnpm install\npnpm dev'],
          },
        ],
      },
    };
    const bundle = buildCatalogFromConsolidation(consolidation);
    const setup = bundle.command_catalog.setup ?? [];
    const dev = bundle.command_catalog.start_dev ?? [];
    expect(setup.some((e) => e.tier === 'readme' && e.command === 'pnpm install')).toBe(true);
    expect(dev.some((e) => e.tier === 'readme' && e.command === 'pnpm dev')).toBe(true);
    expect(bundle.readme_run_sections).toHaveLength(1);
    expect(bundle.readme_run_sections?.[0].heading).toBe('Getting Started');
  });

  it('handles documented_commands.by_task as cross-service package-manager candidates', () => {
    const consolidation = {
      consolidated_findings: {
        documented_commands: {
          by_task: {
            dev: 'make dev',
            test: 'make test',
            build: 'make build',
          },
          source: 'makefile',
        },
      },
    };
    const catalog = buildCatalogFromConsolidation(consolidation).command_catalog;
    expect(catalog.start_dev?.some((e) => e.command === 'make dev')).toBe(true);
    expect(catalog.run_tests?.some((e) => e.command === 'make test')).toBe(true);
  });

  it('maps databases[].migration_commands to run_migrations entries', () => {
    const consolidation = {
      consolidated_findings: {
        databases: [
          {
            type: 'postgresql',
            migration_tool: 'TypeORM migrations',
            migration_commands: ['pnpm --filter backend migration:run'],
          },
        ],
      },
    };
    const catalog = buildCatalogFromConsolidation(consolidation).command_catalog;
    expect(catalog.run_migrations).toBeDefined();
    expect(catalog.run_migrations![0].command).toBe('pnpm --filter backend migration:run');
    expect(catalog.run_migrations![0].source).toBe('TypeORM migrations');
  });

  it('handles monorepo build_all_command / test_all_command as cross-service candidates', () => {
    const consolidation = {
      consolidated_findings: {
        monorepo: {
          enabled: true,
          tool: 'pnpm workspaces',
          package_manager: 'pnpm',
          workspace_config: 'pnpm-workspace.yaml',
          build_all_command: 'pnpm -r build',
          test_all_command: 'pnpm -r test',
        },
      },
    };
    const catalog = buildCatalogFromConsolidation(consolidation).command_catalog;
    expect(catalog.run_build?.some((e) => e.command === 'pnpm -r build')).toBe(true);
    expect(catalog.run_tests?.some((e) => e.command === 'pnpm -r test')).toBe(true);
  });

  it('tolerates legacy / malformed input shapes without throwing', () => {
    expect(
      buildCatalogFromConsolidation({
        consolidated_findings: {
          automation: 'not an object', // wrong type
          readme_run_sections: 'not an array',
          build_tools: ['not an object'],
        },
      }).command_catalog,
    ).toEqual({});
  });

  it('passes through structured Make targets without dropping fields', () => {
    const consolidation = {
      consolidated_findings: {
        automation: {
          makefiles: [
            {
              path: 'Makefile',
              targets: [{ name: 'launch', group: 'setup', description: 'Full reset.' }],
            },
          ],
        },
      },
    };
    const bundle = buildCatalogFromConsolidation(consolidation);
    expect(bundle.automation?.makefiles[0].targets[0]).toEqual({
      name: 'launch',
      group: 'setup',
      description: 'Full reset.',
    });
  });
});

/**
 * Analyzer-keyed consolidation shape.
 *
 * The Phase 2 consolidator emits `consolidated_findings` keyed by
 * analyzer slug (`01-structure-architecture`,
 * `02-tech-stack-dependencies`, etc.), with each value carrying
 * its own `findings` sub-object. A previous builder treated
 * `consolidated_findings` as flat-merged and silently produced an
 * empty catalog for every project. These tests pin the
 * analyzer-keyed contract end-to-end so the bug cannot return.
 *
 * Stack-agnostic: every fixture uses generic ids and structural
 * assertions only.
 */
describe('buildCatalogFromConsolidation: analyzer-keyed consolidation shape', () => {
  /**
   * Fixture representing the analyzer-keyed `phase2-consolidation.json`
   * the consolidator writes to disk. `automation` lives under the
   * structure analyzer's `findings`; `build_tools` and `monorepo`
   * live under the tech-stack analyzer's `findings`.
   */
  const giraShapeAnalyzerKeyed = {
    consolidated_findings: {
      '01-structure-architecture': {
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-05-06T00:00:00.000Z',
        findings: {
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
                ],
              },
            ],
          },
          readme_run_sections: [
            {
              path: 'README.md',
              heading: 'Getting Started',
              body: 'Run `make setup` then open localhost:2712.',
              fenced_blocks: ['make setup'],
            },
          ],
        },
      },
      '02-tech-stack-dependencies': {
        agent_name: 'tech-stack-dependencies-analyzer',
        timestamp: '2026-05-06T00:00:00.000Z',
        findings: {
          build_tools: {
            backend: {
              tool: 'NestJS CLI',
              config_file: 'services/backend/package.json',
              lint_command: 'eslint --max-warnings=0',
              format_command: 'prettier --write src',
              test_command: 'NODE_ENV=testing NODE_OPTIONS=--experimental-vm-modules jest',
              build_command: 'pnpm --filter @livonit/shared build && nest build',
            },
            'web-frontend': {
              tool: 'Vite',
              config_file: 'services/web-frontend/package.json',
              test_command: 'playwright test',
              build_command: 'tsc -b && vite build',
            },
          },
          monorepo: {
            enabled: true,
            tool: 'pnpm workspaces',
            package_manager: 'pnpm',
            workspace_config: 'pnpm-workspace.yaml',
            build_all_command: 'pnpm -r build',
            test_all_command: 'pnpm -r test',
          },
          databases: [
            {
              type: 'postgresql',
              migration_tool: 'TypeORM migrations',
              migration_commands: ['pnpm --filter backend migration:run'],
            },
          ],
        },
      },
    },
  };

  it('extracts automation from `01-structure-architecture.findings`', () => {
    const bundle = buildCatalogFromConsolidation(giraShapeAnalyzerKeyed);
    expect(bundle.automation?.makefiles).toHaveLength(1);
    expect(bundle.automation?.makefiles[0].targets.map((t) => t.name)).toEqual(['setup', 'tests']);
  });

  it('extracts readme_run_sections from `01-structure-architecture.findings`', () => {
    const bundle = buildCatalogFromConsolidation(giraShapeAnalyzerKeyed);
    expect(bundle.readme_run_sections).toHaveLength(1);
    expect(bundle.readme_run_sections?.[0].heading).toBe('Getting Started');
  });

  it('extracts build_tools per service from `02-tech-stack-dependencies.findings`', () => {
    const catalog = buildCatalogFromConsolidation(giraShapeAnalyzerKeyed).command_catalog;
    expect(catalog.run_lint?.some((e) => e.command === 'eslint --max-warnings=0')).toBe(true);
    // `test_command` keys route via `script_name: 'test'` → run_tests.
    // The command content (`playwright test`) is NOT re-classified —
    // the analyzer used the generic `test_command` slot for an e2e
    // tool, so we honour the slot. If e2e specificity matters, the
    // analyzer should expose a dedicated field downstream.
    expect(catalog.run_tests?.some((e) => e.command === 'playwright test')).toBe(true);
  });

  it('extracts monorepo build_all/test_all commands from the tech-stack slice', () => {
    const catalog = buildCatalogFromConsolidation(giraShapeAnalyzerKeyed).command_catalog;
    expect(catalog.run_build?.some((e) => e.command === 'pnpm -r build')).toBe(true);
    expect(catalog.run_tests?.some((e) => e.command === 'pnpm -r test')).toBe(true);
  });

  it('extracts databases[].migration_commands from the tech-stack slice', () => {
    const catalog = buildCatalogFromConsolidation(giraShapeAnalyzerKeyed).command_catalog;
    expect(catalog.run_migrations?.[0].command).toBe('pnpm --filter backend migration:run');
  });

  it('lists wrapper-tier `make tests` BEFORE per-service pnpm test commands', () => {
    const catalog = buildCatalogFromConsolidation(giraShapeAnalyzerKeyed).command_catalog;
    const tests = catalog.run_tests!;
    expect(tests[0]).toMatchObject({ tier: 'wrapper', command: 'make tests' });
  });

  it('produces a non-empty catalog for the realistic analyzer-keyed shape', () => {
    // The minimum bar: catalog must NOT be `{}`. A pre-fix builder
    // returned an empty object for every project, which manifested
    // as a "(no commands discovered)" placeholder.
    const catalog = buildCatalogFromConsolidation(giraShapeAnalyzerKeyed).command_catalog;
    const opCount = Object.keys(catalog).length;
    expect(opCount).toBeGreaterThan(0);
  });

  it('tolerates analyzer-keyed shape WITHOUT the optional `findings` wrapper (defensive)', () => {
    // Some legacy / partial fixtures inline the per-analyzer fields
    // directly under the analyzer key, no `findings` sub-object.
    // The walker should still find them via the flat-shape fallback.
    const consolidation = {
      consolidated_findings: {
        '02-tech-stack-dependencies': {
          build_tools: {
            api: {
              config_file: 'pyproject.toml',
              test_command: 'poetry run pytest',
            },
          },
        },
      },
    };
    const catalog = buildCatalogFromConsolidation(consolidation).command_catalog;
    // The flat-shape fallback in collectFindingsSources catches this.
    // The analyzer-keyed `.findings` slice is the primary shape; the
    // flat-on-analyzer shape still resolves via the
    // `consolidated_findings` fallback.
    expect(Object.keys(catalog).length).toBeGreaterThan(0);
  });

  it('merges fields across multiple analyzers without dropping any', () => {
    const consolidation = {
      consolidated_findings: {
        '01-structure-architecture': {
          findings: {
            automation: {
              makefiles: [{ path: 'Makefile', targets: [{ name: 'tests' }] }],
            },
          },
        },
        '02-tech-stack-dependencies': {
          findings: {
            build_tools: {
              backend: {
                config_file: 'package.json',
                test_command: 'pnpm test',
              },
            },
          },
        },
      },
    };
    const bundle = buildCatalogFromConsolidation(consolidation);
    expect(bundle.automation?.makefiles).toHaveLength(1);
    const tests = bundle.command_catalog.run_tests!;
    // Both wrapper (from 01) and package_manager (from 02) candidates appear.
    expect(tests.some((e) => e.tier === 'wrapper' && e.command === 'make tests')).toBe(true);
    expect(tests.some((e) => e.tier === 'package_manager' && e.command === 'pnpm test')).toBe(true);
  });
});
