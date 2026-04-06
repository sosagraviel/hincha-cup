/**
 * Detect if output starts with preamble text instead of section header
 */

import { PREAMBLE_PATTERNS, SECTION_MARKERS } from "./types.js";

/**
 * Detect if output starts with preamble text instead of section header
 */
export function detectPreambleText(output: string): string | null {
  const firstLine = output.split("\n")[0].trim();

  // Check if first line matches preamble patterns
  for (const pattern of PREAMBLE_PATTERNS) {
    if (pattern.test(firstLine)) {
      return [
        'OUTPUT STARTS WITH PREAMBLE - MUST START WITH "# CLAUDE.md Content"',
        "",
        "🔴 WHAT WENT WRONG:",
        `   Your response begins with: "${firstLine.substring(0, 60)}..."`,
        "   This is descriptive text, not the required content.",
        "",
        "🟢 HOW TO FIX:",
        "   - Do NOT explain what you are doing",
        '   - Do NOT say "Here is..." or "Let me..."',
        "   - Do NOT describe your process",
        "   - START DIRECTLY with: # CLAUDE.md Content",
        "",
        "❌ WRONG (examples):",
        '   "Let me output the markdown content..."',
        '   "Here is the generated CLAUDE.md..."',
        '   "Based on my analysis, I will produce..."',
        "",
        "✅ CORRECT:",
        "   # CLAUDE.md Content",
        "   ",
        "   # ProjectName",
        "   ...",
      ].join("\n");
    }
  }

  // Check if first non-empty line is NOT the header
  const firstNonEmpty = output
    .split("\n")
    .find((line) => line.trim().length > 0)
    ?.trim();
  if (firstNonEmpty && firstNonEmpty !== SECTION_MARKERS.CLAUDE_MD_HEADER) {
    // Only warn if it's clearly not close to the header
    if (!firstNonEmpty.includes("CLAUDE") && !firstNonEmpty.startsWith("#")) {
      return [
        "OUTPUT DOES NOT START WITH CORRECT HEADER",
        "",
        "🔴 WHAT WENT WRONG:",
        `   First line is: "${firstNonEmpty.substring(0, 60)}..."`,
        `   Expected: "# CLAUDE.md Content"`,
        "",
        "🟢 HOW TO FIX:",
        "   Your response must BEGIN with EXACTLY:",
        "   # CLAUDE.md Content",
      ].join("\n");
    }
  }

  return null;
}
