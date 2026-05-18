/**
 * Stack-agnostic anti-regression test for the CRITIC block (Phase B).
 *
 * The CRITIC block is rendered by the `<<script:critic-block>>` prompt script
 * from each Phase 1 analyzer's Zod schema. Plan section § 6.2 requires that
 * every example value inside a rendered CRITIC block:
 *
 *   - matches the abstract-placeholder regex `<[a-z][a-z0-9_-]+>`, OR
 *   - is a literal value pulled directly from the Zod schema (an enum value,
 *     a `regex` pattern source, a numeric constraint, a literal string).
 *
 * The test renders each analyzer's CRITIC block, scans every line that
 * contains a quoted example, and rejects strings that look like a concrete
 * stack identifier (a language extension, a framework name, a file path
 * with a stack-specific suffix).
 *
 * The test also asserts that the rendered output contains the
 * stack-agnostic reminder phrase exported from `critic-block.ts` — that
 * reminder is the contract the script promises to honor.
 */

import { describe, expect, it } from 'vitest';
import { CRITIC_STACK_AGNOSTIC_REMINDER } from '../../../src/services/framework/prompt-scripts/scripts/critic-block.js';
import { renderPromptScripts } from '../../../src/services/framework/prompt-scripts/index.js';
import type { PromptScriptContext } from '../../../src/services/framework/prompt-scripts/types.js';
import { AGENT_OUTPUT_SCHEMAS } from '../../../src/schemas/phase1-agent-outputs.schema.js';

const STUB_CONTEXT: PromptScriptContext = {
  projectPath: '/stub/project',
  frameworkPath: '/stub/framework',
  tempDir: '/stub/project/.claude-temp/initialize-project',
};

/**
 * Concrete-stack tokens that should never appear in a rendered CRITIC block.
 * The list mirrors the prompt audit's denylist but is checked against the
 * RENDERED output, not the source prompts — catching the case where a Zod
 * `.describe()` annotation leaks a stack-specific example.
 */
const STACK_SPECIFIC_TOKENS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.rb',
  '.php',
  '.cs',
  '.fs',
  '.cpp',
  '.swift',
  '.dart',
  '.scala',
  '.clj',
  '.zig',
  '.cr',
  '.ex',
];

describe('CRITIC block — stack-agnostic placeholders', () => {
  const agents = Object.keys(AGENT_OUTPUT_SCHEMAS);

  for (const agent of agents) {
    it(`${agent}: rendered CRITIC contains the stack-agnostic reminder phrase`, () => {
      const rendered = renderPromptScripts(`<<script:critic-block agent=${agent}>>`, STUB_CONTEXT);
      expect(rendered).toContain(CRITIC_STACK_AGNOSTIC_REMINDER);
    });

    /*
     * The skeleton legitimately embeds `regex=<...>` constraints that may
     * contain `\\.ts`-style anchored extensions inside literal regex sources.
     * To distinguish "regex source from a Zod schema" from "free-form prose
     * that mentions a language", we only fail when a stack-token appears
     * OUTSIDE a `pattern=...` constraint annotation AND outside a fenced
     * code block.
     *
     * Stack-agnostic intent: the CRITIC block legend explains how to read
     * the constraints; the schema content itself comes from Zod, which is
     * shape-only.
     */
    it(`${agent}: rendered CRITIC contains no concrete-stack tokens in free-form prose`, () => {
      const rendered = renderPromptScripts(`<<script:critic-block agent=${agent}>>`, STUB_CONTEXT);

      let insideFence = false;
      const offenders: Array<{ line: number; tok: string; snippet: string }> = [];
      rendered.split('\n').forEach((line, idx) => {
        if (/^```/.test(line.trim())) {
          insideFence = !insideFence;
          return;
        }
        if (insideFence) return;
        const scrubbed = line.replace(/pattern=\S+/g, '').replace(/`[^`]*`/g, '');
        if (!scrubbed.trim()) return;
        for (const tok of STACK_SPECIFIC_TOKENS) {
          const re = new RegExp(`(?<![A-Za-z0-9_])\\${tok}(?![A-Za-z0-9_])`);
          if (re.test(scrubbed)) {
            offenders.push({
              line: idx + 1,
              tok,
              snippet: line.trim().slice(0, 140),
            });
          }
        }
      });

      if (offenders.length > 0) {
        const detail = offenders
          .map((o) => `  line ${o.line} contains '${o.tok}': ${o.snippet}`)
          .join('\n');
        throw new Error(
          `Rendered CRITIC for '${agent}' contains stack-specific tokens in ` +
            `free-form prose. The CRITIC block must work for every project the ` +
            `framework lands on — replace the concrete extension/framework with ` +
            `an abstract placeholder (e.g. '<extension>') or move the value ` +
            `into the language-config registry.\n${detail}`,
        );
      }
    });
  }
});
