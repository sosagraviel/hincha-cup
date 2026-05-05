/**
 * Plan §E.4 (2026-05-05) — service-floor filter regression tests.
 *
 * The 2026-05-04 gira `/initialize-project` run shipped a `seeds` service in
 * `framework-config.json` with `file_count: 2` and no `manifest_file`. It
 * was surfaced by the structure-architecture analyzer because
 * `pnpm-workspace.yaml` listed `seeds/`, but the directory only held two
 * SQL migration helpers — far below the threshold for an implementer agent
 * to be useful. Phase 4 now drops services where the file count is
 * explicitly low AND no manifest is present.
 *
 * The filter logic lives at the bottom of the service-extraction block in
 * `phase4/context-generation.node.ts`. The constants are documented in
 * `schemas/stack-profile.schema.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextGenerationNode } from '../../../../../src/nodes/initialize-project/phase4/context-generation.node.js';
import {
  MIN_FILES_FOR_FALLBACK_SERVICE,
  MIN_FILES_FOR_NO_MANIFEST_SERVICE,
} from '../../../../../src/schemas/stack-profile.schema.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as configGenerator from '../../../../../src/nodes/initialize-project/phase4/config-generator.js';
import * as fileCounter from '../../../../../src/nodes/initialize-project/phase4/file-counter.js';
import * as workspaceDetector from '../../../../../src/nodes/initialize-project/phase4/workspace-detector.js';

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('../../../../../src/nodes/initialize-project/phase4/config-generator.js', () => ({
  generateFrameworkConfig: vi.fn(() => ({
    project_root: '/test/project',
    services: [],
  })),
}));

vi.mock('../../../../../src/nodes/initialize-project/phase4/file-counter.js', () => ({
  countFilesByLanguage: vi.fn(),
}));

vi.mock('../../../../../src/nodes/initialize-project/phase4/workspace-detector.js', () => ({
  detectWorkspaces: vi.fn(),
}));

const SYNTHESIS = `# CLAUDE.md Content

# Project

body

---

# code-conventions/SKILL.md Content

---
name: code-conventions
description: x
---

# Code Conventions

body

---

# multi-file-workflows/SKILL.md Content

---
name: multi-file-workflows
description: x
---

# Multi-File Workflows

body

---

# testing-conventions/SKILL.md Content

---
name: testing-conventions
description: x
---

# Testing Conventions

body

---

# Architectural Narrative Content

# Architectural Narrative

body
`;

describe('Phase 4 — service-floor filter (§E.4)', () => {
  let state: InitializeProjectState;

  beforeEach(() => {
    vi.clearAllMocks();

    state = {
      project_path: '/test/project',
      framework_path: '/test/framework',
      current_phase: 'phase3_synthesis',
      temp_dir: '/test/temp',
      phase1_analysis: { all_completed: false },
      phase1_retry_tracking: {},
      errors: [],
      warnings: [],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(configGenerator.generateFrameworkConfig).mockReturnValue({
      project_root: '/test/project',
      services: [],
    } as any);
    vi.mocked(fileCounter.countFilesByLanguage).mockResolvedValue({
      total_files: 100,
      by_language: [{ language: 'typescript', count: 100 }],
    } as any);
    vi.mocked(workspaceDetector.detectWorkspaces).mockResolvedValue({
      is_monorepo: false,
      total_workspaces: 0,
      workspaces: [],
    } as any);
  });

  function mockPhase1WithServices(structureServices: any[]) {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return SYNTHESIS;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { services: structureServices },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { services: [] },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      return '{}';
    });
  }

  it('exports the documented threshold constants', () => {
    // Anti-regression: the filter logic in context-generation.node.ts and
    // the constants here must agree. The plan (§E.4) calls these out
    // explicitly so future readers can find the floor.
    expect(MIN_FILES_FOR_FALLBACK_SERVICE).toBe(10);
    expect(MIN_FILES_FOR_NO_MANIFEST_SERVICE).toBe(5);
  });

  it('drops a no-manifest service with explicit file_count below the floor (the gira `seeds` case)', async () => {
    mockPhase1WithServices([
      {
        id: 'backend',
        path: 'src/backend',
        type: 'backend',
        language: 'typescript',
        frameworks: { main: 'Express' },
        manifest_file: 'src/backend/package.json',
        file_count: 50,
      },
      {
        // The exact gira shape: workspace-yaml-derived, no manifest, low count.
        id: 'seeds',
        path: 'seeds',
        type: 'library',
        language: 'typescript',
        frameworks: {},
        file_count: 2,
      },
    ]);

    const result = await contextGenerationNode(state);
    const services = result.phase4_context?.stack_profile.services ?? [];
    const ids = services.map((s: { id: string }) => s.id);
    expect(ids).toContain('backend');
    expect(ids).not.toContain('seeds');
  });

  it('keeps a manifest-backed service even when file_count is well below the floor', async () => {
    // A freshly scaffolded package may legitimately have only one file —
    // the presence of a manifest is enough signal to keep it.
    mockPhase1WithServices([
      {
        id: 'fresh-pkg',
        path: 'packages/fresh',
        type: 'library',
        language: 'typescript',
        frameworks: {},
        manifest_file: 'packages/fresh/package.json',
        file_count: 1,
      },
    ]);

    const result = await contextGenerationNode(state);
    const ids = (result.phase4_context?.stack_profile.services ?? []).map(
      (s: { id: string }) => s.id,
    );
    expect(ids).toContain('fresh-pkg');
  });

  it('keeps a no-manifest service when file_count is undefined (no signal to drop)', async () => {
    // Older fixtures and partial analyzer output may omit file_count
    // entirely. The filter treats undefined as "no measurement" — keeps
    // the service rather than guessing.
    mockPhase1WithServices([
      {
        id: 'unmeasured',
        path: 'src/unmeasured',
        type: 'library',
        language: 'typescript',
        frameworks: {},
        // file_count intentionally absent
      },
    ]);

    const result = await contextGenerationNode(state);
    const ids = (result.phase4_context?.stack_profile.services ?? []).map(
      (s: { id: string }) => s.id,
    );
    expect(ids).toContain('unmeasured');
  });

  it('keeps a no-manifest service when file_count is at the floor exactly', async () => {
    mockPhase1WithServices([
      {
        id: 'right-at-floor',
        path: 'src/borderline',
        type: 'library',
        language: 'typescript',
        frameworks: {},
        file_count: MIN_FILES_FOR_NO_MANIFEST_SERVICE, // 5
      },
    ]);

    const result = await contextGenerationNode(state);
    const ids = (result.phase4_context?.stack_profile.services ?? []).map(
      (s: { id: string }) => s.id,
    );
    expect(ids).toContain('right-at-floor');
  });

  it('drops a no-manifest service that is one file below the floor', async () => {
    mockPhase1WithServices([
      {
        id: 'kept',
        path: 'src/kept',
        type: 'backend',
        language: 'typescript',
        frameworks: {},
        manifest_file: 'src/kept/package.json',
        file_count: 50,
      },
      {
        id: 'just-under',
        path: 'src/borderline',
        type: 'library',
        language: 'typescript',
        frameworks: {},
        file_count: MIN_FILES_FOR_NO_MANIFEST_SERVICE - 1, // 4
      },
    ]);

    const result = await contextGenerationNode(state);
    const ids = (result.phase4_context?.stack_profile.services ?? []).map(
      (s: { id: string }) => s.id,
    );
    expect(ids).toContain('kept');
    expect(ids).not.toContain('just-under');
  });

  it('errors when the filter would leave zero services (every entry is low-signal)', async () => {
    // Production-readiness: a Phase 4 output with zero services is
    // useless to downstream phases. Better to fail loudly here than
    // ship an empty framework-config.
    mockPhase1WithServices([
      {
        id: 'tiny-1',
        path: 'a',
        type: 'library',
        language: 'typescript',
        frameworks: {},
        file_count: 1,
      },
      {
        id: 'tiny-2',
        path: 'b',
        type: 'library',
        language: 'typescript',
        frameworks: {},
        file_count: 2,
      },
    ]);

    const result = await contextGenerationNode(state);
    expect(result.current_phase).toBe('failed');
    expect(result.errors?.some((e) => /No services remain after filtering/.test(e))).toBe(true);
  });
});
