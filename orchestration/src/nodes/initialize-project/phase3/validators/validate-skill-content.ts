/**
 * Validate the body of one of the three prescriptive skills the synthesis
 * agent emits: `code-conventions`, `multi-file-workflows`, `testing-conventions`.
 *
 * Each skill body must:
 *  1. Begin with YAML frontmatter (--- fenced) carrying a `name:` field that
 *     exactly matches the expected skill name.
 *  2. Contain at least one level-1 markdown heading (the skill body's H1).
 *  3. For `code-conventions` and `testing-conventions`: contain at least one
 *     fenced code block (the prescriptive value lives in the WRONG/CORRECT
 *     code examples; a skill body with no code is too thin to pay for).
 *
 * Stack-agnostic — every check operates on string shape only.
 */

interface SkillContentValidatorOptions {
  /** Display label used in error messages (e.g. "code-conventions"). */
  skillLabel: string;
  /** Expected exact value of the YAML `name:` field. */
  expectedName: string;
  /** When true, the body MUST contain at least one fenced code block. */
  requiresCodeExamples: boolean;
}

/**
 * Returns an array of error messages; empty when the content passes.
 */
export function validateSkillContent(
  content: string,
  options: SkillContentValidatorOptions,
): string[] {
  const errors: string[] = [];
  const { skillLabel, expectedName, requiresCodeExamples } = options;
  const fileLabel = `${skillLabel}/SKILL.md`;

  if (!content || !content.trim()) {
    errors.push(
      `${fileLabel.toUpperCase()} IS EMPTY`,
      '',
      '🔴 WHAT WENT WRONG:',
      `   The ${skillLabel} section emitted no content.`,
      '',
      '🟢 HOW TO FIX:',
      `   Emit ${fileLabel} content starting with YAML frontmatter, then a`,
      `   level-1 heading, then the prescriptive body.`,
    );
    return errors;
  }

  const frontmatterStart = content.indexOf('---');
  if (frontmatterStart === -1) {
    errors.push(
      `${fileLabel.toUpperCase()} MISSING YAML FRONTMATTER`,
      '',
      '🔴 WHAT WENT WRONG:',
      `   ${fileLabel} must start with YAML frontmatter delimited by ---.`,
      '',
      '🟢 HOW TO FIX:',
      '   Start the section body with:',
      '   ---',
      `   name: ${expectedName}`,
      `   description: <one-line description>`,
      '   ---',
    );
  } else {
    const frontmatterEnd = content.indexOf('---', frontmatterStart + 3);
    if (frontmatterEnd === -1) {
      errors.push(
        `${fileLabel.toUpperCase()} FRONTMATTER NOT CLOSED`,
        '',
        '🔴 WHAT WENT WRONG:',
        '   YAML frontmatter must be enclosed by --- markers (open and close).',
        '',
        '🟢 HOW TO FIX:',
        '   Ensure frontmatter has closing ---:',
        '   ---',
        `   name: ${expectedName}`,
        '   ---',
      );
    } else {
      const frontmatter = content.substring(frontmatterStart + 3, frontmatterEnd);

      if (!frontmatter.includes('name:')) {
        errors.push(
          `${fileLabel.toUpperCase()} FRONTMATTER MISSING "name:" FIELD`,
          '',
          '🔴 WHAT WENT WRONG:',
          `   YAML frontmatter must include "name: ${expectedName}".`,
          '',
          '🟢 HOW TO FIX:',
          '   ---',
          `   name: ${expectedName}`,
          '   description: <one-line description>',
          '   ---',
        );
      } else {
        const nameMatch = frontmatter.match(/^\s*name:\s*([^\s#]+)/m);
        const actualName = nameMatch ? nameMatch[1].trim() : '';
        if (actualName !== expectedName) {
          errors.push(
            `${fileLabel.toUpperCase()} FRONTMATTER HAS WRONG name`,
            '',
            '🔴 WHAT WENT WRONG:',
            `   The "name:" field is "${actualName}" but must be "${expectedName}".`,
            '',
            '🟢 HOW TO FIX:',
            '   ---',
            `   name: ${expectedName}  # <-- EXACT value required`,
            '   ---',
          );
        }
      }
    }
  }

  const lines = content.split('\n');
  const hasH1 = lines.some((line) => /^#\s+\S/.test(line));
  if (!hasH1) {
    errors.push(
      `${fileLabel.toUpperCase()} MISSING LEVEL-1 HEADING`,
      '',
      '🔴 WHAT WENT WRONG:',
      `   ${fileLabel} must include a level-1 markdown heading after the frontmatter.`,
      '',
      '🟢 HOW TO FIX:',
      '   After the closing ---, add a heading line such as:',
      `   # ${expectedName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
    );
  }

  if (requiresCodeExamples) {
    const hasCodeBlock = content.includes('```');
    if (!hasCodeBlock) {
      errors.push(
        `${fileLabel.toUpperCase()} MISSING CODE EXAMPLES`,
        '',
        '🔴 WHAT WENT WRONG:',
        `   ${fileLabel} must include at least one fenced code block. The`,
        '   prescriptive value lives in WRONG/CORRECT examples; a skill body',
        '   with no code is too thin to be worth preloading.',
        '',
        '🟢 HOW TO FIX:',
        '   Include code examples showing WRONG vs CORRECT approaches:',
        '   ```typescript',
        '   // Wrong approach',
        '   async function bad() { … }',
        '',
        '   // Correct approach',
        '   async function good() { … }',
        '   ```',
      );
    }
  }

  return errors;
}
