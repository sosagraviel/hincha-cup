/**
 * Phase 4: Language Extractor Helper
 *
 * Extracts language information from Phase 1 analyzer outputs.
 * Handles both array and object formats for language data.
 */

/**
 * Extract languages from Phase 1 structure and tech-stack analyzers
 *
 * This function handles multiple formats:
 * - Array format: ["typescript", "python"]
 * - Object format: {"backend": "TypeScript 5.8.x", "frontend": "JavaScript"}
 * - Checks tech_stack.languages field
 * - Checks top-level languages field
 * - Checks backend.language and frontend.language fields
 *
 * @param structureFindings - Findings from structure-architecture analyzer
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @returns Array of lowercase language names
 */
export function extractLanguagesFromPhase1(
  structureFindings: any,
  techStackFindings: any,
): string[] {
  // Extract languages from structure analyzer
  // Handle both array format ["typescript", "python"] and object format {"backend": "TypeScript 5.8.x", "frontend": "..."}
  let languagesFromPhase1: string[] = [];

  if (Array.isArray(structureFindings?.tech_stack?.languages)) {
    // Array format: ["typescript", "python"]
    languagesFromPhase1 = structureFindings.tech_stack.languages.map((l: string) =>
      l.toLowerCase(),
    );
  } else if (
    typeof structureFindings?.tech_stack?.languages === 'object' &&
    structureFindings.tech_stack.languages !== null
  ) {
    // Object format: {"backend": "TypeScript 5.8.x", "frontend": "JavaScript"}
    // Extract unique language names from values (e.g., "TypeScript 5.8.x" -> "typescript")
    const languageValues = Object.values(structureFindings.tech_stack.languages);
    const uniqueLanguages = new Set<string>();

    for (const langStr of languageValues) {
      // Extract base language name (e.g., "TypeScript 5.8.x" -> "typescript")
      if (typeof langStr === 'string') {
        const match = langStr.match(/^([a-zA-Z]+)/);
        if (match) {
          uniqueLanguages.add(match[1].toLowerCase());
        }
      }
    }

    languagesFromPhase1 = Array.from(uniqueLanguages);
  } else if (Array.isArray(structureFindings?.languages)) {
    // Fallback: check top-level languages field
    languagesFromPhase1 = structureFindings.languages.map((l: string) => l.toLowerCase());
  } else if (
    typeof structureFindings?.languages === 'object' &&
    structureFindings.languages !== null
  ) {
    // Fallback: object format at top level
    const languageValues = Object.values(structureFindings.languages);
    const uniqueLanguages = new Set<string>();

    for (const langStr of languageValues) {
      if (typeof langStr === 'string') {
        const match = langStr.match(/^([a-zA-Z]+)/);
        if (match) {
          uniqueLanguages.add(match[1].toLowerCase());
        }
      }
    }

    languagesFromPhase1 = Array.from(uniqueLanguages);
  }

  // Additional extraction: Check nested backend/frontend language fields
  // Common in structure and tech-stack analyzer outputs
  const languageSet = new Set<string>(languagesFromPhase1);

  // Check structure analyzer's backend.language field
  if (structureFindings?.backend?.language) {
    const match = structureFindings.backend.language.match(/^([a-zA-Z]+)/);
    if (match) {
      languageSet.add(match[1].toLowerCase());
    }
  }

  // Check structure analyzer's frontend.language field
  if (structureFindings?.frontend?.language) {
    const match = structureFindings.frontend.language.match(/^([a-zA-Z]+)/);
    if (match) {
      languageSet.add(match[1].toLowerCase());
    }
  }

  // Check tech-stack analyzer's backend.language field
  if (techStackFindings?.backend?.language) {
    const match = techStackFindings.backend.language.match(/^([a-zA-Z]+)/);
    if (match) {
      languageSet.add(match[1].toLowerCase());
    }
  }

  // Check tech-stack analyzer's frontend.language field
  if (techStackFindings?.frontend?.language) {
    const match = techStackFindings.frontend.language.match(/^([a-zA-Z]+)/);
    if (match) {
      languageSet.add(match[1].toLowerCase());
    }
  }

  // Update the final languages array
  languagesFromPhase1 = Array.from(languageSet);

  return languagesFromPhase1;
}
