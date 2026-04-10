/**
 * Detect if agent mentioned using Write tool
 */

import { WRITE_TOOL_PATTERNS } from './types.js';

/**
 * Detect if agent mentioned using Write tool
 */
export function detectWriteToolUsage(output: string): string | null {
  const lowerOutput = output.toLowerCase();

  for (const pattern of WRITE_TOOL_PATTERNS) {
    if (pattern.test(lowerOutput)) {
      return [
        'OUTPUT REFERENCES FILE WRITING - DO NOT USE WRITE TOOL',
        '',
        '🔴 WHAT WENT WRONG:',
        '   You mentioned writing files or using the Write tool.',
        '   The synthesis agent must NOT write files directly.',
        '',
        '🟢 HOW TO FIX:',
        '   - Do NOT use the Write tool',
        '   - Do NOT use bash commands to create files',
        '   - Do NOT say "I wrote..." or "I created file..."',
        '   - ONLY output the markdown content in your response',
        '   - Phase 4 will handle writing the files',
      ].join('\n');
    }
  }

  return null;
}
