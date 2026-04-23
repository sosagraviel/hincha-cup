import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import type {
  AnalyzerDocument,
  WikiAnalyzerOutputs,
} from '../../../../services/graph-wiki/wiki-generator.service.js';

export const PHASE1_ANALYZER_FILES = {
  structure_architecture: '01-structure-architecture.json',
  tech_stack_dependencies: '02-tech-stack-dependencies.json',
  code_patterns_testing: '03-code-patterns-testing.json',
  data_flows_integrations: '04-data-flows-integrations.json',
} as const;

export function readAnalyzerOutputs(phase1Dir: string): WikiAnalyzerOutputs {
  const analyzers: WikiAnalyzerOutputs = {};

  for (const [key, fileName] of Object.entries(PHASE1_ANALYZER_FILES)) {
    const filePath = join(phase1Dir, fileName);
    if (!existsSync(filePath)) {
      throw new Error(`Required Phase 1 analyzer output not found: ${filePath}`);
    }

    analyzers[key as keyof WikiAnalyzerOutputs] = JSON.parse(
      readFileSync(filePath, 'utf-8'),
    ) as AnalyzerDocument;
  }

  return analyzers;
}

export function readStackProfile(tempDir: string, state: InitializeProjectState): unknown {
  const stackProfilePath = join(tempDir, 'stack-profile.json');
  if (existsSync(stackProfilePath)) {
    return JSON.parse(readFileSync(stackProfilePath, 'utf-8'));
  }
  return state.phase4_context?.stack_profile;
}

export function resolveWikiPaths(state: InitializeProjectState): {
  tempDir: string;
  claudeMdPath: string;
  projectContextPath: string;
  phase1Dir: string;
} {
  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  const claudeMdPath = state.claude_md_path || join(state.project_path, '.claude', 'CLAUDE.md');
  const projectContextPath =
    state.project_context_path ||
    join(state.project_path, '.claude', 'skills', 'project-context', 'SKILL.md');
  const phase1Dir = join(tempDir, 'phase1-outputs');

  return { tempDir, claudeMdPath, projectContextPath, phase1Dir };
}
