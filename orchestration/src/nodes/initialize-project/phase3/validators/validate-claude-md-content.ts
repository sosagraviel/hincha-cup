/**
 * Validate CLAUDE.md content structure and quality
 */

/**
 * Validate CLAUDE.md content structure and quality
 */
export function validateClaudeMdContent(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split("\n");

  // Check for project name heading
  const hasProjectHeading = lines.some((line) => /^# [A-Z]/.test(line.trim()));
  if (!hasProjectHeading) {
    errors.push(
      "CLAUDE.md MISSING PROJECT NAME HEADING",
      "",
      "🔴 WHAT WENT WRONG:",
      '   CLAUDE.md should start with "# ProjectName" (level-1 heading).',
      "",
      "🟢 HOW TO FIX:",
      "   Add a project name heading as the first content line:",
      "   # MyProject",
    );
  }

  // Check for required sections (## headings)
  const requiredSections = [
    "Tech Stack",
    "File Placement",
    "Essential Commands",
  ];
  const sectionHeadings = lines
    .filter((line) => /^## /.test(line.trim()))
    .map((line) => line.trim().replace(/^## /, ""));

  const missingSections = requiredSections.filter(
    (section) =>
      !sectionHeadings.some((h) =>
        h.toLowerCase().includes(section.toLowerCase()),
      ),
  );

  if (missingSections.length > 0) {
    errors.push(
      `CLAUDE.md MISSING REQUIRED SECTIONS: ${missingSections.join(", ")}`,
      "",
      "🔴 WHAT WENT WRONG:",
      "   CLAUDE.md must include these sections:",
      "   - ## Tech Stack",
      "   - ## File Placement Guide",
      "   - ## Essential Commands",
      "",
      "🟢 HOW TO FIX:",
      "   Add the missing sections with appropriate content.",
    );
  }

  // Check for table format (| pipe characters)
  const hasTable = lines.some(
    (line) => line.includes("|") && line.trim().startsWith("|"),
  );
  if (!hasTable) {
    errors.push(
      "CLAUDE.md MISSING TABLE FORMAT",
      "",
      "🔴 WHAT WENT WRONG:",
      "   CLAUDE.md should use table format for File Placement Guide and Commands.",
      "",
      "🟢 HOW TO FIX:",
      "   Use markdown table format:",
      "   | File Type | Location | Example |",
      "|-----------|----------|---------|",
      "   | Controller | src/controllers/ | user.controller.ts |",
    );
  }

  // Check for bullet lists
  const hasBulletList = lines.some((line) => /^[-*] /.test(line.trim()));
  if (!hasBulletList) {
    errors.push(
      "CLAUDE.md MISSING BULLET LISTS",
      "",
      "🔴 WHAT WENT WRONG:",
      "   CLAUDE.md should use bullet lists for Tech Stack.",
      "",
      "🟢 HOW TO FIX:",
      "   Use bullet format for Tech Stack:",
      "   - TypeScript 5.3",
      "   - Node.js 20.x",
      "   - PostgreSQL 15",
    );
  }

  return errors;
}
