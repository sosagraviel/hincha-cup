import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("validate-synthesis hook", () => {
  const HOOK_PATH = path.join(
    __dirname,
    "../../../../agents/hooks/validate-synthesis.ts",
  );

  /**
   * Helper to generate valid CLAUDE.md content
   */
  function generateValidClaudeMd(lineCount: number = 30): string {
    const baseLines = [
      '# Test Project',
      '',
      '> Quick reference for AI agents.',
      '',
      '## Tech Stack',
      '',
      '- TypeScript 5.3',
      '- Node.js 20',
      '- PostgreSQL 15',
      '',
      '## File Placement Guide',
      '',
      '| File Type | Location | Example |',
      '|-----------|----------|---------|',
      '| Controller | src/controllers/ | user.controller.ts |',
      '| Service | src/services/ | user.service.ts |',
      '| Model | src/models/ | user.model.ts |',
      '',
      '## Essential Commands',
      '',
      '| Task | Command |',
      '|------|---------|',
      '| Dev | npm run dev |',
      '| Test | npm test |',
      '',
      '## Directory Structure',
      '',
      'src/',
      '  controllers/',
      '  services/',
    ];

    const additionalLines = Array.from(
      { length: Math.max(0, lineCount - baseLines.length) },
      (_, i) => `Additional line ${i + 1}`
    );

    return [...baseLines, ...additionalLines].join('\n');
  }

  /**
   * Helper to generate valid project-context content
   */
  function generateValidProjectContext(lineCount: number = 50): string {
    const baseLines = [
      '---',
      'name: project-context',
      'description: Test project context',
      '---',
      '',
      '# Project Context: Test',
      '',
      '## When to Use This Skill',
      '',
      '- When implementing features',
      '- When debugging issues',
      '',
      '## Architecture',
      '',
      'This is comprehensive project context.',
      '',
      '## Gotchas',
      '',
      '```typescript',
      '// Wrong',
      'const bad = null;',
      '// Correct',
      'const good = value;',
      '```',
    ];

    const additionalLines = Array.from(
      { length: Math.max(0, lineCount - baseLines.length) },
      (_, i) => `Additional context line ${i + 1}`
    );

    return [...baseLines, ...additionalLines].join('\n');
  }

  /**
   * Helper to simulate hook execution
   * Creates a mock transcript with the agent's output and runs the hook
   */
  function runHook(agentOutput: string): {
    allowed: boolean;
    feedback?: string;
  } {
    // Create mock transcript
    const transcript = [
      {
        type: "assistant",
        content: [
          {
            type: "text",
            text: agentOutput,
          },
        ],
      },
    ];

    const transcriptPath = path.join(__dirname, "test-transcript.jsonl");
    fs.writeFileSync(
      transcriptPath,
      transcript.map((msg) => JSON.stringify(msg)).join("\n"),
    );

    // Create hook input
    const hookInput = {
      stop_hook_active: false,
      transcript_path: transcriptPath,
      session_id: "test-session",
      cwd: process.cwd(),
    };

    try {
      // Run hook via npx tsx
      const result = execSync(`npx tsx ${HOOK_PATH}`, {
        input: JSON.stringify(hookInput),
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Parse hook output
      try {
        const hookOutput = JSON.parse(result.trim());
        if (hookOutput.decision === "block") {
          return { allowed: false, feedback: hookOutput.reason };
        }
      } catch (e) {
        // If no JSON output, hook allowed (exit 0)
      }

      return { allowed: true };
    } catch (error: any) {
      // Hook blocked (exit 1)
      const stderr = error.stderr?.toString() || "";
      const stdout = error.stdout?.toString() || "";

      // Try to parse JSON from stdout
      try {
        const hookOutput = JSON.parse(stdout.trim());
        if (hookOutput.decision === "block") {
          return { allowed: false, feedback: hookOutput.reason };
        }
      } catch (e) {
        // No valid JSON
      }

      return { allowed: false, feedback: stdout || stderr };
    } finally {
      // Cleanup
      try {
        fs.unlinkSync(transcriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  describe("Valid Synthesis Output", () => {
    it("should allow valid synthesis with all required sections", () => {
      const claudeLines = generateValidClaudeMd(30);
      const contextLines = generateValidProjectContext(50);

      const validOutput = `# CLAUDE.md Content

${claudeLines}

---

# project-context/SKILL.md Content

${contextLines}`;

      const result = runHook(validOutput);

      expect(result.allowed).toBe(true);
    });

    it("should allow synthesis with minimum line counts (30/50 lines)", () => {
      const claudeLines = generateValidClaudeMd(30);
      const contextLines = generateValidProjectContext(50);

      const validOutput = `# CLAUDE.md Content

${claudeLines}

---

# project-context/SKILL.md Content

${contextLines}`;

      const result = runHook(validOutput);

      expect(result.allowed).toBe(true);
    });
  });

  describe("Invalid Synthesis Output - Missing Sections", () => {
    it("should block output missing CLAUDE.md Content section", () => {
      const invalidOutput = `# Some Other Section

---

# project-context/SKILL.md Content

${"x".repeat(500)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|MISSING/);
    });

    it("should block output missing project-context section", () => {
      const invalidOutput = `# CLAUDE.md Content

${"x".repeat(500)}

---

# Wrong Section Name`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/PROJECT-CONTEXT|SECTION|MISSING/);
    });

    it("should block output missing separator", () => {
      const invalidOutput = `# CLAUDE.md Content

${"x".repeat(300)}

# project-context/SKILL.md Content

${"x".repeat(300)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/SEPARATOR|SECTION|MISSING/);
    });

    it("should block output missing all sections", () => {
      const invalidOutput = `Just some random markdown content that doesn't follow the required format.

${"x".repeat(500)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|MISSING|PREAMBLE/);
    });
  });

  describe("Invalid Synthesis Output - Wrong Format", () => {
    it("should block JSON output instead of markdown", () => {
      const jsonOutput = JSON.stringify({
        agent_name: "architect-synthesizer",
        timestamp: "2024-01-01T00:00:00Z",
        findings: {
          claude_md: "content",
          project_context: "content",
        },
      });

      const result = runHook(jsonOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/JSON/);
    });

    it("should block output that's too short", () => {
      const shortOutput = `# CLAUDE.md Content

Too short

---

# project-context/SKILL.md Content

Also short`;

      const result = runHook(shortOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/SHORT|MINIMUM|LINE/);
    });

    it("should block empty output", () => {
      const result = runHook("");

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/SHORT|EMPTY|MINIMUM/);
    });
  });

  describe("Feedback Quality", () => {
    it("should provide clear guidance on what's missing", () => {
      const invalidOutput = `# Wrong Header

${"x".repeat(500)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Should mention CLAUDE.md and/or required structure
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|MISSING|PREAMBLE/);
      expect(result.feedback).toContain("# CLAUDE.md Content");
    });

    it("should explain the correct structure when sections are missing", () => {
      const invalidOutput = `${"x".repeat(600)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Should mention structure or missing sections
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|PREAMBLE|START/);
    });

    it("should list all validation errors at once", () => {
      const invalidOutput = `Random content without proper structure`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Should contain error about missing structure and/or being too short
      expect(result.feedback?.toUpperCase()).toMatch(/SHORT|MINIMUM|SECTION|CLAUDE/);
    });
  });

  describe("Edge Cases", () => {
    it("should allow synthesis with extra whitespace", () => {
      const claudeLines = generateValidClaudeMd(30);
      const contextLines = generateValidProjectContext(50);

      const validOutput = `

# CLAUDE.md Content

${claudeLines}

---

# project-context/SKILL.md Content

${contextLines}

`;

      const result = runHook(validOutput);

      expect(result.allowed).toBe(true);
    });

    it("should detect separator even with surrounding content", () => {
      const claudeLines = generateValidClaudeMd(30);
      const contextLines = generateValidProjectContext(50);

      const validOutput = `# CLAUDE.md Content

${claudeLines}

---

# project-context/SKILL.md Content

${contextLines}`;

      const result = runHook(validOutput);

      expect(result.allowed).toBe(true);
    });

    it("should handle multiline content in both sections", () => {
      const claudeLines = generateValidClaudeMd(30);
      const contextLines = generateValidProjectContext(50);

      const validOutput = `# CLAUDE.md Content

${claudeLines}

---

# project-context/SKILL.md Content

${contextLines}`;

      const result = runHook(validOutput);

      expect(result.allowed).toBe(true);
    });
  });

  describe("Hook Protocol Compliance", () => {
    it("should read from transcript_path not stdin", () => {
      // This is tested implicitly by runHook helper
      // If it tried to read stdin directly, it would fail
      const claudeLines = generateValidClaudeMd(30);
      const contextLines = generateValidProjectContext(50);

      const validOutput = `# CLAUDE.md Content

${claudeLines}

---

# project-context/SKILL.md Content

${contextLines}`;

      const result = runHook(validOutput);
      expect(result.allowed).toBe(true);
    });

    it("should output proper JSON decision format when blocking", () => {
      const invalidOutput = "Too short";

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Feedback should be structured (not just raw text)
      expect(result.feedback).toBeTruthy();
      expect(result.feedback?.toUpperCase()).toMatch(/VALIDATION|FAILED|SHORT|MINIMUM/);
    });
  });
});
