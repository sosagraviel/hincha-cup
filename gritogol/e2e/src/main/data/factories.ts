/** Unique data per test to avoid collisions between runs and workers. */
export const uid = (caseId: string): string =>
  `qa_${caseId.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Unique display name per scenario that keeps the Gherkin literal readable:
 * "QA Fan A" → "QA Fan A k3x9q". The wall shows it on the card, so it identifies this run's celebration.
 */
export const uniqueDisplayName = (base: string): string =>
  `${base} ${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
