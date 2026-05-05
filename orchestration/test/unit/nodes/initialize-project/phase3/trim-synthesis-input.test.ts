import { describe, expect, it } from 'vitest';
import { trimSynthesisInput } from '../../../../../src/nodes/initialize-project/phase3/helpers/trim-synthesis-input.js';

/**
 * Wave 3 §I.4 — trim Phase 3 synthesis input.
 *
 * The synthesizer ingests the consolidated Phase 2 blob. Pre-trim
 * that blob carried full per-analyzer outputs (often 30-50 KB).
 * Post-trim it carries: consolidated_gaps + consolidation_metadata
 * + a curated summary block. The synthesizer's outputs (CLAUDE.md
 * cheat-sheet + 3 prescriptive skills + architectural narrative)
 * use only the curated facts; raw per-service detail almost never
 * matters and can be read on demand.
 *
 * Stack-agnostic: the trim is shape-only. Languages / frameworks /
 * runtimes pass through untouched; only the per-analyzer raw
 * outputs are dropped.
 */

describe('trimSynthesisInput — Wave 3 §I.4', () => {
  it('preserves consolidated_gaps and consolidation_metadata', () => {
    const trimmed = trimSynthesisInput({
      consolidated_gaps: [{ id: 'g1', question: 'Why?', priority: 'high' }],
      consolidation_metadata: { original_gap_count: 5 },
    });
    expect(trimmed.consolidated_gaps).toEqual([{ id: 'g1', question: 'Why?', priority: 'high' }]);
    expect(trimmed.consolidation_metadata).toEqual({ original_gap_count: 5 });
  });

  it('accepts the renamed `gaps` field (Phase 2 node persists under this name)', () => {
    const trimmed = trimSynthesisInput({
      gaps: [{ id: 'g1', question: 'Why?' }],
      question_consolidation: { original_gap_count: 5 },
    });
    expect(trimmed.consolidated_gaps).toEqual([{ id: 'g1', question: 'Why?' }]);
    expect(trimmed.consolidation_metadata).toEqual({ original_gap_count: 5 });
  });

  it('extracts a curated summary block from consolidated_findings.services', () => {
    const trimmed = trimSynthesisInput({
      consolidated_gaps: [],
      consolidation_metadata: {},
      consolidated_findings: {
        services: [
          {
            id: 'api',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'NestJS 11' },
            // Drop these — they're per-analyzer raw detail.
            file_count: 145,
            manifest_file: 'services/api/package.json',
            entry_points: ['services/api/src/main.ts'],
          },
          {
            id: 'web',
            type: 'frontend',
            language: 'typescript',
            frameworks: { main: 'React 19' },
            file_count: 85,
          },
        ],
        // Also drop:
        languages: ['typescript', 'javascript'],
        runtimes: { node: '>=22' },
        repository_type: 'monorepo',
        monorepo_layout: { root: '.', workspace_tool: 'pnpm workspaces' },
      },
    });

    expect(trimmed.summary.services).toEqual([
      { id: 'api', type: 'backend', language: 'typescript', framework_main: 'NestJS 11' },
      { id: 'web', type: 'frontend', language: 'typescript', framework_main: 'React 19' },
    ]);
    expect(trimmed.summary.languages).toEqual(['typescript', 'javascript']);
    expect(trimmed.summary.runtimes).toEqual({ node: '>=22' });
    expect(trimmed.summary.repository_type).toBe('monorepo');
    expect(trimmed.summary.monorepo).toEqual({ root: '.', workspace_tool: 'pnpm workspaces' });
  });

  it('drops the heavy per-analyzer raw outputs', () => {
    const trimmed = trimSynthesisInput({
      consolidated_findings: {
        services: [{ id: 'api', type: 'backend', language: 'typescript', frameworks: {} }],
        // The bulk of pre-trim payload was per-analyzer dependency maps,
        // file_placement tables, raw graph_queries_used arrays. None of
        // those should appear in the trimmed output.
        dependencies: {
          by_service: {
            api: {
              production: [
                /* huge list */
              ],
            },
          },
        },
        file_placement: { table_markdown: 'huge table…' },
        graph_queries_used: ['mcp__code_graph__get_minimal_context_tool'],
      },
    });
    const keys = Object.keys(trimmed);
    expect(keys.sort()).toEqual(['consolidated_gaps', 'consolidation_metadata', 'summary']);
    // None of the dropped fields leak into the summary.
    const summaryKeys = Object.keys(trimmed.summary);
    expect(summaryKeys).not.toContain('dependencies');
    expect(summaryKeys).not.toContain('file_placement');
    expect(summaryKeys).not.toContain('graph_queries_used');
  });

  it('handles services with missing optional fields (defensive)', () => {
    const trimmed = trimSynthesisInput({
      consolidated_findings: {
        services: [{ id: 'legacy', path: 'src' }],
      },
    });
    expect(trimmed.summary.services).toEqual([{ id: 'legacy' }]);
  });

  it('handles a top-level services array (alternative consolidator shape)', () => {
    const trimmed = trimSynthesisInput({
      services: [{ id: 'svc', type: 'cli', language: 'go', frameworks: { main: 'Cobra' } }],
    });
    expect(trimmed.summary.services).toEqual([
      { id: 'svc', type: 'cli', language: 'go', framework_main: 'Cobra' },
    ]);
  });

  it('returns an empty summary when consolidation has no services data (defensive)', () => {
    const trimmed = trimSynthesisInput({});
    expect(trimmed.summary.services).toEqual([]);
    expect(trimmed.consolidated_gaps).toEqual([]);
    expect(trimmed.consolidation_metadata).toEqual({});
  });

  it('handles non-object input (defensive)', () => {
    expect(trimSynthesisInput(null).summary.services).toEqual([]);
    expect(trimSynthesisInput(undefined).summary.services).toEqual([]);
    expect(trimSynthesisInput('oops').summary.services).toEqual([]);
    expect(trimSynthesisInput(42).summary.services).toEqual([]);
  });

  it('Jaccard-like size comparison: trimmed JSON is much smaller than raw', () => {
    // Synthetic fixture mirroring the gira-2026-05-04 measurement:
    // ~30 KB raw consolidation, ~3 KB trimmed.
    const raw: Record<string, unknown> = {
      consolidated_gaps: [{ id: 'g1', question: 'Why?', priority: 'high' }],
      consolidation_metadata: { original_gap_count: 1 },
      consolidated_findings: {
        services: Array.from({ length: 10 }, (_, i) => ({
          id: `svc-${i}`,
          path: `services/svc-${i}`,
          type: 'backend',
          language: 'typescript',
          frameworks: { main: 'NestJS 11' },
          // Bulk that should be trimmed.
          file_placement: 'x'.repeat(2000),
          dependencies: 'y'.repeat(2000),
          file_count: 145,
        })),
      },
    };
    const rawSize = JSON.stringify(raw).length;
    const trimmedSize = JSON.stringify(trimSynthesisInput(raw)).length;
    expect(trimmedSize).toBeLessThan(rawSize);
    expect(trimmedSize).toBeLessThan(rawSize / 5);
  });
});
