import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../../../utils/logger.js';
import {
  WikiGeneratorService,
  upsertAiKnowledgeContextSection,
  type GeneratedWikiFile,
} from '../../../services/graph-wiki/wiki-generator.service.js';
import { buildContextSection } from '../../../services/graph-wiki/frontmatter.js';

export async function wikiGenerationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child('Phase 4b: Wiki Finalization');
  phaseLogger.info('Assembling wiki, writing files, updating context sections...');

  try {
    const docs = state.phase4_wiki_docs;
    if (!docs?.context) {
      throw new Error('phase4_wiki_docs.context missing');
    }
    const { context } = docs;
    const architecture = docs.architecture as GeneratedWikiFile | undefined;
    const dataFlows = docs.data_flows as GeneratedWikiFile | undefined;
    const patterns = docs.patterns as GeneratedWikiFile | undefined;
    const serviceDocs = (docs.service_docs ?? []) as GeneratedWikiFile[];

    if (!architecture || !dataFlows || !patterns) {
      throw new Error('One or more core wiki docs are missing from state');
    }

    const claudeMdPath = state.claude_md_path!;
    const projectContextPath = state.project_context_path!;

    const wiki = new WikiGeneratorService({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      analyzers: context.analyzers,
      stackProfile: context.stackProfile,
      graph: {
        available: state.code_graph_available,
        path: state.code_graph_path,
        mcpPort: state.code_graph_mcp_port,
        stats: state.code_graph_stats,
        error: state.code_graph_error,
      },
    });

    const servicesCatalog = wiki.buildServicesCatalog(
      serviceDocs,
      context.generatedAt,
      context.graphVersion,
    );
    const index = wiki.buildIndex(context.generatedAt, context.graphVersion);

    const files: GeneratedWikiFile[] = [
      architecture,
      servicesCatalog,
      dataFlows,
      patterns,
      ...serviceDocs,
      index,
    ];

    const aiKnowledgePath = join(state.project_path, 'docs', 'ai-knowledge');
    mkdirSync(aiKnowledgePath, { recursive: true });

    const writtenFiles = files.map((file) => {
      const filePath = join(aiKnowledgePath, file.filename);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content);
      return filePath;
    });

    const contextSection = buildContextSection({
      available: state.code_graph_available,
      path: state.code_graph_path,
      mcpPort: state.code_graph_mcp_port,
      stats: state.code_graph_stats,
      error: state.code_graph_error,
    });

    const claudeMdContent = readFileSync(claudeMdPath, 'utf-8');
    writeFileSync(claudeMdPath, upsertAiKnowledgeContextSection(claudeMdContent, contextSection));

    const projectContextContent = readFileSync(projectContextPath, 'utf-8');
    writeFileSync(
      projectContextPath,
      upsertAiKnowledgeContextSection(projectContextContent, contextSection),
    );

    phaseLogger.success(`✓ Written AI knowledge wiki: ${aiKnowledgePath}`);
    phaseLogger.success('✓ Updated context references');

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
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
