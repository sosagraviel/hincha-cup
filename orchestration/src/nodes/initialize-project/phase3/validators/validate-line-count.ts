/**
 * Validate line count for a section
 */

import type { LineCountResult } from './types.js';

/**
 * Validate line count for a section
 */
export function validateLineCount(
  content: string,
  minRequired: number,
  maxAllowed: number,
  _sectionName: string,
): LineCountResult {
  const lineCount = content.split('\n').length;

  return {
    valid: lineCount >= minRequired && lineCount <= maxAllowed,
    lineCount,
    minRequired,
    maxAllowed,
  };
}
