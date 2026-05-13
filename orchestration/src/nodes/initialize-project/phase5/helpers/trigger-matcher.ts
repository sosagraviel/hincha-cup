/**
 * Trigger Matcher
 *
 * Match skill triggers with detected stack
 */

import type { SkillConfig, DetectedStack, TriggerMatchResult } from '../types.js';

/**
 * Check if skill triggers match detected stack
 * Uses delimiter-based prefix matching to avoid false positives
 */
export function matchesTriggers(
  skill: SkillConfig,
  detectedStack: DetectedStack,
): TriggerMatchResult {
  if (!skill.triggers || skill.triggers.length === 0) {
    return { matches: false, matchedTriggers: [] };
  }

  const matchedTriggers: string[] = [];

  for (const trigger of skill.triggers) {
    const triggerNormalized = trigger.toLowerCase().replace(/[^a-z0-9]/g, '');
    const triggerLower = trigger.toLowerCase();

    if (detectedStack.normalized.has(triggerNormalized)) {
      matchedTriggers.push(trigger);
      continue;
    }

    for (const original of detectedStack.original) {
      const packageName = original.startsWith('@') ? original.slice(1) : original;

      if (packageName.startsWith(triggerLower)) {
        const nextCharIndex = triggerLower.length;
        const nextChar = packageName[nextCharIndex];

        if (!nextChar || /[\/\-_@.\s\d]/.test(nextChar)) {
          matchedTriggers.push(trigger);
          break;
        }
      }
    }
  }

  return {
    matches: matchedTriggers.length > 0,
    matchedTriggers,
  };
}
