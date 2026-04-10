/**
 * Extract synthesis markdown sections from agent output
 */

import { SECTION_MARKERS } from './types.js';

/**
 * Extract synthesis markdown sections from agent output.
 * Robust version that handles preamble and whitespace.
 */
export function extractSynthesisMarkdown(output: string): {
  claudemd: string;
  projectContext: string;
} | null {
  // Find "# CLAUDE.md Content" anywhere in the output (skip preamble)
  const claudeHeaderIndex = output.indexOf(SECTION_MARKERS.CLAUDE_MD_HEADER);
  if (claudeHeaderIndex === -1) {
    return null;
  }

  // Find "---" separator after CLAUDE.md content
  // Must be on its own line: \n---\n
  const afterClaudeHeader = output.slice(claudeHeaderIndex);
  const separatorMatch = afterClaudeHeader.match(/\n---\s*\n/);
  if (!separatorMatch || separatorMatch.index === undefined) {
    return null;
  }

  // Find "# project-context/SKILL.md Content" after separator
  const contextHeaderIndex = output.indexOf(
    SECTION_MARKERS.PROJECT_CONTEXT_HEADER,
    claudeHeaderIndex + separatorMatch.index,
  );
  if (contextHeaderIndex === -1) {
    return null;
  }

  // Extract CLAUDE.md content (from header to separator)
  const claudeStartIndex = claudeHeaderIndex + SECTION_MARKERS.CLAUDE_MD_HEADER.length;
  const claudeEndIndex = claudeHeaderIndex + separatorMatch.index;
  const claudemd = output.slice(claudeStartIndex, claudeEndIndex).trim();

  // Extract project-context content (from header to end)
  const contextStartIndex = contextHeaderIndex + SECTION_MARKERS.PROJECT_CONTEXT_HEADER.length;
  const projectContext = output.slice(contextStartIndex).trim();

  return { claudemd, projectContext };
}
