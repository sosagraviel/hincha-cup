import { describe, it, expect } from 'vitest';
import { validateSynthesisOutput } from '../../../../../src/nodes/initialize-project/phase3/validators/index.js';
import { extractSynthesisMarkdown } from '../../../../../src/nodes/initialize-project/phase3/validators/extract-synthesis-markdown.js';

// ============================================================================
// FIXTURE BUILDERS
//
// Phase 3 synthesis emits FIVE sections separated by `---`:
//   1. CLAUDE.md (or AGENTS.md on Codex) — cheat-sheet
//   2. code-conventions/SKILL.md — prescriptive code rules
//   3. multi-file-workflows/SKILL.md — cross-cutting checklists
//   4. testing-conventions/SKILL.md — prescriptive test rules
//   5. Architectural Narrative — descriptive prose for the wiki-generator
//
// The helpers below pad each section to a target line count so we can exercise
// the line-floor / line-ceiling checks. Keep the fixtures minimal but valid
// (frontmatter, H1, code block where required).
// ============================================================================

function pad(lines: string[], target: number, filler: string): string {
  const out = [...lines];
  while (out.length < target) out.push(`${filler} ${out.length}`);
  return out.join('\n');
}

function fixtureClaudeMd(target = 50): string {
  return pad(
    [
      '# TestProject',
      '',
      '## Tech Stack',
      '- TypeScript 5.3',
      '- Node.js 20.x',
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

function fixtureCodeConventions(target = 60): string {
  return pad(
    [
      '---',
      'name: code-conventions',
      'description: Project-specific coding conventions, gotchas, and WRONG/CORRECT examples',
      '---',
      '',
      '# Code Conventions',
      '',
      '## Naming',
      '- camelCase for variables',
      '- PascalCase for classes',
      '',
      '## Gotchas',
      '',
      '### Transactions do not auto-rollback',
      '',
      '```typescript',
      '// WRONG',
      'await orderRepo.save(order);',
      'await inventory.decrement(items);',
      '```',
      '',
      '```typescript',
      '// CORRECT',
      'return dataSource.transaction(async (m) => {',
      '  await m.save(Order, order);',
      '  await inventory.decrement(items, m);',
      '});',
      '```',
    ],
    target,
    '- additional rule',
  );
}

function fixtureMultiFileWorkflows(target = 50): string {
  return pad(
    [
      '---',
      'name: multi-file-workflows',
      'description: Ordered checklists for cross-cutting changes — add endpoint, add entity, etc.',
      '---',
      '',
      '# Multi-File Workflows',
      '',
      '## Adding a new API endpoint',
      '1. Create controller method',
      '2. Add service method',
      '3. Create DTO',
      '4. Wire DTO export',
      '5. Add unit test',
      '',
      '## Adding a new database entity',
      '1. Create migration',
      '2. Update entity class',
      '3. Update repository',
    ],
    target,
    '- additional checklist step',
  );
}

function fixtureTestingConventions(target = 50): string {
  return pad(
    [
      '---',
      'name: testing-conventions',
      'description: Project-specific testing conventions, fixtures, mocking rules, and examples',
      '---',
      '',
      '# Testing Conventions',
      '',
      '## Philosophy',
      '- Test behavior, not implementation',
      '- Do not mock the database',
      '',
      '## Unit Test Patterns',
      '',
      '```typescript',
      "describe('UserService', () => {",
      "  it('creates a user', async () => {",
      '    const u = await service.create({ email: "a@b.com" });',
      '    expect(u.id).toBeDefined();',
      '  });',
      '});',
      '```',
    ],
    target,
    '- additional testing rule',
  );
}

function fixtureArchitecturalNarrative(target = 60): string {
  return pad(
    [
      '# Architectural Narrative',
      '',
      '## Repository Shape',
      'Monorepo with two backend services and a single web frontend.',
      '',
      '## Service Inventory',
      '- api: NestJS backend (TypeScript)',
      '- worker: queue consumer (TypeScript)',
      '- web: Next.js app (TypeScript)',
      '',
      '## Cross-Service Flows',
      'The web frontend calls api over HTTP. api dispatches background work to',
      'worker via Redis Streams. All persistence is PostgreSQL.',
      '',
      '## Architectural Decisions',
      '1. Pick monorepo: shared types between web and api outweigh CI cost.',
      '2. Redis Streams over RabbitMQ: existing Redis fleet, simpler ops.',
    ],
    target,
    'Additional narrative paragraph',
  );
}

interface SynthesisOptions {
  claudeLines?: number;
  codeConvLines?: number;
  multiFileLines?: number;
  testingLines?: number;
  narrativeLines?: number;
}

function fixtureSynthesis(opts: SynthesisOptions = {}): string {
  return [
    '# CLAUDE.md Content',
    '',
    fixtureClaudeMd(opts.claudeLines ?? 50),
    '',
    '---',
    '',
    '# code-conventions/SKILL.md Content',
    '',
    fixtureCodeConventions(opts.codeConvLines ?? 60),
    '',
    '---',
    '',
    '# multi-file-workflows/SKILL.md Content',
    '',
    fixtureMultiFileWorkflows(opts.multiFileLines ?? 50),
    '',
    '---',
    '',
    '# testing-conventions/SKILL.md Content',
    '',
    fixtureTestingConventions(opts.testingLines ?? 50),
    '',
    '---',
    '',
    '# Architectural Narrative Content',
    '',
    fixtureArchitecturalNarrative(opts.narrativeLines ?? 60),
  ].join('\n');
}

// ============================================================================
// EMPTY OUTPUT
// ============================================================================

describe('validateSynthesisOutput — empty output', () => {
  it('rejects completely empty output', () => {
    const result = validateSynthesisOutput('');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('OUTPUT IS EMPTY'))).toBe(true);
  });

  it('rejects whitespace-only output', () => {
    const result = validateSynthesisOutput('   \n\n   \t  ');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('OUTPUT IS EMPTY'))).toBe(true);
  });
});

