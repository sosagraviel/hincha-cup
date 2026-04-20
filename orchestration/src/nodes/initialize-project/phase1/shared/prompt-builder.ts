/**
 * Prompt building utilities for Phase 1 analyzer agents
 */

import {
  getExcludedDirectories,
  loadExecutionInstructions,
} from '../../../../utils/shared/prompt-loader.js';
import {
  buildExcludedDirsTag,
  buildProjectPathTag,
  buildJsonOutputFormat,
  buildContentSection,
} from '../../../../utils/shared/context-tags.js';
import type { CodeGraphStats } from '../../../../state/schemas/initialize-project.schema.js';

export interface GraphPromptContext {
  available: boolean;
  dbPath?: string;
  mcpPort?: number;
  stats?: CodeGraphStats;
}

/**
 * Build input prompt for Phase 1 analyzer agents
 *
 * Used by: structure-architecture, tech-stack-dependencies,
 *          code-patterns-testing, data-flows-integrations
 */
export function buildPhase1AnalyzerPrompt(
  projectPath: string,
  frameworkPath: string,
  agentName: string,
  feedbackPrompt?: string, // Error feedback for retry
  graphContext?: GraphPromptContext,
): string {
  const excludedDirs = getExcludedDirectories(projectPath, frameworkPath);
  const executionInstructions = loadExecutionInstructions(agentName, frameworkPath);

  const parts: string[] = [
    buildExcludedDirsTag(excludedDirs),
    '',
    buildProjectPathTag(projectPath),
    '',
    buildJsonOutputFormat(agentName),
  ];

  if (graphContext) {
    parts.push('', buildContentSection('Code Graph Context', buildGraphContext(graphContext)));
  }

  if (executionInstructions) {
    parts.push('', executionInstructions);
  }

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}

function buildGraphContext(graphContext: GraphPromptContext): string {
  const lines = [
    `Available: ${graphContext.available ? 'yes' : 'no'}`,
    graphContext.dbPath ? `Database: ${graphContext.dbPath}` : undefined,
    graphContext.mcpPort ? `MCP Port: ${graphContext.mcpPort}` : undefined,
    graphContext.stats ? `Stats: ${JSON.stringify(graphContext.stats)}` : undefined,
  ].filter(Boolean) as string[];

  if (graphContext.available) {
    lines.push(
      '',
      'Use the code graph as the first source of structural truth before Read/Grep/Glob.',
      'Use mcp__code_graph tools for relationships, communities, flows, and file summaries when relevant.',
      'Use Read/Grep/Glob only for details the graph does not provide or for manifest/config verification.',
      'Include a top-level optional "graph_queries_used": string[] listing graph tools you used.',
    );
  } else {
    lines.push(
      '',
      'The code graph is not available in this run. Use Read/Grep/Glob discovery as the fallback.',
    );
  }

  return lines.join('\n');
}
