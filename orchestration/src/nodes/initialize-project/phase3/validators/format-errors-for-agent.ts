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
      !e.startsWith('🔴') &&
      !e.startsWith('🟢') &&
      !e.startsWith('❌') &&
      !e.startsWith('✅') &&
      !e.startsWith('🟡') &&
      !e.startsWith('📋') &&
      !e.startsWith(' '),
  ).length;

  const header = [
    '═══════════════════════════════════════════════════════════════',
    '                    SYNTHESIS VALIDATION FAILED',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Found ${errorCount} error(s) in your output.`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                         ERRORS',
    '───────────────────────────────────────────────────────────────',
    '',
  ];

  const footer = [
    '',
    '───────────────────────────────────────────────────────────────',
    '                    COMPLETE REQUIRED FORMAT',
    '───────────────────────────────────────────────────────────────',
    '',
    'Your ENTIRE response must be EXACTLY this five-section structure:',
    '',
    '# CLAUDE.md Content',
    '',
    '# ProjectName',
    '',
    '## Tech Stack',
    '- …',
    '',
    '## File Placement Guide',
    '| File Type | Location | Example |',
    '|-----------|----------|---------|',
    '| … | … | … |',
    '',
    '## Essential Commands',
    '| Task | Command |',
    '|------|---------|',
    '| … | … |',
    '',
    '---',
    '',
    '# code-conventions/SKILL.md Content',
    '',
    '---',
    'name: code-conventions',
    'description: Project-specific coding conventions, gotchas, and WRONG/CORRECT examples',
    '---',
    '',
    '# Code Conventions',
    '…',
    '```typescript',
    '// WRONG',
    '…',
    '// CORRECT',
    '…',
    '```',
    '',
    '---',
    '',
    '# multi-file-workflows/SKILL.md Content',
    '',
    '---',
    'name: multi-file-workflows',
    'description: Ordered checklists for cross-cutting changes',
    '---',
    '',
    '# Multi-File Workflows',
    '',
    '## Adding a New API Endpoint',
    '1. …',
    '2. …',
    '',
    '---',
    '',
    '# testing-conventions/SKILL.md Content',
    '',
    '---',
    'name: testing-conventions',
    'description: Project-specific testing conventions, fixtures, and examples',
    '---',
    '',
    '# Testing Conventions',
    '…',
    '```typescript',
    '// example test code',
    '```',
    '',
    '---',
    '',
    '# Architectural Narrative Content',
    '',
    '# Architectural Narrative',
    '',
    '## Repository Shape',
    '…',
    '',
    '## Service Inventory',
    '…',
    '',
    '## Cross-Service Flows',
    '…',
    '',
    '───────────────────────────────────────────────────────────────',
    '          ⚠️  START YOUR RESPONSE WITH "# CLAUDE.md Content"  ⚠️',
    '───────────────────────────────────────────────────────────────',
  ];

  return [...header, ...errors, ...footer];
}
