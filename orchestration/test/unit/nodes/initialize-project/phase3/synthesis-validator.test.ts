import { describe, it, expect } from "vitest";
import {
  validateSynthesisOutput,
  type SynthesisValidationResult,
} from "../../../../../src/nodes/initialize-project/phase3/validators/index.js";
import { extractSynthesisMarkdown } from "../../../../../src/nodes/initialize-project/phase3/validators/extract-synthesis-markdown.js";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate valid CLAUDE.md content with specified line count
 */
function generateValidClaudeMd(lineCount: number = 50): string {
  const lines = [
    "# TestProject",
    "",
    "## Tech Stack",
    "- TypeScript 5.3",
    "- Node.js 20.x",
    "- PostgreSQL 15",
    "",
    "## File Placement Guide",
    "| File Type | Location | Example |",
    "|-----------|----------|---------|",
    "| Controller | src/controllers/ | user.controller.ts |",
    "| Service | src/services/ | user.service.ts |",
    "",
    "## Essential Commands",
    "| Task | Command |",
    "|------|---------|",
    "| Dev | npm run dev |",
    "| Test | npm test |",
  ];

  // Pad with additional lines to reach target
  while (lines.length < lineCount) {
    lines.push("- Additional line " + lines.length);
  }

  return lines.join("\n");
}

/**
 * Generate valid project-context content with specified line count
 */
function generateValidProjectContext(lineCount: number = 100): string {
  const lines = [
    "---",
    "name: project-context",
    "description: Deep architectural knowledge",
    "user-invokable: true",
    "---",
    "",
    "# Project Context: TestProject",
    "",
    "## When to Use This Skill",
    "- When implementing features",
    "- When debugging issues",
    "",
    "## Architecture Deep Dive",
    "The system uses a layered architecture.",
    "",
    "## Gotchas & Non-Obvious Patterns",
    "```typescript",
    "// Wrong approach",
    "async function bad() { return null; }",
    "",
    "// Correct approach",
    "async function good() { return result; }",
    "```",
  ];

  // Pad with additional lines to reach target
  while (lines.length < lineCount) {
    lines.push("Additional context line " + lines.length);
  }

  return lines.join("\n");
}

/**
 * Generate complete valid synthesis output
 */
function generateValidSynthesis(
  claudeLines: number = 50,
  contextLines: number = 100,
): string {
  return [
    "# CLAUDE.md Content",
    "",
    generateValidClaudeMd(claudeLines),
    "",
    "---",
    "",
    "# project-context/SKILL.md Content",
    "",
    generateValidProjectContext(contextLines),
  ].join("\n");
}

// ============================================================================
// TEST SUITE: EMPTY OUTPUT
// ============================================================================

describe("validateSynthesisOutput - Empty Output", () => {
  it("should reject completely empty output", () => {
    const result = validateSynthesisOutput("");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("OUTPUT IS EMPTY"))).toBe(true);
  });

  it("should reject whitespace-only output", () => {
    const result = validateSynthesisOutput("   \n\n   \t  ");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("OUTPUT IS EMPTY"))).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: JSON FORMAT DETECTION
// ============================================================================

