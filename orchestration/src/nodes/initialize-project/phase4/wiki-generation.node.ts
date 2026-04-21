import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../../../utils/logger.js';
import {
  WikiGeneratorService,
  upsertAiKnowledgeContextSection,
  type AnalyzerDocument,
  type WikiAnalyzerOutputs,
} from '../../../services/graph-wiki/wiki-generator.service.js';

const PHASE1_ANALYZER_FILES = {
  structure_architecture: '01-structure-architecture.json',
  tech_stack_dependencies: '02-tech-stack-dependencies.json',
  code_patterns_testing: '03-code-patterns-testing.json',
  data_flows_integrations: '04-data-flows-integrations.json',
} as const;

export async function wikiGenerationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child('Phase 4b: Wiki Generation');
  phaseLogger.info('Generating AI knowledge wiki...');

  try {
    const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
    const claudeMdPath = state.claude_md_path || join(state.project_path, '.claude', 'CLAUDE.md');
    const projectContextPath =
      state.project_context_path ||
      join(state.project_path, '.claude', 'skills', 'project-context', 'SKILL.md');

    if (!existsSync(claudeMdPath)) {
      throw new Error(`CLAUDE.md not found: ${claudeMdPath}`);
    }
    if (!existsSync(projectContextPath)) {
      throw new Error(`project-context/SKILL.md not found: ${projectContextPath}`);
    }

    const phase1Dir = join(tempDir, 'phase1-outputs');
    if (!existsSync(phase1Dir)) {
      throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
    }

    const analyzers = readAnalyzerOutputs(phase1Dir);
    const stackProfile = readStackProfile(tempDir, state);

    const wikiGenerator = new WikiGeneratorService({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      analyzers,
      stackProfile,
      graph: {
        available: state.code_graph_available,
        path: state.code_graph_path,
        mcpPort: state.code_graph_mcp_port,
        stats: state.code_graph_stats,
        error: state.code_graph_error,
      },
    });
    const wiki = await wikiGenerator.generateAll();

    const aiKnowledgePath = join(state.project_path, 'docs', 'ai-knowledge');
    mkdirSync(aiKnowledgePath, { recursive: true });

    const writtenFiles = wiki.files.map((file) => {
      const filePath = join(aiKnowledgePath, file.filename);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content);
      return filePath;
    });

    const claudeMdContent = readFileSync(claudeMdPath, 'utf-8');
    writeFileSync(
      claudeMdPath,
      upsertAiKnowledgeContextSection(claudeMdContent, wiki.contextSection),
    );

    const projectContextContent = readFileSync(projectContextPath, 'utf-8');
    writeFileSync(
      projectContextPath,
      upsertAiKnowledgeContextSection(projectContextContent, wiki.contextSection),
    );

    phaseLogger.success(`✓ Written AI knowledge wiki: ${aiKnowledgePath}`);
    phaseLogger.success(`✓ Updated context references`);

    return {
      phase4_wiki_generation: {
        ai_knowledge_written: true,
        files: writtenFiles,
        timestamp: new Date().toISOString(),
      },
      ai_knowledge_path: aiKnowledgePath,
      ai_knowledge_files: writtenFiles,
      claude_md_path: claudeMdPath,
      project_context_path: projectContextPath,
      current_phase: 'phase4_wiki_generation',
    };
  } catch (error) {
    const errorMessage = `Wiki generation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed',
    };
  }
}

function readAnalyzerOutputs(phase1Dir: string): WikiAnalyzerOutputs {
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

function readStackProfile(tempDir: string, state: InitializeProjectState): unknown {
  const stackProfilePath = join(tempDir, 'stack-profile.json');
  if (existsSync(stackProfilePath)) {
    return JSON.parse(readFileSync(stackProfilePath, 'utf-8'));
  }

  return state.phase4_context?.stack_profile;
}
