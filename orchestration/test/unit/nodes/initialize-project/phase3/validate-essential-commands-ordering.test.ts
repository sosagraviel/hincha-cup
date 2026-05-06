import { describe, expect, it } from 'vitest';
import {
  detectEssentialCommandsOrderingViolations,
  formatOrderingViolations,
} from '../../../../../src/nodes/initialize-project/phase3/validators/validate-essential-commands-ordering.js';
import type { CommandCatalog } from '../../../../../src/schemas/stack-profile.schema.js';

/**
 * Plan 15 §D.8.2 — hard validator: package-manager rows must NOT
 * appear before wrapper rows for the same operation in the
 * synthesized Essential Commands table.
 *
 * These tests pin the violation-detection contract. The validator
 * is stack-agnostic — it operates on the catalog entries' command
 * strings, not on language-specific tokens.
 */

const giraShapeCatalog: CommandCatalog = {
  setup: [
    {
      tier: 'wrapper',
      command: 'make setup',
      description: 'Full setup.',
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
      description: 'Run all tests.',
      source: 'Makefile',
    },
    {
      tier: 'package_manager',
      command: 'pnpm --filter backend test',
      source: 'services/backend/package.json',
      per_service: 'backend',
    },
  ],
};

describe('detectEssentialCommandsOrderingViolations', () => {
  it('passes when wrapper rows appear before package-manager rows', () => {
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Full setup | `make setup` |',
      '| Run all tests | `make tests` |',
      '',
      '### Per-service commands (low-level)',
      '',
      '| Service | Command |',
      '|---|---|',
      '| backend (install) | `pnpm install` |',
      '| backend (tests) | `pnpm --filter backend test` |',
    ].join('\n');
    const violations = detectEssentialCommandsOrderingViolations(claudeMd, giraShapeCatalog);
    expect(violations).toEqual([]);
  });

  it('fires when a package-manager row appears before its wrapper row (the gira regression)', () => {
    // Mimics the broken gira CLAUDE.md: pnpm commands listed first,
    // make commands omitted entirely. We assert that even when both
    // the wrapper AND fallback are mentioned, ordering is enforced.
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Backend tests | `pnpm --filter backend test` |',
      '| All tests | `make tests` |',
    ].join('\n');
    const violations = detectEssentialCommandsOrderingViolations(claudeMd, giraShapeCatalog);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      operation: 'run_tests',
      wrapper_command: 'make tests',
      offending_command: 'pnpm --filter backend test',
    });
  });

  it('skips operations whose wrapper is absent entirely (synthesizer chose to omit)', () => {
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Install | `pnpm install` |',
      '| All tests | `make tests` |',
    ].join('\n');
    // `make setup` is missing → we don't fire on `pnpm install` because
    // we cannot compare to an absent baseline.
    const violations = detectEssentialCommandsOrderingViolations(claudeMd, giraShapeCatalog);
    // run_tests is properly ordered → no violation. setup is skipped → no violation.
    expect(violations).toEqual([]);
  });

  it('skips operations whose fallback is absent (no rows to mis-order)', () => {
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Setup | `make setup` |',
      '| All tests | `make tests` |',
    ].join('\n');
    const violations = detectEssentialCommandsOrderingViolations(claudeMd, giraShapeCatalog);
    expect(violations).toEqual([]);
  });

  it('handles multiple violations in the same body', () => {
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Backend test | `pnpm --filter backend test` |',
      '| Install | `pnpm install` |',
      '| Setup | `make setup` |',
      '| Tests | `make tests` |',
    ].join('\n');
    const violations = detectEssentialCommandsOrderingViolations(claudeMd, giraShapeCatalog);
    expect(violations).toHaveLength(2);
    const ops = violations.map((v) => v.operation).sort();
    expect(ops).toEqual(['run_tests', 'setup']);
  });

  it('ignores operations with only one tier in the catalog (no opportunity to mis-order)', () => {
    const singleTierCatalog: CommandCatalog = {
      run_lint: [
        {
          tier: 'package_manager',
          command: 'pnpm lint',
          source: 'package.json',
          per_service: 'backend',
        },
      ],
    };
    const claudeMd = [
      '## Essential Commands',
      '',
      '| Action | Command |',
      '|---|---|',
      '| Lint | `pnpm lint` |',
    ].join('\n');
    expect(detectEssentialCommandsOrderingViolations(claudeMd, singleTierCatalog)).toEqual([]);
  });

  it('returns an empty array on empty / no-catalog input', () => {
    expect(detectEssentialCommandsOrderingViolations('', {})).toEqual([]);
    expect(detectEssentialCommandsOrderingViolations('any body', {})).toEqual([]);
  });
});

describe('formatOrderingViolations', () => {
  it('returns an empty array on no violations', () => {
    expect(formatOrderingViolations([])).toEqual([]);
  });

  it('emits actionable retry feedback that names the offending command + line', () => {
    const lines = formatOrderingViolations([
      {
        operation: 'run_tests',
        wrapper_command: 'make tests',
        wrapper_line: 7,
        offending_command: 'pnpm --filter backend test',
        offending_line: 5,
      },
    ]);
    const joined = lines.join('\n');
    expect(joined).toMatch(/ESSENTIAL COMMANDS ORDERING VIOLATION/);
    expect(joined).toContain('`pnpm --filter backend test`');
    expect(joined).toContain('`make tests`');
    expect(joined).toContain('line 5');
    expect(joined).toContain('line 7');
    expect(joined).toMatch(/HOW TO FIX/);
  });
});
