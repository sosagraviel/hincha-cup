/**
 * Format errors into a clear, actionable message for the agent
 */

/**
 * Format errors into a clear, actionable message for the agent
 */
export function formatErrorsForAgent(errors: string[]): string[] {
  const errorCount = errors.filter(
    (e) =>
      e.length > 0 &&
      !e.startsWith("🔴") &&
      !e.startsWith("🟢") &&
      !e.startsWith("❌") &&
      !e.startsWith("✅") &&
      !e.startsWith("🟡") &&
      !e.startsWith("📋") &&
      !e.startsWith(" "),
  ).length;

  const header = [
    "═══════════════════════════════════════════════════════════════",
    "                    SYNTHESIS VALIDATION FAILED",
    "═══════════════════════════════════════════════════════════════",
    "",
    `Found ${errorCount} error(s) in your output.`,
    "",
    "───────────────────────────────────────────────────────────────",
    "                         ERRORS",
    "───────────────────────────────────────────────────────────────",
    "",
  ];

  const footer = [
    "",
    "───────────────────────────────────────────────────────────────",
    "                    COMPLETE REQUIRED FORMAT",
    "───────────────────────────────────────────────────────────────",
    "",
    "Your ENTIRE response must be EXACTLY this structure:",
    "",
    "# CLAUDE.md Content",
    "",
    "# ProjectName",
    "",
    "## Tech Stack",
    "- TypeScript 5.3",
    "- Node.js 20.x",
    "...",
    "",
    "## File Placement Guide",
    "| File Type | Location | Example |",
    "|-----------|----------|---------|",
    "| Controller | src/controllers/ | user.controller.ts |",
    "...",
    "",
    "## Essential Commands",
    "| Task | Command |",
    "|------|---------|",
    "| Dev | npm run dev |",
    "...",
    "",
    "---",
    "",
    "# project-context/SKILL.md Content",
    "",
    "---",
    "name: project-context",
    "description: Deep architectural knowledge",
    "user-invokable: true",
    "---",
    "",
    "# Project Context: ProjectName",
    "",
    "## When to Use This Skill",
    "- When implementing features",
    "...",
    "",
    "## Architecture Deep Dive",
    "...",
    "",
    "## Gotchas & Non-Obvious Patterns",
    "```typescript",
    "// Wrong approach",
    "...",
    "// Correct approach",
    "...",
    "```",
    "",
    "───────────────────────────────────────────────────────────────",
    '          ⚠️  START YOUR RESPONSE WITH "# CLAUDE.md Content"  ⚠️',
    "───────────────────────────────────────────────────────────────",
  ];

  return [...header, ...errors, ...footer];
}
