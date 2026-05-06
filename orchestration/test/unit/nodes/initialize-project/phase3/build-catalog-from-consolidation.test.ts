import { describe, expect, it } from 'vitest';
import { buildCatalogFromConsolidation } from '../../../../../src/nodes/initialize-project/phase3/helpers/build-catalog-from-consolidation.js';

/**
 * Plan 15 §D.4 — assemble a deterministic CommandCatalog from the
 * Phase 2 consolidation blob. These tests pin the input-shape
 * tolerance + per-tier extraction guarantees.
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

  it('lists wrapper-tier entries before package_manager-tier for the same op (gira-shape)', () => {
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
