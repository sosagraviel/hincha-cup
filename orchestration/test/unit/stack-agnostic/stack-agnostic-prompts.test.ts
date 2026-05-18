/**
 * Stack-agnostic anti-regression test for Phase 1 analyzer prompts.
 *
 * Plan section § 6.1 (universal scaling formula) requires that the framework
 * never branches on a specific language, framework, runtime, package manager,
 * or repository topology outside the three sanctioned extension points
 * (§ 0.2 — `language-config/`, `service-seed.ts` token sets, Zod schemas).
 *
 * This test enforces the rule mechanically: it greps every Phase 1 analyzer
 * `prompts/*.md` for any token that resembles a language extension and fails
 * CI when a hit appears. The denylist is inversion-based: rather than try to
 * enumerate every framework name in the world (impossible — new frameworks
 * land every week and the framework must support them via the registries),
 * we forbid the canonical token shapes that should NEVER appear in a
 * stack-agnostic prompt.
 *
 * The intent is preventive — once green, the test guards against future
 * regressions even if someone forgets the diversity discipline.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, it } from 'vitest';

const PHASE1_PROMPTS_ROOT = 'src/nodes/initialize-project/phase1';
const REPO_ROOT = process.cwd();

/**
 * File-extension tokens that should never appear in a stack-agnostic prompt.
 * The framework's prompts reference placeholders (`<extension>`) instead of
 * concrete extensions because the analyzers operate on whatever shape the
 * target project has — including future languages we haven't seen yet.
 *
 * Existing language extensions are listed via the `language-config/` registry,
 * NOT inline in prompt text. Allowed exceptions:
 *   - inside fenced code blocks that demonstrate a placeholder (`<path>.<ext>`)
 *   - inside a "Forbidden Globs:" line that names patterns to skip
 *     (those patterns ARE inherently stack-pattern strings, but they live
 *      in deterministic generated text, not free-form prose)
 */
const STACK_SPECIFIC_EXTENSIONS = [
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
  '.hpp',
  '.swift',
  '.dart',
  '.ex',
  '.exs',
  '.cr',
  '.zig',
  '.nim',
  '.scala',
  '.clj',
  '.lua',
  '.r',
  '.jl',
] as const;

/**
 * Strip protected contexts from a line before scanning. Protected contexts:
 *
 *   - Markdown inline code spans `like.this` (where a stack-specific token
 *     may legitimately appear as a syntactic example — the surrounding
 *     prose is what we care about).
 *   - "Forbidden Globs" line bodies — those literally list glob patterns
 *     the analyzer must NOT execute, so naming them is correct.
 *   - URL-only references (https://example.com/path.ts) — those are
 *     informational, not stack-prescriptive.
 *
 * The grep then runs on the residual prose.
 */
function stripProtectedContexts(line: string): string {
  let out = line;
  out = out.replace(/`[^`]*`/g, '');
  out = out.replace(/https?:\/\/\S+/g, '');
  if (/forbidden\s+globs?/i.test(line)) return '';
  return out;
}

function listPhase1PromptFiles(): string[] {
  const promptsRoot = join(REPO_ROOT, PHASE1_PROMPTS_ROOT);
  if (!existsSync(promptsRoot)) {
    throw new Error(
      `stack-agnostic-prompts test could not find phase1 prompts root at ` +
        `'${promptsRoot}'. Run from the orchestration/ directory.`,
    );
  }
  const matches: string[] = [];
  for (const analyzerDir of readdirSync(promptsRoot)) {
    const promptsDir = join(promptsRoot, analyzerDir, 'prompts');
    if (!existsSync(promptsDir)) continue;
    if (!statSync(promptsDir).isDirectory()) continue;
    for (const name of readdirSync(promptsDir)) {
      if (name.endsWith('.md')) matches.push(join(promptsDir, name));
    }
  }
  if (matches.length === 0) {
    throw new Error(
      `stack-agnostic-prompts test could not enumerate any Phase 1 prompt .md ` +
        `files under '${promptsRoot}'.`,
    );
  }
  return matches;
}

describe('stack-agnostic prompt audit (Phase 1 analyzers)', () => {
  const files = listPhase1PromptFiles();

  it.each(files)('contains no hardcoded language extensions in free-form prose — %s', (file) => {
    const lines = readFileSync(file, 'utf-8').split('\n');
    const offenders: Array<{ line: number; ext: string; snippet: string }> = [];

    lines.forEach((raw, idx) => {
      const scannable = stripProtectedContexts(raw);
      if (!scannable.trim()) return;
      for (const ext of STACK_SPECIFIC_EXTENSIONS) {
        const re = new RegExp(`(?<![A-Za-z0-9_])\\${ext}(?![A-Za-z0-9_])`);
        if (re.test(scannable)) {
          offenders.push({
            line: idx + 1,
            ext,
            snippet: raw.trim().slice(0, 140),
          });
        }
      }
    });

    if (offenders.length > 0) {
      const detail = offenders
        .map((o) => `  ${file}:${o.line}  uses '${o.ext}':  ${o.snippet}`)
        .join('\n');
      throw new Error(
        `Stack-agnostic violation: Phase 1 prompts must never embed hardcoded ` +
          `language extensions in free-form prose. Replace each hit with an abstract ` +
          `placeholder (e.g. '<extension>', '<path>', '<glob-pattern>') or move the ` +
          `value into the 'language-config/' registry. Offenders:\n${detail}`,
      );
    }
  });
});
