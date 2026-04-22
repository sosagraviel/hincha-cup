import { existsSync } from 'fs';
import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { logger } from '../../../../utils/logger.js';
import { WikiGeneratorService } from '../../../../services/graph-wiki/wiki-generator.service.js';
import { readAnalyzerOutputs, readStackProfile, resolveWikiPaths } from './utils.js';

export async function wikiPreparationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const phaseLogger = logger.child('Phase 4b: Wiki Preparation');
  phaseLogger.info('Validating wiki inputs and loading analyzers...');

  try {
    const { tempDir, claudeMdPath, projectContextPath, phase1Dir } = resolveWikiPaths(state);

    if (!existsSync(claudeMdPath)) {
      throw new Error(`CLAUDE.md not found: ${claudeMdPath}`);
    }
    if (!existsSync(projectContextPath)) {
      throw new Error(`project-context/SKILL.md not found: ${projectContextPath}`);
    }
    if (!existsSync(phase1Dir)) {
      throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
    }

    const analyzers = readAnalyzerOutputs(phase1Dir);
    const stackProfile = readStackProfile(tempDir, state);

    const wiki = new WikiGeneratorService({
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

    wiki.validate();
    const { generatedAt, graphVersion } = wiki.computeMetadata();

    phaseLogger.success('✓ Wiki inputs validated');

    return {
      phase4_wiki_docs: {
        context: {
          analyzers,
          stackProfile,
          generatedAt,
          graphVersion,
        },
      },
      claude_md_path: claudeMdPath,
      project_context_path: projectContextPath,
      temp_dir: tempDir,
    };
  } catch (error) {
    const errorMessage = `Wiki preparation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
