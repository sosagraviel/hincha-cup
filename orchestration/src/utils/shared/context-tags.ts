import type { AuthConfig } from '../../auth/auth-detector.js';
import { AuthMode } from '../../auth/auth-detector.js';

/**
 * XML context tag builders - generic building blocks
 * NO workflow-specific logic - pure string formatting
 */

/**
 * Prefix to prepend for "extended thinking" / deep reasoning.
 *
 * - Claude (CLI or API): the literal `ultrathink` keyword switches Claude into
 *   extended thinking mode. It's a Claude-specific directive.
 * - Codex / OpenAI: reasoning effort is controlled via the CLI flag
 *   `--config model_reasoning_effort=high` — `ultrathink` is meaningless and
 *   would just be noise tokens at the top of the prompt.
 *
 * Callers should use this helper instead of hardcoding `ultrathink\n\n` so the
 * prompt adapts to the active provider.
 */
export function reasoningPrefix(authConfig: AuthConfig): string {
  const isClaude =
    authConfig.mode === AuthMode.CLAUDE_CLI ||
    (authConfig.mode === AuthMode.API_KEY && authConfig.provider === 'anthropic');
  return isClaude ? 'ultrathink\n\n' : '';
}

/**
 * Build excluded directories XML tag.
 *
 * The block is intentionally forceful: agents routinely ignore a weak
 * comma-separated list and then walk into node_modules / dist / the framework
 * itself, blowing the token budget on a single run. The instructions here are
 * written so that every tool call the agent makes (Glob, Grep, Read, Bash) can
 * be checked against them.
 */
export function buildExcludedDirsTag(dirs: string[]): string {
  const bullets = dirs.map((d) => `  - ${d}`).join('\n');
  return [
    '<excluded_directories>',
    'CRITICAL: Do NOT read, scan, traverse, list, glob, grep, or count files in',
    'any of the directories below — at ANY depth. These directories contain',
    'dependencies, build artifacts, generated output, caches, framework',
    'internals, and gitignored paths. Analyzing them wastes token budget and',
    'produces irrelevant findings.',
    '',
    'Excluded directories (apply recursively at every level of nesting):',
    bullets,
    '',
    'How to apply this list:',
    '  - Glob: prefix patterns with project-relative paths and do NOT match',
    '    inside excluded dirs (e.g. use `services/**/*.ts`, never `**/*.ts`',
    '    without filters).',
    '  - Grep: pass a path that is NOT one of these dirs, or use the `glob`',
    '    option to narrow. Never grep the repo root without exclusions.',
    '  - Bash with `find` / `ls` / `grep -r`: you MUST pipe through a filter',
    '    that drops every excluded dir above (use `-prune`, `grep -vE`, or',
    '    equivalent). A single-dir filter like `grep -v node_modules` is NOT',
    '    enough — you must exclude ALL of the dirs above.',
    '  - Read: never open a file whose path starts with one of these dirs.',
    '',
    'If a tool call would enter an excluded directory, stop and choose a',
    'different approach.',
    '</excluded_directories>',
  ].join('\n');
}

/**
 * Build project path XML tag
 */
export function buildProjectPathTag(projectPath: string): string {
  return ['<project_path>', projectPath, '</project_path>'].join('\n');
}

/**
 * Build JSON output format instructions
 */
export function buildJsonOutputFormat(agentName?: string): string {
  return [
    '<output_format>',
    'Raw JSON only. First character: { Last character: }',
    'No markdown code blocks, no commentary, no explanations.',
    '',
    'If validation errors occur, output only the corrected JSON.',
    '</output_format>',
  ].join('\n');
}

/**
 * Build content section with optional label
 */
export function buildContentSection(label: string, content: string): string {
  return [`=== ${label.toUpperCase()} ===`, content].join('\n');
}

/**
 * Wrap content in XML tags
 */
export function wrapInTags(tagName: string, content: string): string {
  return `<${tagName}>\n${content}\n</${tagName}>`;
}