// ============================================================================
// JSON FORMAT DETECTION
// ============================================================================

describe('validateSynthesisOutput — JSON format detection', () => {
  it('rejects output that is a JSON object with agent_name', () => {
    const jsonOutput = JSON.stringify({
      agent_name: 'architect-synthesizer',
      findings: { test: 'data' },
    });
    const result = validateSynthesisOutput(jsonOutput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toUpperCase().includes('JSON'))).toBe(true);
  });

  it('accepts five-section markdown without flagging it as JSON', () => {
    const result = validateSynthesisOutput(fixtureSynthesis());
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// PREAMBLE / WRITE-TOOL DETECTION
// ============================================================================

describe('validateSynthesisOutput — preamble detection', () => {
  it('rejects output with preamble before the first section header', () => {
    const output = `Let me output the markdown content...\n\n${fixtureSynthesis()}`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toUpperCase().includes('PREAMBLE'))).toBe(true);
  });

  it('accepts output that starts directly with the first section header', () => {
    const result = validateSynthesisOutput(fixtureSynthesis());
    expect(result.valid).toBe(true);
  });
});

describe('validateSynthesisOutput — Write-tool usage detection', () => {
  it('rejects output that mentions writing files', () => {
    const output = `${fixtureSynthesis()}\n\nI wrote to the file CLAUDE.md`;
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toUpperCase().includes('WRITE'))).toBe(true);
  });
});

// ============================================================================
// SECTION STRUCTURE
// ============================================================================

