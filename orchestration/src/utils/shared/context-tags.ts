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
 * across Glob/Grep/Read/Bash. The prompt restatement is for model
 * awareness only — the hook does the enforcement. We compress to one
 * comma-separated line to keep the cache-eligible shared prefix small
 * (the dirs list is the largest fixed-size block in the prefix).
 *
 * Stack-agnostic: the directory names come from the registry-derived
 * `getExcludedDirectories()` list. The rendered format is purely
 * cosmetic.
 */
export function buildExcludedDirsTag(dirs: string[]): string {
  return [
    '<excluded_directories>',
    'Off-limits (deny-rules + PreToolUse hooks enforce; reason as if absent):',
    dirs.join(', '),
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
