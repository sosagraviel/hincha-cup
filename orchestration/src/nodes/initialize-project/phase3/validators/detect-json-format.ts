/**
 * Detect if output is JSON format instead of markdown
 */

/**
 * Detect if output is JSON format instead of markdown
 */
export function detectJSONFormat(output: string): string | null {
  // Quick check: starts with { and contains agent_name
  if (output.startsWith("{") && output.includes('"agent_name"')) {
    return [
      "OUTPUT IS JSON FORMAT - MUST BE MARKDOWN",
      "",
      "🔴 WHAT WENT WRONG:",
      '   You output JSON like: { "agent_name": "...", "findings": {...} }',
      "   This is the WRONG format for the synthesis agent.",
      "",
      "🟢 HOW TO FIX:",
      "   Output RAW MARKDOWN TEXT, not JSON.",
      "   Your response should START with: # CLAUDE.md Content",
      "",
      "❌ WRONG:",
      "   {",
      '     "agent_name": "architect-synthesizer",',
      '     "findings": { "claude_md": "..." }',
      "   }",
      "",
      "✅ CORRECT:",
      "   # CLAUDE.md Content",
      "   ",
      "   # ProjectName",
      "   ",
      "   ## Tech Stack",
      "   ...",
    ].join("\n");
  }

  // Check for JSON object anywhere in output (handles preamble + JSON)
  const jsonObjectMatch = output.match(/\{[^{}]*"agent_name"[^{}]*\}/s);
  if (jsonObjectMatch) {
    return [
      "OUTPUT CONTAINS JSON FORMAT - MUST BE MARKDOWN",
      "",
      "🔴 WHAT WENT WRONG:",
      "   Your output includes a JSON object.",
      "   This is the WRONG format for the synthesis agent.",
      "",
      "🟢 HOW TO FIX:",
      "   Output RAW MARKDOWN TEXT only, not JSON.",
      "   Your response should START with: # CLAUDE.md Content",
      "",
      "❌ WRONG:",
      "   Let me create the output:",
      "   {",
      '     "agent_name": "architect-synthesizer",',
      '     "findings": { ... }',
      "   }",
      "",
      "✅ CORRECT:",
      "   # CLAUDE.md Content",
      "   ",
      "   # ProjectName",
      "   ",
      "   ## Tech Stack",
      "   ...",
    ].join("\n");
  }

  // Additional check: valid JSON object
  if (output.startsWith("{") && output.endsWith("}")) {
    try {
      const parsed = JSON.parse(output);
      if (typeof parsed === "object" && parsed !== null) {
        return [
          "OUTPUT APPEARS TO BE JSON - MUST BE MARKDOWN",
          "",
          "🔴 WHAT WENT WRONG:",
          "   Your output is a valid JSON object, but synthesis requires MARKDOWN.",
          "",
          "🟢 HOW TO FIX:",
          '   Output the markdown content directly, starting with "# CLAUDE.md Content"',
        ].join("\n");
      }
    } catch {
      // Not valid JSON, that's fine
    }
  }

  return null;
}
