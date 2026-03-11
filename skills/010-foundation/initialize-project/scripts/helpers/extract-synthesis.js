#!/usr/bin/env node

/**
 * Extract CLAUDE.md and project-context from synthesis-raw.md
 */

const fs = require('fs');
const path = require('path');

const synthesisFile = process.argv[2];
const tempDir = process.argv[3];

if (!synthesisFile || !tempDir) {
  console.error('Error: synthesis file and temp directory required');
  console.error('Usage: extract-synthesis.js <synthesis-file> <temp-dir>');
  process.exit(1);
}

if (!fs.existsSync(synthesisFile)) {
  console.error(`Error: Synthesis file not found: ${synthesisFile}`);
  process.exit(1);
}

function extractFiles(synthesisPath, outputDir) {
  const content = fs.readFileSync(synthesisPath, 'utf-8');

  // Find CLAUDE.md section (from "# CLAUDE.md Content" to "---\n# project-context")
  const claudeMatch = content.match(/# CLAUDE\.md Content\s*\n+([\s\S]*?)(?=\n+---\s*\n+# project-context)/);
  if (!claudeMatch) {
    throw new Error('Could not find CLAUDE.md Content section in synthesis');
  }

  // Find project-context section (everything from "# project-context" header to end)
  const contextMatch = content.match(/# project-context\/SKILL\.md Content\s*\n+([\s\S]*$)/);
  if (!contextMatch) {
    throw new Error('Could not find project-context/SKILL.md Content section in synthesis');
  }

  const claudeContent = claudeMatch[1].trim();
  const contextContent = contextMatch[1].trim();

  // Write to temp files
  const claudePath = path.join(outputDir, 'CLAUDE.md');
  const contextPath = path.join(outputDir, 'project-context.md');

  fs.writeFileSync(claudePath, claudeContent, 'utf-8');
  fs.writeFileSync(contextPath, contextContent, 'utf-8');

  console.log(`✓ Extracted CLAUDE.md (${claudeContent.split('\n').length} lines)`);
  console.log(`✓ Extracted project-context.md (${contextContent.split('\n').length} lines)`);

  return {
    claudePath,
    contextPath,
    claudeLines: claudeContent.split('\n').length,
    contextLines: contextContent.split('\n').length
  };
}

try {
  extractFiles(synthesisFile, tempDir);
  process.exit(0);
} catch (error) {
  console.error('Error extracting files:', error.message);
  process.exit(1);
}
