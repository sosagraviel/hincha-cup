/**
 * Agent Coverage Validator
 *
 * Validates agent coverage for detected languages (multi-stack validation)
 */

import { existsSync, readFileSync } from 'fs';
import type { StackProfile } from '../../../../schemas/index.js';
import { MIN_AGENT_COUNT } from '../constants.js';
import type { AgentCoverageResult } from '../types.js';

/**
 * Validate agent count and coverage
 */
export function validateAgentCoverage(
  agentFiles: string[],
  configPath: string | undefined,
): AgentCoverageResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const agentCount = agentFiles.length;

  // Check minimum agent count
  if (agentCount < MIN_AGENT_COUNT) {
    errors.push(
      `Insufficient agents generated: found ${agentCount}, expected at least ${MIN_AGENT_COUNT} (planner + implementer)`,
    );
  }

  // Check for planner agent
  const hasPlannerAgent = agentFiles.some((f) => f.includes('planner'));
  if (!hasPlannerAgent) {
    errors.push('Planner agent not found');
  }

  // Validate multi-stack coverage if config exists
  const missingImplementers: string[] = [];
  let significantLanguages: string[] = [];

  if (configPath && existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      const stackProfile: StackProfile = config.stack_profile;

      if (stackProfile && stackProfile.services) {
        // Use services as the source of truth for languages (not file counts)
        // This avoids false positives from config files (e.g., .js config files in TS projects)
        const serviceLanguages = new Set(
          stackProfile.services.map((s) => s.language.toLowerCase()),
        );
        significantLanguages = Array.from(serviceLanguages);

        // Check if there's an implementer for each service language
        for (const lang of significantLanguages) {
          const hasImplementer = agentFiles.some(
            (f) => f.includes('implementer') && f.toLowerCase().includes(lang),
          );
          if (!hasImplementer) {
            missingImplementers.push(lang);
          }
        }

        if (missingImplementers.length > 0) {
          warnings.push(
            `Missing implementers for service languages: ${missingImplementers.join(', ')}`,
          );
        }
      }
    } catch (error) {
      warnings.push(`Could not validate multi-stack coverage: ${(error as Error).message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    agentCount,
    hasPlannerAgent,
    missingImplementers,
    significantLanguages,
  };
}
