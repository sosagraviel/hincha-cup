/**
 * Validate instruction file content structure and quality.
 * Works for both CLAUDE.md and AGENTS.md.
 */

import { getInstructionFileName } from '../../../../utils/provider-paths.js';

/**
 * Validate CLAUDE.md / AGENTS.md content structure and quality
 */
export function validateClaudeMdContent(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split('\n');
  const fileName = getInstructionFileName();

  // Check for project name heading (allows both uppercase and lowercase first letter)
  const hasProjectHeading = lines.some((line) => /^# [a-zA-Z]/.test(line.trim()));
  if (!hasProjectHeading) {
    errors.push(
      `${fileName} MISSING PROJECT NAME HEADING`,
      '',
      '🔴 WHAT WENT WRONG:',
      `   ${fileName} should start with "# ProjectName" (level-1 heading).`,
      '',
      '🟢 HOW TO FIX:',
      '   Add a project name heading as the first content line:',
      '   # MyProject',
    );
  }

  // Check for required sections (## headings)
  const requiredSections = ['Tech Stack', 'File Placement', 'Essential Commands'];
  const sectionHeadings = lines
    .filter((line) => /^## /.test(line.trim()))
    .map((line) => line.trim().replace(/^## /, ''));

  const missingSections = requiredSections.filter(
    (section) => !sectionHeadings.some((h) => h.toLowerCase().includes(section.toLowerCase())),
  );

  if (missingSections.length > 0) {
    errors.push(
      `${fileName} MISSING REQUIRED SECTIONS: ${missingSections.join(', ')}`,
      '',
      '🔴 WHAT WENT WRONG:',
      `   ${fileName} must include these sections:`,
      '   - ## Tech Stack',
      '   - ## File Placement Guide',
      '   - ## Essential Commands',
      '',
      '🟢 HOW TO FIX:',
      '   Add the missing sections with appropriate content.',
    );
  }

  // Check for table format (| pipe characters)
  const hasTable = lines.some((line) => line.includes('|') && line.trim().startsWith('|'));
  if (!hasTable) {
    errors.push(
      `${fileName} MISSING TABLE FORMAT`,
      '',
      '🔴 WHAT WENT WRONG:',
      `   ${fileName} should use table format for File Placement Guide and Commands.`,
      '',
      '🟢 HOW TO FIX:',
      '   Use markdown table format:',
      '   | File Type | Location | Example |',
      '|-----------|----------|---------|',
      '   | Controller | src/controllers/ | user.controller.ts |',
    );
  }

  // Check for structured content (bullet lists OR tables)
  const hasBulletList = lines.some((line) => /^[-*] /.test(line.trim()));

  // Accept either bullet lists or tables for structured content (e.g., Tech Stack)
  // Tables are already validated above, so if we have either format, we're good
  if (!hasBulletList && !hasTable) {
    errors.push(
      `${fileName} MISSING STRUCTURED CONTENT`,
      '',
      '🔴 WHAT WENT WRONG:',
      `   ${fileName} should use bullet lists or tables for structured data like Tech Stack.`,
      '',
      '🟢 HOW TO FIX:',
      '   Use bullet format:',
      '   - TypeScript 5.3',
      '   - Node.js 20.x',
      '   - PostgreSQL 15',
      '',
      '   OR use table format:',
      '   | Technology | Version |',
      '   |------------|---------|',
      '   | TypeScript | 5.3 |',
      '   | Node.js | 20.x |',
    );
  }

  return errors;
}
