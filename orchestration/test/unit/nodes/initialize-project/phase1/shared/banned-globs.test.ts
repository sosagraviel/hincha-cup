import { describe, expect, it } from 'vitest';
import {
  BANNED_GLOB_PATTERNS,
  REDUNDANT_GLOB_WARNING_CODE,
  detectBannedGlobs,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/banned-globs.js';
import { computeSoftWarnings } from '../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-usage.js';

describe('banned-globs detector', () => {
  describe('detectBannedGlobs', () => {
    it('returns empty when the agent called no globs', () => {
      expect(detectBannedGlobs([])).toEqual([]);
    });

    it('returns empty when no called glob matches a banned entry', () => {
      expect(detectBannedGlobs(['src/**/*.ts', 'tests/**/*.spec.ts'])).toEqual([]);
    });

    it('matches every banned entry exactly when called verbatim', () => {
      for (const entry of BANNED_GLOB_PATTERNS) {
        const matched = detectBannedGlobs([entry.pattern]);
        expect(matched).toContain(entry.pattern);
      }
    });

    it('matches banned entries inside compound brace-expansion globs', () => {
      const matched = detectBannedGlobs(['{pnpm-lock.yaml,yarn.lock,package-lock.json,bun.lockb}']);
      expect(matched).toEqual(
        expect.arrayContaining(['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb']),
      );
    });

    it('matches banned entries inside multi-pattern globs', () => {
      const matched = detectBannedGlobs([
        '**/package.json **/pyproject.toml **/go.mod **/Cargo.toml',
      ]);
      expect(matched.length).toBeGreaterThanOrEqual(4);
    });

    it('deduplicates matches and returns them sorted', () => {
      const matched = detectBannedGlobs([
        '**/package.json',
        '**/package.json',
        '{pnpm-lock.yaml,yarn.lock}',
      ]);
      // Should appear once each, sorted
      expect(matched).toEqual([...new Set(matched)].sort());
      expect(matched).toContain('**/package.json');
      expect(matched).toContain('pnpm-lock.yaml');
      expect(matched).toContain('yarn.lock');
    });

    it('ignores non-string entries (defensive)', () => {
      const matched = detectBannedGlobs(['' as string, '**/package.json']);
      expect(matched).toEqual(['**/package.json']);
    });
  });

  describe('integration via computeSoftWarnings', () => {
    it('does NOT emit the warning when globPatterns is empty', () => {
      const warnings = computeSoftWarnings(
        'tech-stack-dependencies-analyzer',
        10,
        2,
        { mcp__code_graph__semantic_search_nodes_tool: 5 },
        [],
        [],
      );
      expect(warnings).not.toContain(REDUNDANT_GLOB_WARNING_CODE);
    });

    it('does NOT emit when called globs are all clean', () => {
      const warnings = computeSoftWarnings(
        'tech-stack-dependencies-analyzer',
        10,
        2,
        { mcp__code_graph__semantic_search_nodes_tool: 5 },
        [],
        ['src/**/*.ts', 'tests/**/*.spec.ts'],
      );
      expect(warnings).not.toContain(REDUNDANT_GLOB_WARNING_CODE);
    });

    it('emits the warning when even one called glob matches a banned entry', () => {
      const warnings = computeSoftWarnings(
        'tech-stack-dependencies-analyzer',
        10,
        2,
        { mcp__code_graph__semantic_search_nodes_tool: 5 },
        [],
        ['**/package.json'],
      );
      expect(warnings).toContain(REDUNDANT_GLOB_WARNING_CODE);
    });

    it('emits the warning when a compound glob hits multiple banned entries', () => {
      const warnings = computeSoftWarnings(
        'tech-stack-dependencies-analyzer',
        10,
        2,
        { mcp__code_graph__semantic_search_nodes_tool: 5 },
        [],
        ['{**/package.json,**/pyproject.toml,**/go.mod}'],
      );
      expect(warnings).toContain(REDUNDANT_GLOB_WARNING_CODE);
      // Only ONE warning code emitted, regardless of how many banned patterns matched
      const occurrences = warnings.filter((w) => w === REDUNDANT_GLOB_WARNING_CODE).length;
      expect(occurrences).toBe(1);
    });

    it('emits the warning for every Phase 1 analyzer name (stack-agnostic)', () => {
      const analyzers = [
        'structure-architecture-analyzer',
        'tech-stack-dependencies-analyzer',
        'code-patterns-testing-analyzer',
        'data-flows-integrations-analyzer',
      ];
      for (const agentName of analyzers) {
        const warnings = computeSoftWarnings(
          agentName,
          10,
          2,
          { mcp__code_graph__semantic_search_nodes_tool: 5 },
          [],
          ['**/package.json'],
        );
        expect(warnings).toContain(REDUNDANT_GLOB_WARNING_CODE);
      }
    });
  });

  describe('table coverage — every documented inspection field is represented', () => {
    it('covers manifests, lock files, env templates, infrastructure, CI, monorepo, runtime, and documentation', () => {
      const fields = new Set(BANNED_GLOB_PATTERNS.map((e) => e.inspectionField));
      // These are the inspection-field families the four Phase 1 analyzers
      // delegate to; if a new family lands in inspection, add entries here
      // first.
      expect([...fields].some((f) => f.includes('manifests'))).toBe(true);
      expect([...fields].some((f) => f.includes('lock_files'))).toBe(true);
      expect([...fields].some((f) => f.includes('environment'))).toBe(true);
      expect([...fields].some((f) => f.includes('infrastructure'))).toBe(true);
      expect([...fields].some((f) => f.includes('ci_cd'))).toBe(true);
      expect([...fields].some((f) => f.includes('monorepo'))).toBe(true);
      expect([...fields].some((f) => f.includes('runtime_versions'))).toBe(true);
      expect([...fields].some((f) => f.includes('documentation'))).toBe(true);
    });
  });
});
