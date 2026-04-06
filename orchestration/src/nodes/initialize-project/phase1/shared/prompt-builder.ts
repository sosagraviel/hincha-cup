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
): string {
  const excludedDirs = getExcludedDirectories(projectPath, frameworkPath);
  const executionInstructions = loadExecutionInstructions(
    agentName,
    frameworkPath,
  );

  const parts: string[] = [
    buildExcludedDirsTag(excludedDirs),
    '',
    buildProjectPathTag(projectPath),
    '',
    buildJsonOutputFormat(agentName),
  ];

  if (executionInstructions) {
    parts.push('', executionInstructions);
  }

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}
