/**
 * Validate project-context content structure and quality
 */

/**
 * Validate project-context content structure and quality
 */
export function validateProjectContextContent(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split('\n');

  // Check for YAML frontmatter
  const frontmatterStart = content.indexOf('---');
  if (frontmatterStart === -1) {
    errors.push(
      'PROJECT-CONTEXT MISSING YAML FRONTMATTER',
      '',
      '🔴 WHAT WENT WRONG:',
      '   project-context must start with YAML frontmatter.',
      '',
      '🟢 HOW TO FIX:',
      '   Start project-context content with:',
      '   ---',
      '   name: project-context',
      '   description: Deep architectural knowledge for ProjectName',
      '   ---',
    );
  } else {
    // Check frontmatter content
    const frontmatterEnd = content.indexOf('---', frontmatterStart + 3);
    if (frontmatterEnd === -1) {
      errors.push(
        'PROJECT-CONTEXT FRONTMATTER NOT CLOSED',
        '',
        '🔴 WHAT WENT WRONG:',
        '   YAML frontmatter must be enclosed by --- markers.',
        '',
        '🟢 HOW TO FIX:',
        '   Ensure frontmatter has closing ---:',
        '   ---',
        '   name: project-context',
        '   ---',
      );
    } else {
      const frontmatter = content.substring(frontmatterStart + 3, frontmatterEnd);

      // Check for required name field
      if (!frontmatter.includes('name:')) {
        errors.push(
          'PROJECT-CONTEXT FRONTMATTER MISSING "name:" FIELD',
          '',
          '🔴 WHAT WENT WRONG:',
          '   YAML frontmatter must include "name: project-context"',
          '',
          '🟢 HOW TO FIX:',
          '   ---',
          '   name: project-context',
          '   description: Deep architectural knowledge',
          '   ---',
        );
      } else if (!frontmatter.includes('project-context')) {
        errors.push(
          'PROJECT-CONTEXT FRONTMATTER HAS WRONG NAME',
          '',
          '🔴 WHAT WENT WRONG:',
          '   The "name:" field must be "project-context" exactly.',
          '',
          '🟢 HOW TO FIX:',
          '   ---',
          '   name: project-context  # <-- EXACT value required',
          '   ---',
        );
      }
    }
  }

  // Check for main heading
  const hasMainHeading = lines.some((line) => /^# Project Context/.test(line.trim()));
  if (!hasMainHeading) {
    errors.push(
      'PROJECT-CONTEXT MISSING MAIN HEADING',
      '',
      '🔴 WHAT WENT WRONG:',
      '   project-context should have "# Project Context: ProjectName" heading.',
      '',
      '🟢 HOW TO FIX:',
      '   After frontmatter, add:',
      '   # Project Context: MyProjectName',
    );
  }

  // Check for code examples (required for gotchas)
  const hasCodeBlock = content.includes('```');
  if (!hasCodeBlock) {
    errors.push(
      'PROJECT-CONTEXT MISSING CODE EXAMPLES',
      '',
      '🔴 WHAT WENT WRONG:',
      '   project-context must include code examples for gotchas and patterns.',
      '',
      '🟢 HOW TO FIX:',
      '   Include code examples showing WRONG vs CORRECT approaches:',
      '   ```typescript',
      '   // Wrong approach',
      '   async function bad() { ... }',
      '   ',
      '   // Correct approach',
      '   async function good() { ... }',
      '   ```',
    );
  }

  return errors;
}
