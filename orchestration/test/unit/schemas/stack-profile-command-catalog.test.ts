import { describe, expect, it } from 'vitest';
import {
  AutomationSchema,
  CommandCatalogSchema,
  ReadmeRunSectionEntrySchema,
  StackProfileSchema,
} from '../../../src/schemas/stack-profile.schema.js';

/**
 * Schema contract for the automation surface, README run-section
 * extracts, and the deterministic command catalog. These tests pin
 * the field shapes so that downstream consumers (catalog builder,
 * synthesizer, wiki generator, skills) can rely on them.
 */

describe('AutomationSchema', () => {
  it('accepts an empty automation surface', () => {
    expect(() => AutomationSchema.parse({})).not.toThrow();
  });

  it('parses Make targets with optional group + description', () => {
    const parsed = AutomationSchema.parse({
      makefiles: [
        {
          path: 'Makefile',
          targets: [
            { name: 'setup', group: 'setup', description: 'Full dev setup.' },
            { name: 'tests' },
          ],
        },
      ],
    });
    expect(parsed.makefiles).toHaveLength(1);
    expect(parsed.makefiles[0].targets[0].description).toBe('Full dev setup.');
  });

  it('parses shell scripts with purpose enum', () => {
    const parsed = AutomationSchema.parse({
      shell_scripts: [
        { path: 'scripts/setup', purpose: 'setup' },
        { path: 'bin/dev', purpose: 'dev' },
        { path: 'scripts/random.sh', purpose: 'unknown' },
      ],
    });
    expect(parsed.shell_scripts).toHaveLength(3);
  });

  it('rejects shell scripts with unknown purpose value', () => {
    expect(() =>
      AutomationSchema.parse({
        shell_scripts: [{ path: 'scripts/x', purpose: 'invalid' }],
      }),
    ).toThrow();
  });

  it('parses devcontainer hooks', () => {
    const parsed = AutomationSchema.parse({
      devcontainer: { postCreateCommand: 'pnpm install' },
    });
    expect(parsed.devcontainer?.postCreateCommand).toBe('pnpm install');
  });
});

describe('ReadmeRunSectionEntrySchema', () => {
  it('parses a section with verbatim body and fenced blocks', () => {
    const parsed = ReadmeRunSectionEntrySchema.parse({
      path: 'README.md',
      heading: 'Getting Started',
      body: '```sh\npnpm install\n```\n\nThen start the dev server.',
      fenced_blocks: ['pnpm install'],
    });
    expect(parsed.heading).toBe('Getting Started');
    expect(parsed.fenced_blocks).toEqual(['pnpm install']);
  });

  it('rejects empty heading', () => {
    expect(() =>
      ReadmeRunSectionEntrySchema.parse({
        path: 'README.md',
        heading: '',
        body: 'x',
        fenced_blocks: [],
      }),
    ).toThrow();
  });
});

describe('CommandCatalogSchema', () => {
  it('parses a multi-tier catalog', () => {
    const parsed = CommandCatalogSchema.parse({
      setup: [
        {
          tier: 'wrapper',
          command: 'make setup',
          description: 'Full dev setup.',
          source: 'Makefile',
        },
        {
          tier: 'package_manager',
          command: 'pnpm install',
          source: 'package.json',
        },
      ],
      run_tests: [
        {
          tier: 'wrapper',
          command: 'make tests',
          source: 'Makefile',
        },
      ],
    });
    expect(parsed.setup).toHaveLength(2);
    expect(parsed.setup![0].tier).toBe('wrapper');
  });

  it('rejects entries with empty command', () => {
    expect(() =>
      CommandCatalogSchema.parse({
        setup: [{ tier: 'wrapper', command: '', source: 'Makefile' }],
      }),
    ).toThrow();
  });

  it('rejects unknown operation keys', () => {
    expect(() =>
      CommandCatalogSchema.parse({
        not_a_real_operation: [],
      }),
    ).toThrow();
  });

  it('rejects unknown tier values', () => {
    expect(() =>
      CommandCatalogSchema.parse({
        setup: [{ tier: 'something_else', command: 'make x', source: 'Makefile' }],
      }),
    ).toThrow();
  });
});

describe('StackProfileSchema (command catalog fields are optional)', () => {
  const baseProfile = {
    services: [
      {
        id: 'backend',
        path: 'services/backend',
        type: 'backend' as const,
        language: 'typescript',
        frameworks: { main: 'NestJS 11' },
      },
    ],
    is_monorepo: true,
  };

  it('parses a minimal profile (no optional fields)', () => {
    expect(() => StackProfileSchema.parse(baseProfile)).not.toThrow();
  });

  it('parses a profile with automation + readme + catalog populated', () => {
    const parsed = StackProfileSchema.parse({
      ...baseProfile,
      automation: {
        makefiles: [
          {
            path: 'Makefile',
            targets: [{ name: 'setup', description: 'Full setup.' }],
          },
        ],
      },
      readme_run_sections: [
        {
          path: 'README.md',
          heading: 'Getting Started',
          body: 'x',
          fenced_blocks: ['make setup'],
        },
      ],
      command_catalog: {
        setup: [
          {
            tier: 'wrapper',
            command: 'make setup',
            description: 'Full setup.',
            source: 'Makefile',
          },
        ],
      },
    });
    expect(parsed.automation?.makefiles).toHaveLength(1);
    expect(parsed.command_catalog?.setup?.[0].command).toBe('make setup');
  });
});
