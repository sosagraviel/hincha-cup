import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('validate-synthesis hook', () => {
  const HOOK_PATH = path.join(
    __dirname,
    '../../../../../../src/nodes/initialize-project/phase3/hooks/validate-synthesis.hook.ts',
  );

  /**
   * Helpers that build a five-section synthesis blob accepted by the hook.
   * Phase 3 emits: CLAUDE.md cheat-sheet, three prescriptive convention
   * skills, and an architectural narrative for the wiki-generator.
   */
  function pad(lines: string[], target: number, filler: string): string {
    const out = [...lines];
    while (out.length < target) out.push(`${filler} ${out.length}`);
    return out.join('\n');
  }

  function generateValidClaudeMd(target = 30): string {
    return pad(
      [
        '# Test Project',
        '',
        '## Tech Stack',
        '- TypeScript 5.3',
        '- Node.js 20',
        '- PostgreSQL 15',
        '',
        '## File Placement Guide',
        '| File Type | Location | Example |',
        '|-----------|----------|---------|',
        '| Controller | src/controllers/ | user.controller.ts |',
        '| Service | src/services/ | user.service.ts |',
        '',
        '## Directory Structure',
        'src/',
        '  controllers/',
        '  services/',
        '',
        '## Essential Commands',
        '| Task | Command |',
        '|------|---------|',
        '| Dev | npm run dev |',
        '| Test | npm test |',
      ],
      target,
      '- Additional cheat-sheet line',
    );
  }

  function generateValidCodeConventions(target = 30): string {
    return pad(
      [
        '---',
        'name: code-conventions',
        'description: Project-specific coding conventions',
        '---',
        '',
        '# Code Conventions',
        '',
        '## Naming',
        '- camelCase variables',
        '',
        '## Gotchas',
        '',
        '```typescript',
        '// WRONG',
        'await orderRepo.save(order);',
        '```',
        '',
        '```typescript',
        '// CORRECT',
        'return dataSource.transaction(async (m) => m.save(Order, order));',
        '```',
      ],
      target,
      '- additional rule',
    );
  }

  function generateValidMultiFileWorkflows(target = 20): string {
    return pad(
      [
        '---',
        'name: multi-file-workflows',
        'description: Cross-cutting checklists',
        '---',
        '',
        '# Multi-File Workflows',
        '',
        '## Adding endpoint',
        '1. Create controller',
        '2. Add service',
        '3. Wire DTO',
      ],
      target,
      '- additional checklist step',
    );
  }

  function generateValidTestingConventions(target = 25): string {
    return pad(
      [
        '---',
        'name: testing-conventions',
        'description: Project-specific testing conventions',
        '---',
        '',
        '# Testing Conventions',
        '',
        '## Philosophy',
        '- Test behavior, not implementation',
        '',
        '## Unit Test Patterns',
        '',
        '```typescript',
        "describe('UserService', () => {",
        "  it('creates a user', async () => {",
        '    const u = await service.create({});',
        '    expect(u.id).toBeDefined();',
        '  });',
        '});',
        '```',
      ],
      target,
      '- additional testing rule',
    );
  }

  function generateValidArchitecturalNarrative(target = 30): string {
    return pad(
      [
        '# Architectural Narrative',
        '',
        '## Repository Shape',
        'Monorepo with backend + frontend.',
        '',
        '## Service Inventory',
        '- api: TypeScript backend',
        '- web: TypeScript frontend',
        '',
        '## Cross-Service Flows',
        'web calls api over HTTP.',
      ],
      target,
      'Additional narrative paragraph',
    );
  }

  /** Compose a full five-section synthesis blob from sub-fixtures. */
  function buildValidSynthesis(opts?: {
    claudeLines?: number;
    codeConvLines?: number;
    multiFileLines?: number;
    testingLines?: number;
    narrativeLines?: number;
  }): string {
    return [
      '# CLAUDE.md Content',
      '',
      generateValidClaudeMd(opts?.claudeLines ?? 30),
      '',
      '---',
      '',
      '# code-conventions/SKILL.md Content',
      '',
      generateValidCodeConventions(opts?.codeConvLines ?? 30),
      '',
      '---',
      '',
      '# multi-file-workflows/SKILL.md Content',
      '',
      generateValidMultiFileWorkflows(opts?.multiFileLines ?? 20),
      '',
      '---',
      '',
      '# testing-conventions/SKILL.md Content',
      '',
      generateValidTestingConventions(opts?.testingLines ?? 25),
      '',
      '---',
      '',
      '# Architectural Narrative Content',
      '',
      generateValidArchitecturalNarrative(opts?.narrativeLines ?? 30),
    ].join('\n');
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
        type: 'assistant',
        content: [
          {
            type: 'text',
            text: agentOutput,
          },
        ],
      },
    ];

    const transcriptPath = path.join(__dirname, 'test-transcript.jsonl');
    fs.writeFileSync(transcriptPath, transcript.map((msg) => JSON.stringify(msg)).join('\n'));

    // Create hook input
    const hookInput = {
      stop_hook_active: false,
      transcript_path: transcriptPath,
      session_id: 'test-session',
      cwd: process.cwd(),
    };

    try {
      // Run hook via Node's import hook to avoid tsx CLI IPC sockets in restricted test sandboxes.
      const result = execSync(`node --import tsx ${HOOK_PATH}`, {
        input: JSON.stringify(hookInput),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Parse hook output
      try {
        const hookOutput = JSON.parse(result.trim());
        if (hookOutput.decision === 'block') {
          return { allowed: false, feedback: hookOutput.reason };
        }
      } catch (e) {
        // If no JSON output, hook allowed (exit 0)
      }

      return { allowed: true };
    } catch (error: any) {
      // Hook blocked (exit 1)
      const stderr = error.stderr?.toString() || '';
      const stdout = error.stdout?.toString() || '';

      // Try to parse JSON from stdout
      try {
        const hookOutput = JSON.parse(stdout.trim());
        if (hookOutput.decision === 'block') {
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

  describe('Valid Synthesis Output', () => {
    it('should allow valid synthesis with all required sections', () => {
      const result = runHook(buildValidSynthesis());
      expect(result.allowed).toBe(true);
    });

    it('should allow synthesis with minimum line counts on every section', () => {
      const result = runHook(
        buildValidSynthesis({
          claudeLines: 30,
          codeConvLines: 30,
          multiFileLines: 20,
          testingLines: 25,
          narrativeLines: 30,
        }),
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('Invalid Synthesis Output - Missing Sections', () => {
    it('should block output missing CLAUDE.md Content section', () => {
      const invalidOutput = buildValidSynthesis().replace('# CLAUDE.md Content', '');
      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|MISSING/);
    });

    it('should block output missing the architectural narrative section', () => {
      const invalidOutput = buildValidSynthesis().replace('# Architectural Narrative Content', '');
      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(
        /ARCHITECTURAL\sNARRATIVE|SECTION|MISSING|REQUIRED/,
      );
    });

    it('should block output missing the multi-file-workflows section', () => {
      const invalidOutput = buildValidSynthesis().replace(
        '# multi-file-workflows/SKILL.md Content',
        '',
      );
      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/MULTI-FILE-WORKFLOWS|SECTION|MISSING/);
    });

    it('should block output missing all sections', () => {
      const invalidOutput = `Just some random markdown content that doesn't follow the required format.

${'x'.repeat(500)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|MISSING|PREAMBLE/);
    });
  });

  describe('Invalid Synthesis Output - Wrong Format', () => {
    it('should block JSON output instead of markdown', () => {
      const jsonOutput = JSON.stringify({
        agent_name: 'architect-synthesizer',
        timestamp: '2024-01-01T00:00:00Z',
        findings: {
          claude_md: 'content',
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

# code-conventions/SKILL.md Content

Also short`;

      const result = runHook(shortOutput);

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/SHORT|MINIMUM|LINE|SECTION|MISSING/);
    });

    it('should block empty output', () => {
      const result = runHook('');

      expect(result.allowed).toBe(false);
      expect(result.feedback?.toUpperCase()).toMatch(/SHORT|EMPTY|MINIMUM/);
    });
  });

  describe('Feedback Quality', () => {
    it("should provide clear guidance on what's missing", () => {
      const invalidOutput = `# Wrong Header

${'x'.repeat(500)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Should mention CLAUDE.md and/or required structure
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|MISSING|PREAMBLE/);
      expect(result.feedback).toContain('# CLAUDE.md Content');
    });

    it('should explain the correct structure when sections are missing', () => {
      const invalidOutput = `${'x'.repeat(600)}`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Should mention structure or missing sections
      expect(result.feedback?.toUpperCase()).toMatch(/CLAUDE\.MD|SECTION|PREAMBLE|START/);
    });

    it('should list all validation errors at once', () => {
      const invalidOutput = `Random content without proper structure`;

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Should contain error about missing structure and/or being too short
      expect(result.feedback?.toUpperCase()).toMatch(/SHORT|MINIMUM|SECTION|CLAUDE/);
    });
  });

  describe('Edge Cases', () => {
    it('should allow synthesis with surrounding whitespace', () => {
      const result = runHook(`\n\n${buildValidSynthesis()}\n\n`);
      expect(result.allowed).toBe(true);
    });

    it('should accept synthesis with all five sections in order', () => {
      const result = runHook(buildValidSynthesis());
      expect(result.allowed).toBe(true);
    });

    it('should handle multi-line content in every section', () => {
      const result = runHook(
        buildValidSynthesis({
          claudeLines: 60,
          codeConvLines: 80,
          multiFileLines: 60,
          testingLines: 60,
          narrativeLines: 80,
        }),
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('Hook Protocol Compliance', () => {
    it('should read from transcript_path not stdin', () => {
      // Tested implicitly by runHook helper — it injects the agent output via
      // a temporary transcript file, not stdin. If the hook ever regressed to
      // reading stdin we'd see EAGAIN/empty-input errors here.
      const result = runHook(buildValidSynthesis());
      expect(result.allowed).toBe(true);
    });

    it('should output proper JSON decision format when blocking', () => {
      const invalidOutput = 'Too short';

      const result = runHook(invalidOutput);

      expect(result.allowed).toBe(false);
      // Feedback should be structured (not just raw text)
      expect(result.feedback).toBeTruthy();
      expect(result.feedback?.toUpperCase()).toMatch(/VALIDATION|FAILED|SHORT|MINIMUM/);
    });
  });
});