describe('validateSynthesisOutput — five-section structure', () => {
  it('rejects output missing the CLAUDE.md header', () => {
    const output = fixtureSynthesis().replace('# CLAUDE.md Content', '');
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CANNOT FIND ALL FIVE REQUIRED SECTIONS'))).toBe(
      true,
    );
  });

  it('rejects output missing the code-conventions header', () => {
    const output = fixtureSynthesis().replace('# code-conventions/SKILL.md Content', '');
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CANNOT FIND ALL FIVE REQUIRED SECTIONS'))).toBe(
      true,
    );
  });

  it('rejects output missing the multi-file-workflows header', () => {
    const output = fixtureSynthesis().replace('# multi-file-workflows/SKILL.md Content', '');
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CANNOT FIND ALL FIVE REQUIRED SECTIONS'))).toBe(
      true,
    );
  });

  it('rejects output missing the testing-conventions header', () => {
    const output = fixtureSynthesis().replace('# testing-conventions/SKILL.md Content', '');
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CANNOT FIND ALL FIVE REQUIRED SECTIONS'))).toBe(
      true,
    );
  });

  it('rejects output missing the architectural narrative header', () => {
    const output = fixtureSynthesis().replace('# Architectural Narrative Content', '');
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CANNOT FIND ALL FIVE REQUIRED SECTIONS'))).toBe(
      true,
    );
  });

  it('accepts output with all five sections in order', () => {
    const result = validateSynthesisOutput(fixtureSynthesis());
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// SKILL CONTENT VALIDATION
// ============================================================================

describe('validateSynthesisOutput — skill body validation', () => {
  it('rejects code-conventions missing the YAML name slug', () => {
    const output = fixtureSynthesis().replace('name: code-conventions', 'name: wrong-slug');
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.includes('CODE-CONVENTIONS/SKILL.MD FRONTMATTER HAS WRONG name') ||
          e.includes('FRONTMATTER HAS WRONG name'),
      ),
    ).toBe(true);
  });

  it('rejects code-conventions without any code block', () => {
    const noCode = fixtureCodeConventions(60).replace(/```[\s\S]*?```/g, 'no code here');
    const output = fixtureSynthesis().replace(fixtureCodeConventions(60), noCode);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('CODE-CONVENTIONS/SKILL.MD MISSING CODE EXAMPLES')),
    ).toBe(true);
  });

  it('rejects testing-conventions without any code block', () => {
    const noCode = fixtureTestingConventions(50).replace(/```[\s\S]*?```/g, 'no code here');
    const output = fixtureSynthesis().replace(fixtureTestingConventions(50), noCode);
    const result = validateSynthesisOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('TESTING-CONVENTIONS/SKILL.MD MISSING CODE EXAMPLES')),
    ).toBe(true);
  });

  it('does NOT require code blocks in multi-file-workflows', () => {
    // multi-file-workflows is checklists only — the validator's
    // `requiresCodeExamples: false` flag means a body with no fenced block
    // still passes. Our default fixture has none. Sanity-check.
    const result = validateSynthesisOutput(fixtureSynthesis());
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// LINE-COUNT BOUNDS (per section)
// ============================================================================

describe('validateSynthesisOutput — line-count bounds', () => {
  it('rejects CLAUDE.md below the floor', () => {
    const result = validateSynthesisOutput(fixtureSynthesis({ claudeLines: 10 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CLAUDE.MD CONTENT TOO SHORT'))).toBe(true);
  });

  it('rejects CLAUDE.md above the ceiling', () => {
    const result = validateSynthesisOutput(fixtureSynthesis({ claudeLines: 300 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CLAUDE.MD CONTENT TOO LONG'))).toBe(true);
  });

  it('rejects code-conventions above the ceiling', () => {
    const result = validateSynthesisOutput(fixtureSynthesis({ codeConvLines: 300 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CODE-CONVENTIONS CONTENT TOO LONG'))).toBe(true);
  });

  it('rejects multi-file-workflows above the ceiling', () => {
    const result = validateSynthesisOutput(fixtureSynthesis({ multiFileLines: 250 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('MULTI-FILE-WORKFLOWS CONTENT TOO LONG'))).toBe(
      true,
    );
  });

  it('rejects testing-conventions above the ceiling', () => {
    const result = validateSynthesisOutput(fixtureSynthesis({ testingLines: 250 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('TESTING-CONVENTIONS CONTENT TOO LONG'))).toBe(
      true,
    );
  });

  it('rejects architectural-narrative below the floor', () => {
    const result = validateSynthesisOutput(fixtureSynthesis({ narrativeLines: 10 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ARCHITECTURAL-NARRATIVE CONTENT TOO SHORT'))).toBe(
      true,
    );
  });

  it('accepts all sections at their floor limits', () => {
    const result = validateSynthesisOutput(
      fixtureSynthesis({
        claudeLines: 30,
        codeConvLines: 30,
        multiFileLines: 20,
        testingLines: 25,
        narrativeLines: 30,
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts all sections at their ceiling limits', () => {
    const result = validateSynthesisOutput(
      fixtureSynthesis({
        claudeLines: 250,
        codeConvLines: 250,
        multiFileLines: 200,
        testingLines: 200,
        narrativeLines: 400,
      }),
    );
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// EXTRACTION FUNCTION
// ============================================================================

describe('extractSynthesisMarkdown', () => {
  it('extracts all five sections from valid output', () => {
    const extracted = extractSynthesisMarkdown(fixtureSynthesis());
    expect(extracted).not.toBeNull();
    expect(extracted!.claudemd).toContain('# TestProject');
    expect(extracted!.codeConventions).toContain('name: code-conventions');
    expect(extracted!.multiFileWorkflows).toContain('name: multi-file-workflows');
    expect(extracted!.testingConventions).toContain('name: testing-conventions');
    expect(extracted!.architecturalNarrative).toContain('# Architectural Narrative');
  });

  it('returns null when any required section header is missing', () => {
    const output = fixtureSynthesis().replace('# Architectural Narrative Content', '');
    expect(extractSynthesisMarkdown(output)).toBeNull();
  });

  it('handles preamble before the first header (extractor is lenient)', () => {
    const extracted = extractSynthesisMarkdown(`Let me output:\n\n${fixtureSynthesis()}`);
    expect(extracted).not.toBeNull();
    expect(extracted!.claudemd).toContain('# TestProject');
  });

  it('accepts the AGENTS.md alias for the schema-doc header (Codex)', () => {
    const output = fixtureSynthesis().replace('# CLAUDE.md Content', '# AGENTS.md Content');
    const extracted = extractSynthesisMarkdown(output);
    expect(extracted).not.toBeNull();
    expect(extracted!.claudemd).toContain('# TestProject');
  });
});

// ============================================================================
// ERROR FORMATTING
// ============================================================================

describe('validateSynthesisOutput — error formatting', () => {
  it('includes a SYNTHESIS VALIDATION FAILED header on structural failure', () => {
    const result = validateSynthesisOutput('# CLAUDE.md Content\n\nShort');
    expect(result.errors.some((e) => e.includes('SYNTHESIS VALIDATION FAILED'))).toBe(true);
  });

  it('includes 🔴 WHAT WENT WRONG and 🟢 HOW TO FIX scaffolding for empty output', () => {
    const result = validateSynthesisOutput('');
    expect(result.errors.some((e) => e.includes('🔴 WHAT WENT WRONG:'))).toBe(true);
    expect(result.errors.some((e) => e.includes('🟢 HOW TO FIX:'))).toBe(true);
  });

  it('shows the complete five-section template in the footer of formatted errors', () => {
    const result = validateSynthesisOutput('# CLAUDE.md Content\n\nShort');
    expect(result.errors.some((e) => e.includes('COMPLETE REQUIRED FORMAT'))).toBe(true);
    expect(result.errors.some((e) => e.includes('# code-conventions/SKILL.md Content'))).toBe(true);
    expect(result.errors.some((e) => e.includes('# multi-file-workflows/SKILL.md Content'))).toBe(
      true,
    );
    expect(result.errors.some((e) => e.includes('# testing-conventions/SKILL.md Content'))).toBe(
      true,
    );
    expect(result.errors.some((e) => e.includes('# Architectural Narrative Content'))).toBe(true);
  });
});

// ============================================================================
// COMPREHENSIVE / EDGE CASES
// ============================================================================

describe('validateSynthesisOutput — edge cases', () => {
  it('reports multiple violations at once', () => {
    const badOutput = `Let me create the output:\n\n${JSON.stringify({ agent_name: 'x' })}\n\nI wrote to the file successfully.`;
    const result = validateSynthesisOutput(badOutput);
    expect(result.valid).toBe(false);
    const joined = result.errors.join('\n').toUpperCase();
    expect(joined).toContain('JSON');
    expect(joined).toContain('PREAMBLE');
    expect(joined).toContain('WRITE');
  });

  it('exposes extracted sections even when validation fails on content shape', () => {
    const result = validateSynthesisOutput(fixtureSynthesis({ claudeLines: 20 }));
    expect(result.valid).toBe(false);
    expect(result.extracted).toBeDefined();
    expect(result.extracted!.claudemd).toContain('# TestProject');
    expect(result.extracted!.architecturalNarrative).toContain('# Architectural Narrative');
  });

  it('returns valid=true with empty errors for a perfect synthesis output', () => {
    const result = validateSynthesisOutput(fixtureSynthesis());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.extracted).toBeDefined();
  });
});
