import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const PROMPTS_ROOT = join(__dirname, '../../../../..', 'src/nodes/initialize-project/phase1');

const ANALYZERS = [
  { name: 'structure-architecture', dir: 'structure-analyzer' },
  { name: 'tech-stack-dependencies', dir: 'tech-stack-analyzer' },
  { name: 'code-patterns-testing', dir: 'code-patterns-analyzer' },
  { name: 'data-flows-integrations', dir: 'data-flows-analyzer' },
] as const;

function bodyAfterStrippingForbidLines(content: string): string {
  // Drop lines that legitimately quote a forbidden form to forbid it.
  // The check is for *prescriptions*, not for the forbid wording itself.
  return content
    .split('\n')
    .filter(
      (line) =>
        !/get_architecture_overview/i.test(line) &&
        !/do\s*not\s*call/i.test(line) &&
        !/forbidden/i.test(line),
    )
    .join('\n');
}

describe('Phase 1 execution-instructions follow the graph navigation discipline', () => {
  for (const { name, dir } of ANALYZERS) {
    describe(`${name} analyzer`, () => {
      const path = join(PROMPTS_ROOT, dir, 'prompts/execution-instructions.md');
      const content = readFileSync(path, 'utf-8');
      const stripped = bodyAfterStrippingForbidLines(content);

      it('mentions the discipline (lean params, drill-in caps)', () => {
        expect(content).toMatch(/Graph navigation discipline/i);
      });

      it('explicitly forbids get_architecture_overview somewhere in the body', () => {
        // The phrase appears in either a "Forbidden" block or the
        // self-verification checklist, with prose about overflow.
        expect(content).toMatch(/get_architecture_overview/);
        expect(content).toMatch(/forbidden|do not call|do NOT call/i);
      });

      it('does NOT prescribe the degenerate find_large_functions(min_lines:1) call', () => {
        expect(stripped).not.toMatch(/min_lines:\s*1\b/);
      });

      it('does NOT prescribe semantic_search_nodes limit > 20 (legacy 30/50 patterns)', () => {
        const calls = stripped.match(/semantic_search_nodes\([^)]*\)/g) ?? [];
        for (const call of calls) {
          const limitMatch = call.match(/limit:\s*(\d+)/);
          if (limitMatch) {
            const limit = Number(limitMatch[1]);
            expect(limit, `over-limit semantic_search_nodes call: ${call}`).toBeLessThanOrEqual(20);
          }
        }
      });

      it('does NOT prescribe list_communities with detail_level: "standard"', () => {
        // Check pattern only inside list_communities calls.
        const calls = stripped.match(/list_communities\([^)]*\)/g) ?? [];
        for (const call of calls) {
          expect(call, `list_communities standard form forbidden: ${call}`).not.toMatch(
            /detail_level:\s*"?standard"?/,
          );
        }
      });
    });
  }
});
