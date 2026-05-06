import { describe, expect, it } from 'vitest';
import { renderGettingStarted } from '../../../../../src/nodes/initialize-project/phase4/render-getting-started.js';
import type { CommandCatalog } from '../../../../../src/schemas/stack-profile.schema.js';

/**
 * Plan 15 §D.6 — deterministic getting-started.md renderer.
 *
 * Pure function. The output is the canonical "how to run this
 * project" wiki page. These tests pin the rendering contract so a
 * future cosmetic change can't drop a section that operators (and
 * agents) depend on.
 *
 * Stack-agnostic: every fixture uses generic ids and assertions
 * match on heading-shape patterns + structural rows, not on
 * language-specific tokens.
 */

const giraShapeCatalog: CommandCatalog = {
  setup: [
    {
      tier: 'wrapper',
      command: 'make setup',
      description: 'Full dev environment setup (install, docker, keycloak, seed)',
      source: 'Makefile',
    },
    {
      tier: 'package_manager',
      command: 'pnpm install',
      source: 'package.json',
      per_service: '_root',
    },
  ],
  run_tests: [
    {
      tier: 'wrapper',
      command: 'make tests',
      description: 'Run all tests (unit, integration, e2e)',
      source: 'Makefile',
    },
    {
      tier: 'package_manager',
      command: 'pnpm --filter backend test',
      source: 'services/backend/package.json',
      per_service: 'backend',
    },
    {
      tier: 'package_manager',
      command: 'pnpm --filter web-frontend test',
      source: 'services/web-frontend/package.json',
      per_service: 'web-frontend',
    },
  ],
  reset: [
    {
      tier: 'wrapper',
      command: 'make launch',
      description: 'Full reset: down-volumes then setup',
      source: 'Makefile',
    },
  ],
};

describe('renderGettingStarted', () => {
  it('renders title with project name', () => {
    const md = renderGettingStarted({
      projectName: 'gira',
      commandCatalog: giraShapeCatalog,
    });
    expect(md.split('\n')[0]).toBe('# Getting started — gira');
  });

  it('lists `make setup` BEFORE `pnpm install` (the gira regression contract)', () => {
    const md = renderGettingStarted({
      projectName: 'gira',
      commandCatalog: giraShapeCatalog,
    });
    const setupIdx = md.indexOf('make setup');
    const pnpmIdx = md.indexOf('pnpm install');
    expect(setupIdx).toBeGreaterThan(0);
    expect(pnpmIdx).toBeGreaterThan(0);
    expect(setupIdx).toBeLessThan(pnpmIdx);
  });

  it('preserves the wrapper description verbatim — no paraphrase', () => {
    const md = renderGettingStarted({
      projectName: 'gira',
      commandCatalog: giraShapeCatalog,
    });
    // The exact string from the Makefile comment must round-trip.
    expect(md).toContain('Full dev environment setup (install, docker, keycloak, seed)');
    expect(md).toContain('Run all tests (unit, integration, e2e)');
  });

  it('emits a "Per-service commands (low-level)" subtable with the warning sentence', () => {
    const md = renderGettingStarted({
      projectName: 'gira',
      commandCatalog: giraShapeCatalog,
    });
    expect(md).toContain('## Per-service commands (low-level)');
    expect(md).toContain('Prefer the wrapper above when present');
    expect(md).toContain('pnpm --filter backend test');
    expect(md).toContain('pnpm --filter web-frontend test');
    // per_service column carries the service id
    expect(md).toContain('| `backend`');
    expect(md).toContain('| `web-frontend`');
  });

  it('reproduces README run-sections verbatim under blockquotes with attribution', () => {
    const md = renderGettingStarted({
      projectName: 'gira',
      commandCatalog: giraShapeCatalog,
      readmeRunSections: [
        {
          path: 'README.md',
          heading: 'Getting Started',
          body: 'Run `make setup` then open localhost:2712.',
          fenced_blocks: ['make setup'],
        },
      ],
    });
    expect(md).toContain('## From the project README');
    expect(md).toContain('### Getting Started');
    expect(md).toContain('_Source: `README.md` § Getting Started_');
    // Body is blockquoted verbatim
    expect(md).toContain('> Run `make setup` then open localhost:2712.');
  });

  it('emits a "no commands discovered" placeholder when the catalog is empty', () => {
    const md = renderGettingStarted({
      projectName: 'minimal',
      commandCatalog: {},
    });
    expect(md).toContain('## (No commands discovered)');
    expect(md).toContain('Phase 1 analyzers found no Makefile');
  });

  it('does not emit a wrapper table when no wrapper-tier entries exist (bare-pnpm)', () => {
    const barePnpmCatalog: CommandCatalog = {
      run_tests: [
        {
          tier: 'package_manager',
          command: 'pnpm test',
          source: 'package.json',
          per_service: '_root',
        },
      ],
    };
    const md = renderGettingStarted({
      projectName: 'bare-pnpm',
      commandCatalog: barePnpmCatalog,
    });
    expect(md).not.toContain('## Wrapper commands');
    expect(md).toContain('## Per-service commands (low-level)');
  });

  it('emits a "CI-derived hints" section ONLY when CI fills an op no wrapper / pm filled', () => {
    const ciOnlyCatalog: CommandCatalog = {
      run_tests: [
        {
          tier: 'wrapper',
          command: 'make tests',
          source: 'Makefile',
        },
      ],
      run_e2e: [
        {
          tier: 'ci',
          command: 'pnpm playwright test',
          source: '.github/workflows/e2e.yml',
        },
      ],
    };
    const md = renderGettingStarted({
      projectName: 'mixed',
      commandCatalog: ciOnlyCatalog,
    });
    // wrapper is present for run_tests → CI section should NOT include run_tests
    // CI fills run_e2e (no wrapper / pm) → CI section includes it
    expect(md).toContain('## CI-derived hints (last-resort)');
    expect(md).toContain('pnpm playwright test');
    // Does not emit run_tests in CI section because wrapper covers it
    const ciSectionStart = md.indexOf('## CI-derived hints');
    const ciSection = md.slice(ciSectionStart);
    expect(ciSection).not.toContain('make tests');
  });

  it('escapes pipe characters inside descriptions to keep the table well-formed', () => {
    const md = renderGettingStarted({
      projectName: 'pipey',
      commandCatalog: {
        setup: [
          {
            tier: 'wrapper',
            command: 'make setup',
            description: 'Run a | b | c pipeline',
            source: 'Makefile',
          },
        ],
      },
    });
    expect(md).toContain('Run a \\| b \\| c pipeline');
  });

  it('orders rows by canonical operation order (setup → start_dev → tests → ...)', () => {
    const md = renderGettingStarted({
      projectName: 'order',
      commandCatalog: {
        run_lint: [{ tier: 'wrapper', command: 'make lint', source: 'Makefile' }],
        setup: [{ tier: 'wrapper', command: 'make setup', source: 'Makefile' }],
        run_tests: [{ tier: 'wrapper', command: 'make tests', source: 'Makefile' }],
      },
    });
    // Setup MUST appear before run_tests, which MUST appear before run_lint.
    const setupIdx = md.indexOf('make setup');
    const testsIdx = md.indexOf('make tests');
    const lintIdx = md.indexOf('make lint');
    expect(setupIdx).toBeLessThan(testsIdx);
    expect(testsIdx).toBeLessThan(lintIdx);
  });
});
