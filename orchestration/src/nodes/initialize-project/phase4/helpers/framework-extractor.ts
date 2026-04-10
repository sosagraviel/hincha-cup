/**
 * Phase 4: Framework Extractor Helper
 *
 * Extracts frontend and backend framework information from Phase 1 analyzer outputs.
 */

import { FRONTEND_FRAMEWORK_KEYWORDS } from '../constants.js';

/**
 * Extract frameworks from Phase 1 structure analyzer
 *
 * This function:
 * - Extracts from frameworksObj.main (checks if frontend or backend)
 * - Extracts from frameworksObj.ui
 * - Uses FRONTEND_FRAMEWORK_KEYWORDS to categorize frameworks
 *
 * @param structureFindings - Findings from structure-architecture analyzer
 * @returns Object containing frontendFrameworks and backendFrameworks arrays
 */
export function extractFrameworks(structureFindings: any): {
  frontendFrameworks: string[];
  backendFrameworks: string[];
} {
  const frameworksObj = structureFindings?.frameworks || {};
  const frontendFrameworks: string[] = [];
  const backendFrameworks: string[] = [];

  // Extract from frameworks.main field
  // (it has main, orm, testing, ui fields)
  if (frameworksObj.main) {
    // Determine if it's frontend or backend based on name
    const mainFramework = frameworksObj.main.split(' ')[0].toLowerCase(); // "Next.js 15.5.10" -> "next.js"
    if (
      mainFramework.includes('next') ||
      mainFramework.includes('react') ||
      mainFramework.includes('vue') ||
      mainFramework.includes('angular')
    ) {
      frontendFrameworks.push(mainFramework);
    } else {
      backendFrameworks.push(mainFramework);
    }
  }

  // Extract from frameworks.ui field
  if (frameworksObj.ui) {
    const uiFrameworks = frameworksObj.ui
      .split('+')
      .map((f: string) => f.trim().split(' ')[0].toLowerCase());
    frontendFrameworks.push(...uiFrameworks);
  }

  // NOTE: Framework extraction from services array now handled by extractServicesFromPhase1Analyzers()
  // This legacy code that extracted from multi_stack.workspaces has been removed

  return { frontendFrameworks, backendFrameworks };
}
