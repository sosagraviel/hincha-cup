import { describe, expect, it } from 'vitest';
import { trimSynthesisInput } from '../../../../../src/nodes/initialize-project/phase3/helpers/trim-synthesis-input.js';

/**
 * Trim Phase 3 synthesis input.
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

describe('trimSynthesisInput', () => {
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

  it('carries grounded file_placement_patterns through as the synthesizer baseline', () => {
    const trimmed = trimSynthesisInput({
      consolidated_findings: {
        services: [
          {
            id: 'api',
            type: 'backend',
            language: 'python',
            frameworks: { main: 'FastAPI' },
            file_placement_patterns: [
              {
                type: 'SQLAlchemy model',
                location: 'src/entities/{domain}/model.py',
                example: 'src/entities/project/model.py',
              },
              // Dropped — missing a real example, so it is not grounded.
              { type: 'service', location: 'src/services/{domain}.py' },
            ],
          },
        ],
      },
    });

    expect(trimmed.summary.services).toEqual([
      {
        id: 'api',
        type: 'backend',
        language: 'python',
        framework_main: 'FastAPI',
        file_placement_patterns: [
          {
            type: 'SQLAlchemy model',
            location: 'src/entities/{domain}/model.py',
            example: 'src/entities/project/model.py',
          },
        ],
      },
    ]);
  });

  it('omits file_placement_patterns entirely when none are grounded', () => {
    const trimmed = trimSynthesisInput({
      consolidated_findings: {
        services: [
          {
            id: 'api',
            type: 'backend',
            language: 'python',
            frameworks: {},
            file_placement_patterns: [{ type: 'model' }],
          },
        ],
      },
    });
    expect(trimmed.summary.services[0]).not.toHaveProperty('file_placement_patterns');
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
    // `command_catalog` and `essential_commands_markdown` are added
    // unconditionally (the latter is pre-rendered markdown the
    // synthesizer copies verbatim). `automation` and
    // `readme_run_sections` only when discovered.
    expect(keys.sort()).toEqual([
      'command_catalog',
      'consolidated_gaps',
      'consolidation_metadata',
      'directory_structure_markdown',
      'essential_commands_markdown',
      'services_and_ports_markdown',
      'summary',
      'tech_stack_markdown',
    ]);
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
    expect(trimmed.summary.services).toEqual([{ id: 'legacy', path: 'src' }]);
  });

  it('handles a top-level services array (alternative consolidator shape)', () => {
    const trimmed = trimSynthesisInput({
      services: [
        { id: 'svc', type: 'cli', language: 'go', frameworks: { main: 'Cobra' }, path: 'cmd/svc' },
      ],
    });
    expect(trimmed.summary.services).toEqual([
      { id: 'svc', type: 'cli', language: 'go', framework_main: 'Cobra', path: 'cmd/svc' },
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
    // Synthetic fixture: ~30 KB raw consolidation, ~3 KB trimmed.
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

/**
 * End-to-end regression for the single-repo CLAUDE.md richness. A
 * single-service project (service path `.`) must still produce a rich
 * Tech Stack (framework + production deps, all version-bearing), a real
 * Directory Structure tree derived from grounded placements, and a
 * 2-column Essential Commands table — the three sections that previously
 * collapsed under the closed-book renderers.
 */
describe('trimSynthesisInput — single-repo CLAUDE.md richness (regression)', () => {
  const trimmed = trimSynthesisInput({
    consolidated_findings: {
      services: [
        {
          id: 'cm-ai-api',
          type: 'backend',
          language: 'python',
          path: '.',
          frameworks: { main: 'FastAPI' },
          file_placement_patterns: [
            {
              type: 'REST router',
              location: 'src/api/routers/rest/{domain}.py',
              example: 'src/api/routers/rest/projects.py',
            },
            {
              type: 'SQLAlchemy model',
              location: 'src/models/{domain}.py',
              example: 'src/models/project.py',
            },
            {
              type: 'Alembic migration',
              location: 'alembic/versions/{rev}.py',
              example: 'alembic/versions/abc123.py',
            },
          ],
        },
      ],
      runtimes: { python: '3.11' },
      dependencies: {
        by_service: {
          'cm-ai-api': {
            production: [
              'fastapi>=0.115.0',
              'SQLAlchemy>=2.0.36',
              'alembic>=1.13.3',
              'PyJWT>=2.10.1',
            ],
          },
        },
      },
      automation: {
        makefiles: [
          {
            path: 'Makefile',
            targets: [
              { name: 'setup', group: 'setup', description: 'Full local setup' },
              { name: 'tests', group: 'test', description: 'Run all tests' },
            ],
          },
        ],
      },
    },
  });

  it('renders a per-service block with versioned framework and dependencies', () => {
    expect(trimmed.tech_stack_markdown).toContain('### cm-ai-api (Python 3.11)');
    expect(trimmed.tech_stack_markdown).toContain('- **FastAPI** >=0.115.0 — framework');
    expect(trimmed.tech_stack_markdown).toContain('- **SQLAlchemy** >=2.0.36');
    expect(trimmed.tech_stack_markdown).toContain('- **PyJWT** >=2.10.1');
    expect(trimmed.tech_stack_markdown).not.toContain('(not determined by analysis)');
  });

  it('derives a Directory Structure tree instead of the single-repo placeholder', () => {
    expect(trimmed.directory_structure_markdown).not.toContain('single-service / polyrepo');
    expect(trimmed.directory_structure_markdown).toContain('src/');
    expect(trimmed.directory_structure_markdown).toContain('# REST router');
    expect(trimmed.directory_structure_markdown).toContain('# Alembic migration');
  });

  it('renders a 2-column Essential Commands table', () => {
    expect(trimmed.essential_commands_markdown).toContain('| Command | Description |');
    expect(trimmed.essential_commands_markdown).not.toContain('| Action | Command | Description |');
    expect(trimmed.essential_commands_markdown).toContain('`make setup`');
  });
});
