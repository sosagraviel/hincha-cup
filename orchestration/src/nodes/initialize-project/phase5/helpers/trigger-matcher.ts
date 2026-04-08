/**
 * Trigger Matcher
 *
 * Match skill triggers with detected stack
 */

import type { SkillConfig, DetectedStack, TriggerMatchResult } from "../types.js";

/**
 * Check if skill triggers match detected stack
 * Uses delimiter-based prefix matching to avoid false positives
 */
export function matchesTriggers(skill: SkillConfig, detectedStack: DetectedStack): TriggerMatchResult {
  if (!skill.triggers || skill.triggers.length === 0) {
    return { matches: false, matchedTriggers: [] };
  }

  const matchedTriggers: string[] = [];

  for (const trigger of skill.triggers) {
    const triggerNormalized = trigger.toLowerCase().replace(/[^a-z0-9]/g, "");
    const triggerLower = trigger.toLowerCase();

    // Try exact match first (fast path using normalized strings)
    if (detectedStack.normalized.has(triggerNormalized)) {
      matchedTriggers.push(trigger);
      continue;
    }

    // Fallback to prefix matching with delimiter check (using original strings)
    // This prevents false positives like "go" matching "googleapis" or "java" matching "javascript"
    // while allowing "google-cloud" to match "@google-cloud/firestore"
    for (const original of detectedStack.original) {
      // Handle scoped packages: strip leading @ if present
      const packageName = original.startsWith("@") ? original.slice(1) : original;

      if (packageName.startsWith(triggerLower)) {
        const nextCharIndex = triggerLower.length;
        const nextChar = packageName[nextCharIndex];

        // Match if:
        // 1. Trigger matches entire package name (nextChar is undefined), OR
        // 2. Next character is a delimiter: /, -, _, or @
        if (!nextChar || /[\/\-_@]/.test(nextChar)) {
          matchedTriggers.push(trigger);
          break; // Found a match, move to next trigger
        }
      }
    }
  }

  return {
    matches: matchedTriggers.length > 0,
    matchedTriggers,
  };
}
