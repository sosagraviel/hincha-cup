import type { AuthConfig } from '../../auth/auth-detector.js';
import { AuthMode } from '../../auth/auth-detector.js';

/**
 * XML context tag builders - generic building blocks
 * NO workflow-specific logic - pure string formatting
 */

/**
 * Build excluded directories XML tag.
 *
 * Framework deny-rules + PreToolUse hooks enforce these at runtime
 * across Glob/Grep/Read/Bash, so the agent only needs the list itself,
 * not a treatise on why. Brief is better — the agent reads the same
 * block on every spawn.
 */
export function buildExcludedDirsTag(dirs: string[]): string {
  return [
    '<excluded_directories>',
    'The directories below are off-limits (deny-rules + PreToolUse hooks',
    'block tool calls that walk them; reason as if they do not exist):',
    dirs.map((d) => `  - ${d}`).join('\n'),
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
