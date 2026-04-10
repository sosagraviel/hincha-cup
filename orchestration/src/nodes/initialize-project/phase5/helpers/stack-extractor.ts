/**
 * Stack Profile Extractor
 *
 * Extract language and service type information from stack profile
 */

import type { StackProfile } from '../../../../schemas/index.js';

/**
 * Helper to get unique languages from services
 */
export function getLanguagesFromStackProfile(stackProfile: StackProfile): string[] {
  return Array.from(new Set(stackProfile.services.map((s) => s.language)));
}

/**
 * Helper to check if stack profile has frontend services
 */
export function hasFrontendService(stackProfile: StackProfile): boolean {
  return stackProfile.services.some((s) => s.type === 'frontend');
}