describe("validateSynthesisOutput - JSON Format Detection", () => {
  it("should detect JSON with agent_name field", () => {
    const jsonOutput = JSON.stringify({
      agent_name: "architect-synthesizer",
      findings: { test: "data" },
    });
    const result = validateSynthesisOutput(jsonOutput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("OUTPUT IS JSON FORMAT"))).toBe(
      true,
    );
    expect(result.errors.some((e) => e.includes("MUST BE MARKDOWN"))).toBe(
      true,
    );
  });

  it("should detect valid JSON object even without agent_name", () => {
    const jsonOutput = JSON.stringify({
      data: "test",
      nested: { key: "value" },
    });
    const result = validateSynthesisOutput(jsonOutput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("JSON"))).toBe(true);
  });

  it("should not flag markdown that starts with curly brace in code block", () => {
    const output = generateValidSynthesis();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: PREAMBLE DETECTION
// ============================================================================

describe("validateSynthesisOutput - Preamble Detection", () => {
  const preamblePatterns = [
    "Let me output the markdown content...",
    "I'll generate the CLAUDE.md and project-context...",
    "Here's what was produced:",
    "Now I will create the files...",
    "Based on my analysis, here is the output:",
    "According to your requirements, I have generated:",
    "I have generated the following content:",
    "The output contains two files:",
    "Below are the markdown files:",
    "Outputting the synthesis results...",
    "Generating the CLAUDE.md file...",
  ];

  preamblePatterns.forEach((preamble) => {
    it(`should detect preamble: "${preamble.substring(0, 30)}..."`, () => {
      const output = `${preamble}\n\n${generateValidSynthesis()}`;
      const result = validateSynthesisOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PREAMBLE"))).toBe(true);
    });
  });

  it("should not flag valid output that starts with section header", () => {
    const output = generateValidSynthesis();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: WRITE TOOL DETECTION
// ============================================================================

describe("validateSynthesisOutput - Write Tool Detection", () => {
  const writeToolPatterns = [
    "I wrote to the file",
    "Created file CLAUDE.md",
    "Saved content to .claude/",
    "Using Write tool to create",
    "writeFileSync was used",
    "fs.write operation",
  ];

  writeToolPatterns.forEach((pattern) => {
    it(`should detect Write tool usage: "${pattern}"`, () => {
      const output = `${generateValidSynthesis()}\n\n${pattern}`;
      const result = validateSynthesisOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("WRITE TOOL"))).toBe(true);
    });
  });
});

// ============================================================================
// TEST SUITE: LENGTH VALIDATION
// ============================================================================

describe("validateSynthesisOutput - Length Validation", () => {
  it("should reject output shorter than 500 characters", () => {
    const shortOutput = "# CLAUDE.md Content\n\nShort content";
    const result = validateSynthesisOutput(shortOutput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("TOO SHORT"))).toBe(true);
  });

  it("should accept output longer than 500 characters with valid structure", () => {
    const output = generateValidSynthesis();
    expect(output.length).toBeGreaterThan(500);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: SECTION STRUCTURE
// ============================================================================

describe("validateSynthesisOutput - Section Structure", () => {
  it("should reject output missing CLAUDE.md header", () => {
    const output = `
Some content here

---

# project-context/SKILL.md Content

${generateValidProjectContext()}
    `.trim();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("CANNOT FIND REQUIRED SECTIONS")),
    ).toBe(true);
  });

  it("should reject output missing separator", () => {
    const output = `
# CLAUDE.md Content

${generateValidClaudeMd()}

# project-context/SKILL.md Content

${generateValidProjectContext()}
    `.trim();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("CANNOT FIND REQUIRED SECTIONS")),
    ).toBe(true);
  });

  it("should reject output missing project-context header", () => {
    const output = `
# CLAUDE.md Content

${generateValidClaudeMd()}

---

${generateValidProjectContext()}
    `.trim();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("CANNOT FIND REQUIRED SECTIONS")),
    ).toBe(true);
  });

  it("should accept output with all required sections", () => {
    const output = generateValidSynthesis();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: CLAUDE.MD CONTENT VALIDATION
// ============================================================================

describe("validateSynthesisOutput - CLAUDE.md Content", () => {
  it("should reject CLAUDE.md without project name heading", () => {
    const claudeMd = [
      "## Tech Stack",
      "- TypeScript 5.3",
      "",
      "## File Placement Guide",
      "| File Type | Location | Example |",
      "|-----------|----------|---------|",
      "| Controller | src/controllers/ | user.controller.ts |",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${generateValidProjectContext()}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("PROJECT NAME HEADING"))).toBe(
      true,
    );
  });

  it("should reject CLAUDE.md missing Tech Stack section", () => {
    const claudeMd = [
      "# TestProject",
      "",
      "## File Placement Guide",
      "| File Type | Location | Example |",
      "|-----------|----------|---------|",
      "| Controller | src/controllers/ | user.controller.ts |",
      "",
      "## Essential Commands",
      "| Task | Command |",
      "|------|---------|",
      "| Dev | npm run dev |",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${generateValidProjectContext()}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("MISSING REQUIRED SECTIONS")),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes("Tech Stack"))).toBe(true);
  });

  it("should reject CLAUDE.md missing File Placement section", () => {
    const claudeMd = [
      "# TestProject",
      "",
      "## Tech Stack",
      "- TypeScript 5.3",
      "",
      "## Essential Commands",
      "| Task | Command |",
      "|------|---------|",
      "| Dev | npm run dev |",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${generateValidProjectContext()}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("File Placement"))).toBe(true);
  });

  it("should reject CLAUDE.md missing Essential Commands section", () => {
    const claudeMd = [
      "# TestProject",
      "",
      "## Tech Stack",
      "- TypeScript 5.3",
      "",
      "## File Placement Guide",
      "| File Type | Location | Example |",
      "|-----------|----------|---------|",
      "| Controller | src/controllers/ | user.controller.ts |",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${generateValidProjectContext()}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Essential Commands"))).toBe(
      true,
    );
  });

  it("should reject CLAUDE.md without tables", () => {
    const claudeMd = [
      "# TestProject",
      "",
      "## Tech Stack",
      "TypeScript 5.3",
      "Node.js 20.x",
      "",
      "## File Placement Guide",
      "Controllers go in src/controllers/",
      "",
      "## Essential Commands",
      "Dev: npm run dev",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${generateValidProjectContext()}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("TABLE FORMAT"))).toBe(true);
  });

  it("should accept CLAUDE.md with tables (even without bullet lists)", () => {
    const claudeMd = [
      "# TestProject",
      "",
      "## Tech Stack",
      "| Technology | Version |",
      "|------------|---------|",
      "| TypeScript | 5.3 |",
      "| Node.js | 20.x |",
      "| NestJS | 10.x |",
      "| PostgreSQL | 15 |",
      "| Redis | 7.x |",
      "",
      "## File Placement Guide",
      "| File Type | Location | Example |",
      "|-----------|----------|---------|",
      "| Controller | src/controllers/ | user.controller.ts |",
      "| Service | src/services/ | user.service.ts |",
      "| Entity | src/entities/ | user.entity.ts |",
      "| DTO | src/dtos/ | create-user.dto.ts |",
      "| Module | src/modules/ | user.module.ts |",
      "| Guard | src/guards/ | auth.guard.ts |",
      "",
      "## Essential Commands",
      "| Task | Command |",
      "|------|---------|",
      "| Dev | npm run dev |",
      "| Build | npm run build |",
      "| Test | npm test |",
      "| Lint | npm run lint |",
      "| Format | npm run format |",
      "| Type Check | npm run typecheck |",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${generateValidProjectContext()}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });

  it("should accept CLAUDE.md with all required elements", () => {
    const output = generateValidSynthesis();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: PROJECT-CONTEXT CONTENT VALIDATION
// ============================================================================

describe("validateSynthesisOutput - project-context Content", () => {
  it("should reject project-context without YAML frontmatter", () => {
    const context = [
      "# Project Context: TestProject",
      "",
      "## When to Use This Skill",
      "- When implementing features",
      "",
      "```typescript",
      "const example = true;",
      "```",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${generateValidClaudeMd()}\n\n---\n\n# project-context/SKILL.md Content\n\n${context}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("YAML FRONTMATTER"))).toBe(
      true,
    );
  });

  it("should reject project-context with unclosed frontmatter", () => {
    const context = [
      "---",
      "name: project-context",
      "",
      "# Project Context: TestProject",
      "",
      "```typescript",
      "const example = true;",
      "```",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${generateValidClaudeMd()}\n\n---\n\n# project-context/SKILL.md Content\n\n${context}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("FRONTMATTER NOT CLOSED")),
    ).toBe(true);
  });

  it("should reject project-context without name field in frontmatter", () => {
    const context = [
      "---",
      "description: Deep knowledge",
      "---",
      "",
      "# Project Context: TestProject",
      "",
      "```typescript",
      "const example = true;",
      "```",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${generateValidClaudeMd()}\n\n---\n\n# project-context/SKILL.md Content\n\n${context}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('MISSING "name:" FIELD'))).toBe(
      true,
    );
  });

  it("should reject project-context with wrong name in frontmatter", () => {
    const context = [
      "---",
      "name: wrong-name",
      "---",
      "",
      "# Project Context: TestProject",
      "",
      "```typescript",
      "const example = true;",
      "```",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${generateValidClaudeMd()}\n\n---\n\n# project-context/SKILL.md Content\n\n${context}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("WRONG NAME"))).toBe(true);
  });

  it("should reject project-context without main heading", () => {
    const context = [
      "---",
      "name: project-context",
      "---",
      "",
      "## When to Use This Skill",
      "- When implementing features",
      "",
      "```typescript",
      "const example = true;",
      "```",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${generateValidClaudeMd()}\n\n---\n\n# project-context/SKILL.md Content\n\n${context}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("MAIN HEADING"))).toBe(true);
  });

  it("should reject project-context without code examples", () => {
    const context = [
      "---",
      "name: project-context",
      "---",
      "",
      "# Project Context: TestProject",
      "",
      "## When to Use This Skill",
      "- When implementing features",
      "",
      "## Architecture",
      "The system uses layered architecture.",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${generateValidClaudeMd()}\n\n---\n\n# project-context/SKILL.md Content\n\n${context}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("CODE EXAMPLES"))).toBe(true);
  });

  it("should accept project-context with all required elements", () => {
    const output = generateValidSynthesis();
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: LINE COUNT VALIDATION
// ============================================================================

describe("validateSynthesisOutput - Line Count Validation", () => {
  it("should reject CLAUDE.md with fewer than 30 lines", () => {
    const output = generateValidSynthesis(25, 100);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("CLAUDE.md CONTENT TOO SHORT")),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes("25 lines"))).toBe(true);
  });

  it("should reject CLAUDE.md with more than 250 lines", () => {
    const output = generateValidSynthesis(260, 100);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("CLAUDE.md CONTENT TOO LONG")),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes("260 lines"))).toBe(true);
  });

  it("should accept CLAUDE.md with exactly 30 lines", () => {
    const output = generateValidSynthesis(30, 100);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });

  it("should accept CLAUDE.md with exactly 250 lines", () => {
    const output = generateValidSynthesis(250, 100);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });

  it("should reject project-context with fewer than 50 lines", () => {
    const output = generateValidSynthesis(50, 40);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("PROJECT-CONTEXT CONTENT TOO SHORT"),
      ),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes("40 lines"))).toBe(true);
  });

  it("should reject project-context with more than 600 lines", () => {
    const output = generateValidSynthesis(50, 650);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("PROJECT-CONTEXT CONTENT TOO LONG")),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes("650 lines"))).toBe(true);
  });

  it("should accept project-context with exactly 50 lines", () => {
    const output = generateValidSynthesis(50, 50);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });

  it("should accept project-context with exactly 600 lines", () => {
    const output = generateValidSynthesis(50, 600);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: EXTRACTION FUNCTION
// ============================================================================

describe("extractSynthesisMarkdown", () => {
  it("should extract both sections from valid output", () => {
    const output = generateValidSynthesis();
    const extracted = extractSynthesisMarkdown(output);
    expect(extracted).not.toBeNull();
    expect(extracted!.claudemd).toContain("# TestProject");
    expect(extracted!.projectContext).toContain("name: project-context");
  });

  it("should return null when CLAUDE.md header is missing", () => {
    const output =
      "Some content\n\n---\n\n# project-context/SKILL.md Content\n\nContent";
    const extracted = extractSynthesisMarkdown(output);
    expect(extracted).toBeNull();
  });

  it("should return null when separator is missing", () => {
    const output =
      "# CLAUDE.md Content\n\nContent\n\n# project-context/SKILL.md Content\n\nContent";
    const extracted = extractSynthesisMarkdown(output);
    expect(extracted).toBeNull();
  });

  it("should return null when project-context header is missing", () => {
    const output = "# CLAUDE.md Content\n\nContent\n\n---\n\nContent";
    const extracted = extractSynthesisMarkdown(output);
    expect(extracted).toBeNull();
  });

  it("should handle preamble text before CLAUDE.md header", () => {
    const preamble = "Let me output the content:\n\n";
    const validOutput = generateValidSynthesis();
    const output = preamble + validOutput;
    const extracted = extractSynthesisMarkdown(output);
    expect(extracted).not.toBeNull();
    expect(extracted!.claudemd).toContain("# TestProject");
  });

  it("should handle extra whitespace around sections", () => {
    const output = `# CLAUDE.md Content

${generateValidClaudeMd()}

---

# project-context/SKILL.md Content

${generateValidProjectContext()}
`;
    const extracted = extractSynthesisMarkdown(output);
    expect(extracted).not.toBeNull();
  });
});

// ============================================================================
// TEST SUITE: ERROR FORMATTING
// ============================================================================

describe("validateSynthesisOutput - Error Formatting", () => {
  it("should include header with error count for formatted errors", () => {
    // Use invalid structure (not empty) to trigger formatErrorsForAgent
    const badOutput = `# CLAUDE.md Content\n\nShort`;
    const result = validateSynthesisOutput(badOutput);
    expect(
      result.errors.some((e) => e.includes("SYNTHESIS VALIDATION FAILED")),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes("error(s)"))).toBe(true);
  });

  it("should include WHAT WENT WRONG sections", () => {
    const result = validateSynthesisOutput("");
    expect(result.errors.some((e) => e.includes("🔴 WHAT WENT WRONG:"))).toBe(
      true,
    );
  });

  it("should include HOW TO FIX sections", () => {
    const result = validateSynthesisOutput("");
    expect(result.errors.some((e) => e.includes("🟢 HOW TO FIX:"))).toBe(true);
  });

  it("should include complete required format at the end for formatted errors", () => {
    // Use invalid structure (not empty) to trigger formatErrorsForAgent
    const badOutput = `# CLAUDE.md Content\n\nShort`;
    const result = validateSynthesisOutput(badOutput);
    expect(
      result.errors.some((e) => e.includes("COMPLETE REQUIRED FORMAT")),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes("# CLAUDE.md Content"))).toBe(
      true,
    );
    expect(
      result.errors.some((e) =>
        e.includes("# project-context/SKILL.md Content"),
      ),
    ).toBe(true);
  });

  it("should include final reminder to start with correct header for formatted errors", () => {
    // Use invalid structure (not empty) to trigger formatErrorsForAgent
    const badOutput = `# CLAUDE.md Content\n\nShort`;
    const result = validateSynthesisOutput(badOutput);
    expect(
      result.errors.some((e) => e.includes("START YOUR RESPONSE WITH")),
    ).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: EDGE CASES
// ============================================================================

describe("validateSynthesisOutput - Edge Cases", () => {
  it("should handle multiple validation errors at once", () => {
    const badOutput = `Let me create the output:

{
  "agent_name": "architect-synthesizer",
  "findings": "data"
}

I wrote to the file successfully.`;

    const result = validateSynthesisOutput(badOutput);
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n").toUpperCase()).toContain("JSON");
    expect(result.errors.join("\n").toUpperCase()).toContain("PREAMBLE");
    expect(result.errors.join("\n").toUpperCase()).toContain("WRITE");
  });

  it("should handle output with correct structure but wrong content", () => {
    const claudeMd = "# TestProject\n\nMinimal content";
    const context =
      "---\nname: project-context\n---\n\n# Project Context: Test\n\nMinimal";
    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${context}`;

    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    // Should fail on multiple content checks
    expect(result.errors.length).toBeGreaterThan(5);
  });

  it("should accept completely valid output", () => {
    const output = generateValidSynthesis(100, 200);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.extracted).toBeDefined();
    expect(result.extracted!.claudemd).toContain("# TestProject");
    expect(result.extracted!.projectContext).toContain("project-context");
  });

  it("should handle case-insensitive section detection for required headings", () => {
    const claudeMd = [
      "# TestProject",
      "",
      "## tech stack",
      "- TypeScript 5.3",
      "",
      "## file placement guide",
      "| File Type | Location | Example |",
      "|-----------|----------|---------|",
      "| Controller | src/controllers/ | user.controller.ts |",
      "",
      "## ESSENTIAL COMMANDS",
      "| Task | Command |",
      "|------|---------|",
      "| Dev | npm run dev |",
    ].join("\n");

    const output = `# CLAUDE.md Content\n\n${claudeMd}\n\n---\n\n# project-context/SKILL.md Content\n\n${generateValidProjectContext()}`;
    const result = validateSynthesisOutput(output);
    // Should pass structure checks (case-insensitive matching)
    expect(
      result.errors.some((e) => e.includes("MISSING REQUIRED SECTIONS")),
    ).toBe(false);
  });
});

// ============================================================================
// TEST SUITE: COMPREHENSIVE VALIDATION
// ============================================================================

describe("validateSynthesisOutput - Comprehensive Validation", () => {
  it("should validate a perfect synthesis output", () => {
    const output = generateValidSynthesis(100, 200);
    const result = validateSynthesisOutput(output);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.extracted).toBeDefined();
    expect(result.extracted!.claudemd.split("\n").length).toBe(100);
    expect(result.extracted!.projectContext.split("\n").length).toBe(200);
  });

  it("should provide extracted content even when validation fails", () => {
    // Valid structure but wrong line counts
    const output = generateValidSynthesis(20, 30);
    const result = validateSynthesisOutput(output);

    expect(result.valid).toBe(false);
    expect(result.extracted).toBeDefined();
    expect(result.extracted!.claudemd).toContain("# TestProject");
    expect(result.extracted!.projectContext).toContain("project-context");
  });
});
