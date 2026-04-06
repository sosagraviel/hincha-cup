/**
 * Shared utilities for initialize-project workflow nodes
 * Builds prompts for Phase 1-6 agents
 */

import { join } from 'path';
import {
  getExcludedDirectories,
  loadExecutionInstructions,
} from '../../../utils/shared/prompt-loader.js';
import {
  buildExcludedDirsTag,
  buildProjectPathTag,
  buildJsonOutputFormat,
  buildContentSection,
} from '../../../utils/shared/context-tags.js';

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

/**
 * Build input prompt for Phase 2 consolidation agent
 */
export function buildConsolidationPrompt(
  gaps: any[],
  feedbackPrompt?: string,
): string {
  const gapsJson = JSON.stringify(gaps, null, 2);

  const parts: string[] = [buildContentSection('Input Gaps', gapsJson)];

  // Add consolidation-specific instructions
  parts.push(
    '',
    [
      'CRITICAL: Output structure must be:',
      '{',
      '  "consolidated_gaps": [...],',
      '  "consolidation_metadata": {...}',
      '}',
    ].join('\n'),
  );

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}

/**
 * Build input prompt for Phase 3 synthesis agent
 */
export function buildSynthesisPrompt(
  consolidatedData: any,
  feedbackPrompt?: string,
): string {
  const consolidatedJson = JSON.stringify(consolidatedData, null, 2);

  const parts: string[] = [
    buildContentSection('Consolidated Analysis', consolidatedJson),
  ];

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}

/**
 * Get path to framework agent file
 */
export function getFrameworkAgentPath(
  frameworkPath: string,
  agentFile: string,
): string {
  return join(frameworkPath, 'orchestration/agents', agentFile);
}

/**
 * Get path to settings file for hooks
 */
export function getInitializeProjectSettingsPath(frameworkPath: string): string {
  return join(
    frameworkPath,
    'orchestration/config/initialize-project-agents-settings.json',
  );
}
