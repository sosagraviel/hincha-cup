/**
 * phase1-base.schema unit tests.
 *
 * Asserts:
 *  - `buildPhase1AnalyzerSchema()` narrows `agent_name` to the supplied literal.
 *  - The base fields propagate (`timestamp`, `graph_queries_used`,
 *    `graph_overflow_*`, `soft_warning`, `needs_verification`).
 *  - The supplied `findingsSchema` is plumbed through.
 *  - `CodeSnippetSchema` enforces the ≤ 1500 char `code` cap and the
 *    optional `source_file` / `source_line` / `note` shape.
 *  - `NeedsVerificationEntrySchema` still enforces the ≥ 2
 *    `attempted_resolution` and ≥ 40 char `impact` rules.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildPhase1AnalyzerSchema,
  CodeSnippetSchema,
  CodeSnippetWithCitationSchema,
  NeedsVerificationEntrySchema,
  Phase1AnalyzerBaseFields,
} from '../../../src/schemas/phase1-base.schema.js';

describe('buildPhase1AnalyzerSchema', () => {
  const FindingsSchema = z.object({ value: z.number() }).strict();
  const Schema = buildPhase1AnalyzerSchema('test-analyzer', FindingsSchema);

  it('narrows agent_name to the supplied literal', () => {
    const ok = Schema.safeParse({
      agent_name: 'test-analyzer',
      timestamp: '2026-05-09T12:00:00.000Z',
      findings: { value: 42 },
    });
    expect(ok.success).toBe(true);

    const wrongName = Schema.safeParse({
      agent_name: 'something-else',
      timestamp: '2026-05-09T12:00:00.000Z',
      findings: { value: 42 },
    });
    expect(wrongName.success).toBe(false);
  });

  it('propagates the base fields (graph_queries_used defaults to [])', () => {
    const parsed = Schema.parse({
      agent_name: 'test-analyzer',
      timestamp: '2026-05-09T12:00:00.000Z',
      findings: { value: 1 },
    });
    expect(parsed.graph_queries_used).toEqual([]);
  });

  it('passes optional graph_overflow_count / graph_overflow_tools / soft_warning through', () => {
    const parsed = Schema.parse({
      agent_name: 'test-analyzer',
      timestamp: '2026-05-09T12:00:00.000Z',
      findings: { value: 1 },
      graph_overflow_count: 2,
      graph_overflow_tools: ['mcp__code_graph__query_graph_tool'],
      soft_warning: ['low_graph_ratio'],
    });
    expect(parsed.graph_overflow_count).toBe(2);
    expect(parsed.graph_overflow_tools).toEqual(['mcp__code_graph__query_graph_tool']);
    expect(parsed.soft_warning).toEqual(['low_graph_ratio']);
  });

  it('rejects findings shapes that violate the strict child schema', () => {
    const result = Schema.safeParse({
      agent_name: 'test-analyzer',
      timestamp: '2026-05-09T12:00:00.000Z',
      findings: { value: 1, surprise: true },
    });
    expect(result.success).toBe(false);
  });

  it('exposes Phase1AnalyzerBaseFields.needs_verification capped at 3', () => {
    expect(Phase1AnalyzerBaseFields.needs_verification).toBeDefined();
    const tooMany = Schema.safeParse({
      agent_name: 'test-analyzer',
      timestamp: '2026-05-09T12:00:00.000Z',
      findings: { value: 1 },
      needs_verification: Array.from({ length: 4 }, (_, i) => ({
        id: `q${i}`,
        question: 'Q?',
        reason: 'R',
        attempted_resolution: ['Read foo', 'Grep bar'],
        impact:
          'changes the wiki page describing the auth strategy and the implementation skill body',
      })),
    });
    expect(tooMany.success).toBe(false);
  });
});

describe('CodeSnippetSchema', () => {
  it('accepts a minimal entry', () => {
    const ok = CodeSnippetSchema.safeParse({
      kind: 'pattern',
      language: 'typescript',
      code: 'const x = 1;',
    });
    expect(ok.success).toBe(true);
  });

  it('accepts a fully-attributed entry', () => {
    const ok = CodeSnippetSchema.safeParse({
      kind: 'wrong',
      language: 'go',
      code: 'if err != nil { return err }',
      source_file: 'cmd/server/main.go',
      source_line: 42,
      note: 'always wrap with %w to preserve the chain',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects code longer than 1500 chars', () => {
    const result = CodeSnippetSchema.safeParse({
      kind: 'pattern',
      language: 'python',
      code: 'x'.repeat(1501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts code at the 1500-char boundary', () => {
    const result = CodeSnippetSchema.safeParse({
      kind: 'pattern',
      language: 'python',
      code: 'x'.repeat(1500),
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty kind / language / code', () => {
    expect(CodeSnippetSchema.safeParse({ kind: '', language: 'go', code: 'x' }).success).toBe(
      false,
    );
    expect(CodeSnippetSchema.safeParse({ kind: 'k', language: '', code: 'x' }).success).toBe(false);
    expect(CodeSnippetSchema.safeParse({ kind: 'k', language: 'go', code: '' }).success).toBe(
      false,
    );
  });

  it('rejects non-positive source_line', () => {
    expect(
      CodeSnippetSchema.safeParse({
        kind: 'pattern',
        language: 'typescript',
        code: 'a',
        source_line: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const result = CodeSnippetSchema.safeParse({
      kind: 'pattern',
      language: 'typescript',
      code: 'a',
      mystery: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('CodeSnippetWithCitationSchema', () => {
  // Every per-service judgment snippet must carry `source_file` +
  // `source_line`. Loose `CodeSnippetSchema` remains available for
  // project-level shape examples that legitimately have no single
  // canonical line.
  it('accepts a snippet with both citation fields', () => {
    const ok = CodeSnippetWithCitationSchema.safeParse({
      kind: 'controller-shape',
      language: 'typescript',
      code: 'export class UsersController {}',
      source_file: 'services/api/src/users/users.controller.ts',
      source_line: 4,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a snippet missing source_file', () => {
    const result = CodeSnippetWithCitationSchema.safeParse({
      kind: 'controller-shape',
      language: 'typescript',
      code: 'export class UsersController {}',
      source_line: 4,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a snippet missing source_line', () => {
    const result = CodeSnippetWithCitationSchema.safeParse({
      kind: 'controller-shape',
      language: 'typescript',
      code: 'export class UsersController {}',
      source_file: 'services/api/src/users/users.controller.ts',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive source_line', () => {
    const result = CodeSnippetWithCitationSchema.safeParse({
      kind: 'controller-shape',
      language: 'typescript',
      code: 'export class UsersController {}',
      source_file: 'services/api/src/users/users.controller.ts',
      source_line: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('NeedsVerificationEntrySchema', () => {
  const base = {
    id: 'q1',
    question: 'Why does X happen?',
    reason: 'cant tell from code',
    impact:
      'changes the auth wiki page Strategy section AND the auth skill body Authentication section',
  };

  it('accepts a complete entry', () => {
    expect(
      NeedsVerificationEntrySchema.safeParse({
        ...base,
        attempted_resolution: ['Read src/auth/index.ts', 'Grep \\bAuthN\\b'],
      }).success,
    ).toBe(true);
  });

  it('rejects fewer than 2 attempted_resolution entries', () => {
    expect(
      NeedsVerificationEntrySchema.safeParse({
        ...base,
        attempted_resolution: ['Read foo'],
      }).success,
    ).toBe(false);
  });

  it('rejects impact shorter than 40 chars', () => {
    expect(
      NeedsVerificationEntrySchema.safeParse({
        ...base,
        impact: 'too short',
        attempted_resolution: ['Read foo', 'Grep bar'],
      }).success,
    ).toBe(false);
  });
});
