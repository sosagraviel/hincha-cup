import { describe, expect, it } from 'vitest';
import {
  buildCommandCatalog,
  classifyOperation,
  preferredCommand,
} from '../../../../../src/services/framework/command-catalog/command-catalog-builder.js';
import type {
  Automation,
  CommandCatalogEntry,
  ReadmeRunSectionEntry,
} from '../../../../../src/schemas/stack-profile.schema.js';

/**
 * Plan 15 §D.2 + §E.1 — deterministic command-catalog builder tests.
 *
 * The builder is pure: same inputs ⇒ byte-identical outputs. These
 * tests pin the four-tier preference contract (wrapper > readme >
 * package_manager > ci) and the operation classifier's name-shape
 * heuristics. No LLM, no I/O.
 *
 * Stack-agnostic fixtures: Make-style, npm-style, mixed, bare-repo,
 * multi-language polyglot, and multi-repo equivalents.
 */

// ---------------------------------------------------------------------------
// classifyOperation — name-shape heuristics
// ---------------------------------------------------------------------------

describe('classifyOperation', () => {
  it('routes test variants to the right operation', () => {
    expect(classifyOperation('test')).toBe('run_tests');
    expect(classifyOperation('tests')).toBe('run_tests');
    expect(classifyOperation('test:unit')).toBe('run_unit_tests');
    expect(classifyOperation('test_unit')).toBe('run_unit_tests');
    expect(classifyOperation('test-integration')).toBe('run_integration_tests');
    expect(classifyOperation('test:e2e')).toBe('run_e2e');
    expect(classifyOperation('cypress')).toBe('run_e2e');
    expect(classifyOperation('playwright')).toBe('run_e2e');
  });

  it('routes setup / dev / build / lint / format / typecheck', () => {
    expect(classifyOperation('setup')).toBe('setup');
    expect(classifyOperation('bootstrap')).toBe('setup');
    expect(classifyOperation('init')).toBe('setup');
    expect(classifyOperation('dev')).toBe('start_dev');
    expect(classifyOperation('start')).toBe('start_dev');
    expect(classifyOperation('start:dev')).toBe('start_dev');
    expect(classifyOperation('runserver')).toBe('start_dev');
    expect(classifyOperation('build')).toBe('run_build');
    expect(classifyOperation('compile')).toBe('run_build');
    expect(classifyOperation('lint')).toBe('run_lint');
    expect(classifyOperation('eslint')).toBe('run_lint');
    expect(classifyOperation('format')).toBe('run_format');
    expect(classifyOperation('prettier')).toBe('run_format');
    expect(classifyOperation('typecheck')).toBe('run_typecheck');
    expect(classifyOperation('tsc')).toBe('run_typecheck');
    expect(classifyOperation('mypy')).toBe('run_typecheck');
  });

  it('routes migration variants', () => {
    expect(classifyOperation('migration:run')).toBe('run_migrations');
    expect(classifyOperation('migrate')).toBe('run_migrations');
    expect(classifyOperation('db:migrate')).toBe('run_migrations');
    expect(classifyOperation('migration:generate')).toBe('generate_migration');
    expect(classifyOperation('makemigrations')).toBe('generate_migration');
    expect(classifyOperation('migration:revert')).toBe('revert_migration');
    expect(classifyOperation('rollback')).toBe('revert_migration');
  });

  it('routes seed and reset', () => {
    expect(classifyOperation('seed')).toBe('seed');
    expect(classifyOperation('seed:demo')).toBe('seed');
    expect(classifyOperation('launch')).toBe('reset');
    expect(classifyOperation('reset')).toBe('reset');
    expect(classifyOperation('down-volumes')).toBe('reset');
  });

  it('returns undefined for unrelated names (e.g. docker plumbing)', () => {
    expect(classifyOperation('logs')).toBeUndefined();
    expect(classifyOperation('sh')).toBeUndefined();
    expect(classifyOperation('rebuild-packages')).toBeUndefined();
    expect(classifyOperation('')).toBeUndefined();
    expect(classifyOperation('   ')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — tier preference contract
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: tier preference', () => {
  it('lists wrapper-tier entries before package_manager-tier for the same op', () => {
    const catalog = buildCommandCatalog({
      automation: makefile([
        { name: 'tests', description: 'Run all tests via the orchestrated stack.' },
      ]),
      package_manager_commands: [
        {
          service_id: 'backend',
          script_name: 'test',
          command: 'pnpm --filter backend test',
          source: 'services/backend/package.json',
        },
      ],
    });
    const tests = catalog.run_tests!;
    expect(tests).toHaveLength(2);
    expect(tests[0].tier).toBe('wrapper');
    expect(tests[0].command).toBe('make tests');
    expect(tests[1].tier).toBe('package_manager');
    expect(tests[1].command).toBe('pnpm --filter backend test');
  });

  it('lists readme-tier between wrapper and package_manager', () => {
    const catalog = buildCommandCatalog({
      automation: makefile([{ name: 'setup', description: 'Full setup.' }]),
      readme_run_sections: [
        {
          path: 'README.md',
          heading: 'Getting Started',
          body: '```sh\nmake setup\npnpm install\n```',
          fenced_blocks: ['make setup\npnpm install'],
        },
      ],
      package_manager_commands: [
        {
          service_id: 'backend',
          script_name: 'install',
          command: 'pnpm install',
          source: 'package.json',
        },
      ],
    });
    const setup = catalog.setup!;
    const tiers = setup.map((e) => e.tier);
    // wrapper(s) < readme(s) < package_manager(s)
    expect(tiers.indexOf('wrapper')).toBeLessThan(tiers.indexOf('readme'));
    expect(tiers.indexOf('readme')).toBeLessThan(tiers.indexOf('package_manager'));
  });

  it('omits operations with zero candidates', () => {
    const catalog = buildCommandCatalog({
      automation: makefile([{ name: 'tests' }]),
    });
    expect(catalog.run_tests).toBeDefined();
    expect(catalog.run_e2e).toBeUndefined();
    expect(catalog.setup).toBeUndefined();
  });

  it('preserves wrapper description verbatim (no paraphrase)', () => {
    const catalog = buildCommandCatalog({
      automation: makefile([
        {
          name: 'setup',
          description: 'Full dev environment setup (install, docker, keycloak, seed)',
        },
      ]),
    });
    expect(catalog.setup![0].description).toBe(
      'Full dev environment setup (install, docker, keycloak, seed)',
    );
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — wrapper sources
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: wrapper sources', () => {
  it('extracts Make targets via classifier (name + group)', () => {
    const catalog = buildCommandCatalog({
      automation: {
        makefiles: [
          {
            path: 'Makefile',
            targets: [
              { name: 'up', group: 'docker', description: 'Start all containers.' },
              { name: 'tests', group: 'test', description: 'Run all tests.' },
              { name: 'setup', group: 'setup', description: 'Full setup.' },
              { name: 'logs' }, // no description, no classifiable name → skipped
            ],
          },
        ],
        justfiles: [],
        taskfiles: [],
        shell_scripts: [],
        ci_hints: [],
      },
    });
    expect(catalog.run_tests![0].command).toBe('make tests');
    expect(catalog.setup![0].command).toBe('make setup');
    // `logs` is unclassifiable → not surfaced
    expect(Object.values(catalog).flat()).not.toContainEqual(
      expect.objectContaining({ command: 'make logs' }),
    );
  });

  it('handles Justfile and Taskfile wrappers with their respective invokers', () => {
    const catalog = buildCommandCatalog({
      automation: {
        makefiles: [],
        justfiles: [
          {
            path: 'Justfile',
            targets: [{ name: 'test', description: 'Run tests.' }],
          },
        ],
        taskfiles: [
          {
            path: 'Taskfile.yml',
            targets: [{ name: 'build', description: 'Build the project.' }],
          },
        ],
        shell_scripts: [],
        ci_hints: [],
      },
    });
    expect(catalog.run_tests![0].command).toBe('just test');
    expect(catalog.run_build![0].command).toBe('task build');
  });

  it('routes shell scripts by purpose; inferred from filename when purpose=unknown', () => {
    const catalog = buildCommandCatalog({
      automation: {
        makefiles: [],
        justfiles: [],
        taskfiles: [],
        shell_scripts: [
          { path: 'scripts/setup', purpose: 'setup' },
          { path: 'scripts/test.sh', purpose: 'unknown' },
          { path: 'bin/dev', purpose: 'dev' },
          { path: 'scripts/random-script.sh', purpose: 'unknown' }, // unclassifiable
        ],
        ci_hints: [],
      },
    });
    expect(catalog.setup!.map((e) => e.command)).toContain('./scripts/setup');
    expect(catalog.run_tests!.map((e) => e.command)).toContain('./scripts/test.sh');
    expect(catalog.start_dev!.map((e) => e.command)).toContain('./bin/dev');
    // unclassifiable script does not surface
    const allCommands = Object.values(catalog)
      .flat()
      .map((e) => e.command);
    expect(allCommands).not.toContain('./scripts/random-script.sh');
  });

  it('emits devcontainer postCreate / postStart hooks', () => {
    const catalog = buildCommandCatalog({
      automation: {
        makefiles: [],
        justfiles: [],
        taskfiles: [],
        shell_scripts: [],
        ci_hints: [],
        devcontainer: {
          postCreateCommand: 'pnpm install && pnpm db:migrate',
          postStartCommand: 'pnpm dev',
        },
      },
    });
    expect(catalog.setup![0].command).toBe('pnpm install && pnpm db:migrate');
    expect(catalog.start_dev![0].command).toBe('pnpm dev');
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — readme sources
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: readme tier', () => {
  it('extracts command lines from fenced blocks, skipping comments and prose', () => {
    const sections: ReadmeRunSectionEntry[] = [
      {
        path: 'README.md',
        heading: 'Getting Started',
        body: 'irrelevant',
        fenced_blocks: [
          [
            '# install dependencies',
            'pnpm install',
            '',
            '// then start the dev server',
            'pnpm dev',
            'random prose that is not a command',
          ].join('\n'),
        ],
      },
    ];
    const catalog = buildCommandCatalog({ readme_run_sections: sections });
    const installSetup = catalog.setup ?? [];
    const dev = catalog.start_dev ?? [];
    expect(installSetup.map((e) => e.command)).toContain('pnpm install');
    expect(dev.map((e) => e.command)).toContain('pnpm dev');
    // prose line is not surfaced
    expect(
      Object.values(catalog)
        .flat()
        .map((e) => e.command),
    ).not.toContain('random prose that is not a command');
  });

  it('attributes readme commands to README.md#<slugged-heading>', () => {
    const catalog = buildCommandCatalog({
      readme_run_sections: [
        {
          path: 'README.md',
          heading: 'Local Development',
          body: 'x',
          fenced_blocks: ['pnpm install'],
        },
      ],
    });
    expect(catalog.setup![0].source).toBe('README.md#local-development');
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — package-manager (Tier 3) + per-service
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: package_manager tier', () => {
  it('emits one entry per service per script, with per_service set', () => {
    const catalog = buildCommandCatalog({
      package_manager_commands: [
        {
          service_id: 'backend',
          script_name: 'test',
          command: 'pnpm --filter backend test',
          source: 'services/backend/package.json',
        },
        {
          service_id: 'web-frontend',
          script_name: 'test',
          command: 'pnpm --filter web-frontend test',
          source: 'services/web-frontend/package.json',
        },
        {
          service_id: 'backend',
          script_name: 'test:e2e',
          command: 'pnpm --filter backend test:e2e',
          source: 'services/backend/package.json',
        },
      ],
    });
    expect(catalog.run_tests).toHaveLength(2);
    expect(catalog.run_tests!.every((e) => e.tier === 'package_manager')).toBe(true);
    expect(catalog.run_tests!.map((e) => e.per_service).sort()).toEqual([
      'backend',
      'web-frontend',
    ]);
    expect(catalog.run_e2e).toHaveLength(1);
    expect(catalog.run_e2e![0].per_service).toBe('backend');
  });

  it('skips package-manager candidates whose script name does not classify', () => {
    const catalog = buildCommandCatalog({
      package_manager_commands: [
        {
          service_id: 'backend',
          script_name: 'random-helper',
          command: 'pnpm --filter backend random-helper',
          source: 'services/backend/package.json',
        },
      ],
    });
    // No operation gets a candidate
    expect(Object.keys(catalog)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — CI hints (Tier 4)
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: ci tier', () => {
  it('extracts classifiable command lines from CI hints', () => {
    const catalog = buildCommandCatalog({
      automation: {
        makefiles: [],
        justfiles: [],
        taskfiles: [],
        shell_scripts: [],
        ci_hints: [
          {
            file: '.github/workflows/test.yml',
            commands: ['pnpm install', 'pnpm test', 'echo hello'],
          },
        ],
      },
    });
    expect(catalog.setup!.some((e) => e.tier === 'ci' && e.command === 'pnpm install')).toBe(true);
    expect(catalog.run_tests!.some((e) => e.tier === 'ci' && e.command === 'pnpm test')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — determinism + dedupe
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: determinism + dedupe', () => {
  it('produces byte-identical output on identical inputs (stable sort)', () => {
    const input = {
      automation: makefile([
        { name: 'setup', description: 'Full setup.' },
        { name: 'tests', description: 'Run tests.' },
      ]),
      package_manager_commands: [
        {
          service_id: 'web-frontend',
          script_name: 'test',
          command: 'pnpm --filter web-frontend test',
          source: 'services/web-frontend/package.json',
        },
        {
          service_id: 'backend',
          script_name: 'test',
          command: 'pnpm --filter backend test',
          source: 'services/backend/package.json',
        },
      ],
    };
    const a = buildCommandCatalog(input);
    const b = buildCommandCatalog(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('dedupes identical entries (same tier+command+source+per_service)', () => {
    const catalog = buildCommandCatalog({
      automation: {
        makefiles: [
          {
            path: 'Makefile',
            targets: [
              { name: 'tests' },
              { name: 'tests' }, // duplicate target line — should dedupe
            ],
          },
        ],
        justfiles: [],
        taskfiles: [],
        shell_scripts: [],
        ci_hints: [],
      },
    });
    expect(catalog.run_tests).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// preferredCommand helper
// ---------------------------------------------------------------------------

describe('preferredCommand', () => {
  it('returns the first entry of an op (the highest-tier candidate)', () => {
    const catalog = buildCommandCatalog({
      automation: makefile([{ name: 'tests' }]),
      package_manager_commands: [
        {
          service_id: 'backend',
          script_name: 'test',
          command: 'pnpm --filter backend test',
          source: 'services/backend/package.json',
        },
      ],
    });
    const preferred = preferredCommand(catalog, 'run_tests');
    expect(preferred?.tier).toBe('wrapper');
    expect(preferred?.command).toBe('make tests');
  });

  it('returns undefined when the op has no candidates', () => {
    const catalog = buildCommandCatalog({});
    expect(preferredCommand(catalog, 'run_e2e')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — full-fixture sanity (gira-shape)
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: gira-shape fixture', () => {
  it('lists make setup before pnpm install, and make tests before pnpm test', () => {
    const catalog = buildCommandCatalog({
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
              // these have no classifiable op → skipped
              { name: 'logs', group: 'docker' },
              { name: 'sh', group: 'docker' },
            ],
          },
        ],
        justfiles: [],
        taskfiles: [],
        shell_scripts: [],
        ci_hints: [],
      },
      package_manager_commands: [
        {
          service_id: 'backend',
          script_name: 'test',
          command: 'pnpm --filter backend test',
          source: 'services/backend/package.json',
        },
        {
          service_id: 'web-frontend',
          script_name: 'dev',
          command: 'pnpm --filter web-frontend dev',
          source: 'services/web-frontend/package.json',
        },
      ],
    });
    // make setup is the canonical setup
    expect(catalog.setup![0]).toMatchObject({
      tier: 'wrapper',
      command: 'make setup',
      description: 'Full dev environment setup (install, docker, keycloak, seed)',
    });
    // make tests outranks pnpm --filter backend test
    expect(catalog.run_tests![0]).toMatchObject({ tier: 'wrapper', command: 'make tests' });
    expect(catalog.run_tests![1]).toMatchObject({
      tier: 'package_manager',
      command: 'pnpm --filter backend test',
      per_service: 'backend',
    });
    // make launch surfaces under reset
    expect(catalog.reset![0].command).toBe('make launch');
  });
});

// ---------------------------------------------------------------------------
// buildCommandCatalog — bare-pnpm regression check
// ---------------------------------------------------------------------------

describe('buildCommandCatalog: bare-pnpm fixture (no wrapper)', () => {
  it('emits package-manager entries when no automation is present (no regression)', () => {
    const catalog = buildCommandCatalog({
      package_manager_commands: [
        {
          service_id: 'web',
          script_name: 'test',
          command: 'npm test',
          source: 'package.json',
        },
        {
          service_id: 'web',
          script_name: 'dev',
          command: 'npm run dev',
          source: 'package.json',
        },
      ],
    });
    expect(catalog.run_tests).toHaveLength(1);
    expect(catalog.run_tests![0].tier).toBe('package_manager');
    expect(catalog.start_dev![0].command).toBe('npm run dev');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makefile(
  targets: Array<{ name: string; group?: string; description?: string }>,
): Automation {
  return {
    makefiles: [{ path: 'Makefile', targets }],
    justfiles: [],
    taskfiles: [],
    shell_scripts: [],
    ci_hints: [],
  };
}

// Type sanity (compile-time): every emitted entry has the required fields.
function _typeSanity(entry: CommandCatalogEntry): void {
  void entry.tier;
  void entry.command;
  void entry.source;
}
void _typeSanity;
