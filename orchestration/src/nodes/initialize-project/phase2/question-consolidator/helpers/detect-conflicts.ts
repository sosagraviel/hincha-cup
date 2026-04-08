import type { AnalyzerOutput } from "../../../../../state/schemas/initialize-project.schema.js";
import type { Conflict } from "../types.js";

/**
 * Detect conflicts between analyzer findings
 */
export function detectConflicts(analyzers: AnalyzerOutput[]): Conflict[] {
  const conflicts: Conflict[] = [];

  const techStacks = analyzers
    .filter(a =>
      (a.findings as any)?.tech_stack ||
      (a.findings as any)?.languages ||
      (a.findings as any)?.frameworks
    )
    .map(a => ({
      agent: a.agent_name,
      languages: (a.findings as any)?.languages || (a.findings as any)?.tech_stack?.languages || [],
      frameworks: (a.findings as any)?.frameworks || (a.findings as any)?.tech_stack?.frameworks || []
    }));

  if (techStacks.length > 1) {
    const allLanguages = new Set<string>();
    const languagesByAgent: Record<string, string[]> = {};

    techStacks.forEach(stack => {
      const langs = Array.isArray(stack.languages) ? stack.languages : [];
      langs.forEach(lang => allLanguages.add(String(lang)));
      languagesByAgent[stack.agent] = langs.map(String);
    });

    const uniqueAgents = Object.keys(languagesByAgent);
    if (uniqueAgents.length > 1) {
      const firstLangs = new Set(languagesByAgent[uniqueAgents[0]]);
      const hasConflict = uniqueAgents.slice(1).some(agent => {
        const langs = new Set(languagesByAgent[agent]);
        return firstLangs.size !== langs.size ||
          ![...firstLangs].every(lang => langs.has(lang));
      });

      if (hasConflict) {
        conflicts.push({
          type: 'language_detection',
          agents: uniqueAgents,
          conflicting_values: Object.values(languagesByAgent),
          severity: 'medium'
        });
      }
    }
  }

  return conflicts;
}
