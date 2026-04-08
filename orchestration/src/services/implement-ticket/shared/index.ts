/**
 * Shared utilities for implement-ticket workflow
 * Builds prompts for planner, implementer, and visual verifier agents
 */

import { join } from 'path';
import { buildContentSection } from '../../../utils/shared/context-tags.js';

/**
 * Build input prompt for planner agent (Phase 2)
 */
export function buildPlannerPrompt(
  ticketId: string,
  context: string,
  stackProfile: any,
): string {
  const parts: string[] = [
    buildContentSection('Ticket ID', ticketId),
    '',
    buildContentSection('Context', context),
    '',
    buildContentSection(
      'Stack Profile',
      [
        `Primary Language: ${stackProfile.primary_language || 'Unknown'}`,
        `Languages: ${(stackProfile.languages || []).join(', ') || 'None'}`,
        `Frontend Frameworks: ${(stackProfile.frameworks?.frontend || []).join(', ') || 'None'}`,
        `Backend Frameworks: ${(stackProfile.frameworks?.backend || []).join(', ') || 'None'}`,
        `Testing: ${Object.keys(stackProfile.testing_frameworks || {}).join(', ') || 'Unknown'}`,
      ].join('\n'),
    ),
    '',
    buildContentSection(
      'Requirements',
      [
        'Create a comprehensive implementation plan:',
        '1. Implementation Steps - Detailed step-by-step instructions',
        '2. Test Plan - Unit, integration, and E2E test requirements',
        '3. Environment Requirements - Docker, services, env vars',
        '4. Risk Assessment - Potential risks and mitigation',
      ].join('\n'),
    ),
  ];

  return parts.join('\n');
}

/**
 * Build input prompt for implementer agent (Phase 4)
 */
export function buildImplementerPrompt(plan: string, context: string): string {
  const parts: string[] = [
    buildContentSection('Implementation Plan', plan),
    '',
    buildContentSection('Context', context),
    '',
    buildContentSection(
      'Instructions',
      [
        'Follow the plan exactly.',
        'Make the necessary code changes to implement the required functionality.',
        'Ensure all code follows team conventions and patterns from project-context.',
      ].join('\n'),
    ),
  ];

  return parts.join('\n');
}

/**
 * Build input prompt for visual verifier agent (Phase 6)
 */
export function buildVisualVerifierPrompt(
  screenshotsBefore: string[],
  screenshotsAfter: string[],
  diffReport: any,
): string {
  const parts: string[] = [
    buildContentSection('Screenshots Before', screenshotsBefore.join('\n')),
    '',
    buildContentSection('Screenshots After', screenshotsAfter.join('\n')),
    '',
    buildContentSection('Diff Report', JSON.stringify(diffReport, null, 2)),
    '',
    buildContentSection(
      'Instructions',
      [
        '1. Review all visual changes',
        '2. Identify any regressions or unexpected changes',
        '3. Provide a verdict: PASS or FAIL',
        '4. List specific issues if FAIL',
        '5. Suggest fixes if needed',
      ].join('\n'),
    ),
  ];

  return parts.join('\n');
}

/**
 * Get path to project-specific agent file
 */
export function getProjectAgentPath(
  projectPath: string,
  agentFile: string,
): string {
  return join(projectPath, '.claude/agents', agentFile);
}
