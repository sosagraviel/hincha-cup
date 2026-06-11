import { describe, expect, it } from 'vitest';
import { renderEssentialCommandsMarkdown } from '../../../../../src/services/framework/command-catalog/render-essential-commands.js';
import type { CommandCatalog } from '../../../../../src/schemas/stack-profile.schema.js';

/**
 * Unit tests for the deterministic `## Essential Commands` renderer.
 *
 * Guards the column regression: the main table is now `Command | Description`
 * (the redundant Action column is dropped). Every row keeps a meaningful
 * Description — the source comment when present, otherwise the human action
 * label — so no row renders a bare em-dash.
 */

describe('renderEssentialCommandsMarkdown — 2-column main table', () => {
  const catalog: CommandCatalog = {
    setup: [
      {
        tier: 'wrapper',
        command: 'make setup',
        description: 'Full setup: build, start, init',
        source: 'Makefile',
      },
    ],
    run_tests: [{ tier: 'wrapper', command: 'make test', source: 'Makefile' }],
  };
  const md = renderEssentialCommandsMarkdown(catalog);

  it('emits the Command | Description header (no Action column)', () => {
    expect(md).toContain('| Command | Description |');
    expect(md).not.toContain('Action');
  });

  it('renders the source comment as the description', () => {
    expect(md).toContain('| `make setup` | Full setup: build, start, init |');
  });

  it('falls back to the action label when no source comment exists', () => {
    expect(md).toContain('| `make test` | Run tests |');
    expect(md).not.toContain('| `make test` | — |');
  });
});

describe('renderEssentialCommandsMarkdown — package-manager rows and subtable', () => {
  it('appends the service marker to the description for a main-table package-manager row', () => {
    const catalog: CommandCatalog = {
      run_tests: [
        {
          tier: 'package_manager',
          command: 'pnpm --filter web test',
          source: 'package.json',
          per_service: 'web',
        },
      ],
    };
    expect(renderEssentialCommandsMarkdown(catalog)).toContain(
      '| `pnpm --filter web test` | Run tests (web) |',
    );
  });

  it('keeps the per-service subtable below the wrapper row', () => {
    const catalog: CommandCatalog = {
      run_tests: [
        { tier: 'wrapper', command: 'make test', description: 'All tests', source: 'Makefile' },
        {
          tier: 'package_manager',
          command: 'pnpm --filter web test',
          source: 'package.json',
          per_service: 'web',
        },
      ],
    };
    const md = renderEssentialCommandsMarkdown(catalog);
    expect(md).toContain('| `make test` | All tests |');
    expect(md).toContain('### Per-service commands (low-level)');
    expect(md).toContain('pnpm --filter web test');
    expect(md.indexOf('make test')).toBeLessThan(md.indexOf('pnpm --filter web test'));
  });
});

describe('renderEssentialCommandsMarkdown — empty catalog', () => {
  it('emits a 2-column placeholder when fallback is requested', () => {
    const md = renderEssentialCommandsMarkdown({}, { fallbackPlaceholder: true });
    expect(md).toContain('| Command | Description |');
    expect(md).toContain('(no commands discovered)');
  });

  it('returns an empty string when no fallback is requested', () => {
    expect(renderEssentialCommandsMarkdown({})).toBe('');
  });
});
