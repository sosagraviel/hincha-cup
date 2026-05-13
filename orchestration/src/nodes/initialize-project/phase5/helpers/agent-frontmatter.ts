/**
 * Provider-aware frontmatter rewriter for generated agent files.
 *
 * Agent templates are authored against Claude's frontmatter conventions
 * (`model: opus|sonnet`, `tools: Read, Write, ...`). Codex uses the same
 * `.md` + YAML frontmatter shape but with different semantics:
 * - `model` must be a Codex model ID, not a Claude alias
 * - `tools` is meaningless to Codex and is dropped
 *
 * This helper rewrites the frontmatter of a rendered template so the file
 * works correctly for the target provider. The body is left untouched.
 */
import { Provider } from '../../../../providers/types.js';

const FRONTMATTER_BOUNDARY = /^---\s*$/m;

/**
 * Codex model to emit in agent frontmatter, keyed by Claude alias.
 * Matches the `openai` tier from model-config.json — all agents run on the
 * same GPT-5 flagship; reasoning effort is controlled at runtime, not here.
 */
const CODEX_MODEL_BY_CLAUDE_ALIAS: Record<string, string> = {
  opus: 'gpt-5.4',
  sonnet: 'gpt-5.4',
  haiku: 'gpt-5.4-mini-2026-03-17',
};

const DEFAULT_CODEX_MODEL = 'gpt-5.4';

/**
 * Rewrite the frontmatter of a rendered agent file for the target provider.
 *
 * - `Provider.CLAUDE`: identity (no change).
 * - `Provider.CODEX`: rewrites `model:` to the Codex equivalent and removes
 *   the `tools:` line entirely.
 *
 * @param content - Rendered agent file content (must start with `---` frontmatter)
 * @param provider - Target provider
 * @returns Content with provider-appropriate frontmatter
 */
export function rewriteAgentFrontmatter(content: string, provider: Provider): string {
  if (provider === Provider.CLAUDE) return content;

  const match = content.match(FRONTMATTER_BOUNDARY);
  if (!match || match.index !== 0) {
    return content;
  }

  const rest = content.slice(match[0].length + 1);
  const closeIdx = rest.search(FRONTMATTER_BOUNDARY);
  if (closeIdx === -1) return content;

  const frontmatter = rest.slice(0, closeIdx);
  const body = rest.slice(closeIdx + rest.match(FRONTMATTER_BOUNDARY)![0].length);

  const rewritten = rewriteFrontmatterForCodex(frontmatter);
  return `---\n${rewritten}---${body}`;
}

function rewriteFrontmatterForCodex(frontmatter: string): string {
  const lines = frontmatter.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    if (/^\s*tools\s*:/.test(line)) continue;

    const modelMatch = line.match(/^(\s*)model\s*:\s*(.+?)\s*$/);
    if (modelMatch) {
      const claudeAlias = modelMatch[2].trim();
      const codexModel = CODEX_MODEL_BY_CLAUDE_ALIAS[claudeAlias] ?? DEFAULT_CODEX_MODEL;
      out.push(`${modelMatch[1]}model: ${codexModel}`);
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}
