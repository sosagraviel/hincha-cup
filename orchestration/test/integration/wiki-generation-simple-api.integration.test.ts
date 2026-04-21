import { afterEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { wikiGenerationNode } from '../../src/nodes/initialize-project/phase4/wiki-generation.node.js';
import type { InitializeProjectState } from '../../src/state/schemas/initialize-project.schema.js';

describe('wiki generation smoke on simple-api fixture', () => {
  let projectPath: string | undefined;

  afterEach(() => {
    if (projectPath && existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('creates the five core AI knowledge docs without breaking context outputs', async () => {
    const sourceProject = resolve(
      process.cwd(),
      '..',
      'tests',
      'integration',
      'initialize-project',
      'projects',
      'simple-api',
    );
    projectPath = mkdtempSync(join(tmpdir(), 'simple-api-wiki-'));
    cpSync(sourceProject, projectPath, { recursive: true });

    const tempDir = join(projectPath, '.claude-temp', 'initialize-project');
    const phase1Dir = join(tempDir, 'phase1-outputs');
    mkdirSync(phase1Dir, { recursive: true });
    mkdirSync(join(projectPath, '.claude', 'skills', 'project-context'), { recursive: true });
    writeFileSync(join(projectPath, '.claude', 'CLAUDE.md'), '# Simple API\n');
    writeFileSync(
      join(projectPath, '.claude', 'skills', 'project-context', 'SKILL.md'),
      '# Skill\n',
    );
    writeFileSync(join(projectPath, '.code-graph.db'), 'graph');
    writeFileSync(
      join(tempDir, 'stack-profile.json'),
      JSON.stringify({
        package_manager: 'npm',
        services: [
          {
            id: 'api',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'Express', testing: 'Jest' },
          },
        ],
      }),
    );
    writePhase1Output(phase1Dir, '01-structure-architecture.json', {
      graph_queries_used: ['list_communities'],
      findings: { architecture_patterns: ['Layered API'], project_structure: ['src'] },
    });
    writePhase1Output(phase1Dir, '02-tech-stack-dependencies.json', {
      graph_queries_used: ['semantic_search_nodes'],
      findings: {},
    });
    writePhase1Output(phase1Dir, '03-code-patterns-testing.json', {
      graph_queries_used: ['find_large_functions'],
      findings: { patterns: ['service/controller split'], testing: ['Jest tests'] },
    });
    writePhase1Output(phase1Dir, '04-data-flows-integrations.json', {
      graph_queries_used: ['list_flows'],
      findings: { routes: [{ method: 'GET', route: '/users' }] },
    });

    const state: InitializeProjectState = {
      project_path: projectPath,
      framework_path: resolve(process.cwd(), '..'),
      temp_dir: tempDir,
      current_phase: 'phase4_context',
      claude_md_path: join(projectPath, '.claude', 'CLAUDE.md'),
      project_context_path: join(projectPath, '.claude', 'skills', 'project-context', 'SKILL.md'),
      code_graph_available: true,
      code_graph_path: join(projectPath, '.code-graph.db'),
      phase4_context: {
        claude_md_written: true,
        project_context_written: true,
        framework_config_generated: true,
        timestamp: new Date().toISOString(),
      },
      errors: [],
      warnings: [],
      phase1_retry_tracking: {},
    };

    const result = await wikiGenerationNode(state);

    expect(result.current_phase).toBe('phase4_wiki_generation');
    expect(existsSync(join(projectPath, '.code-graph.db'))).toBe(true);
    for (const fileName of [
      'index.md',
      'ARCHITECTURE.md',
      'SERVICES.md',
      'DATA-FLOWS.md',
      'PATTERNS.md',
    ]) {
      expect(existsSync(join(projectPath, 'docs', 'ai-knowledge', fileName))).toBe(true);
    }
    expect(readFileSync(join(projectPath, 'docs', 'ai-knowledge', 'index.md'), 'utf-8')).toContain(
      'list_communities',
    );
    expect(readFileSync(join(projectPath, '.claude', 'CLAUDE.md'), 'utf-8')).toContain(
      'docs/ai-knowledge/index.md',
    );
    expect(existsSync(join(projectPath, '.claude', 'skills', 'project-context', 'SKILL.md'))).toBe(
      true,
    );
  });
});

function writePhase1Output(
  phase1Dir: string,
  fileName: string,
  content: Record<string, unknown>,
): void {
  writeFileSync(
    join(phase1Dir, fileName),
    JSON.stringify({
      agent_name: 'test-analyzer',
      timestamp: '2026-04-21T00:00:00.000Z',
      ...content,
    }),
  );
}
