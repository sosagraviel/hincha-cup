#!/usr/bin/env node

/**
 * PARSE OPUS OUTPUT
 *
 * Extracts CLAUDE.md and project-context sections from Opus synthesis output
 * - Parses section markers
 * - Validates both sections exist
 * - Cleans and formats output
 * - Returns structured data
 */

const fs = require('fs');
const path = require('path');

/**
 * Section markers used by Opus
 */
const MARKERS = {
  CLAUDE_MD: '# CLAUDE.md Content',
  PROJECT_CONTEXT: '# project-context/SKILL.md Content'
};

/**
 * Parse Opus synthesis output
 */
function parseOpusOutput(content) {
  const result = {
    success: false,
    claudeMd: null,
    projectContext: null,
    errors: []
  };

  // Find section markers
  const claudeMdIdx = content.indexOf(MARKERS.CLAUDE_MD);
  const projectContextIdx = content.indexOf(MARKERS.PROJECT_CONTEXT);

  // Validate markers exist
  if (claudeMdIdx === -1) {
    result.errors.push({
      type: 'missing_marker',
      message: 'Missing CLAUDE.MD section marker',
      marker: MARKERS.CLAUDE_MD
    });
  }

  if (projectContextIdx === -1) {
    result.errors.push({
      type: 'missing_marker',
      message: 'Missing PROJECT-CONTEXT section marker',
      marker: MARKERS.PROJECT_CONTEXT
    });
  }

  if (result.errors.length > 0) {
    return result;
  }

  // Extract sections
  try {
    // CLAUDE.MD is between its marker and the separator (---)
    // Find the line after the marker
    const claudeMdStart = claudeMdIdx + MARKERS.CLAUDE_MD.length;
    const claudeMdContentRaw = content.substring(claudeMdStart, projectContextIdx);

    // Remove the separator (---) from the end of CLAUDE.MD content
    const claudeMdContent = claudeMdContentRaw.replace(/\n---\n\s*$/, '').trim();

    // PROJECT-CONTEXT is after its marker to end
    const projectContextContent = content.substring(
      projectContextIdx + MARKERS.PROJECT_CONTEXT.length
    ).trim();

    // Validate sections are not empty
    if (!claudeMdContent || claudeMdContent.length < 100) {
      result.errors.push({
        type: 'empty_section',
        message: 'CLAUDE.MD section is empty or too short',
        length: claudeMdContent?.length || 0
      });
    }

    if (!projectContextContent || projectContextContent.length < 100) {
      result.errors.push({
        type: 'empty_section',
        message: 'PROJECT-CONTEXT section is empty or too short',
        length: projectContextContent?.length || 0
      });
    }

    if (result.errors.length > 0) {
      return result;
    }

    // Success
    result.success = true;
    result.claudeMd = claudeMdContent;
    result.projectContext = projectContextContent;

    // Add metadata
    result.metadata = {
      claudeMdLines: claudeMdContent.split('\n').length,
      projectContextLines: projectContextContent.split('\n').length,
      claudeMdBytes: Buffer.byteLength(claudeMdContent, 'utf-8'),
      projectContextBytes: Buffer.byteLength(projectContextContent, 'utf-8')
    };

  } catch (error) {
    result.errors.push({
      type: 'parse_error',
      message: 'Failed to extract sections',
      details: error.message
    });
  }

  return result;
}

/**
 * Parse and save to separate files
 */
function parseAndSave(inputFile, claudeMdFile, projectContextFile) {
  console.log('Parsing Opus synthesis output...');
  console.log(`  Input: ${inputFile}`);

  // Read input
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');

  // Parse
  const result = parseOpusOutput(content);

  if (!result.success) {
    console.error('');
    console.error('✗ Parsing failed:');
    result.errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err.message}`);
    });
    throw new Error('Failed to parse Opus output');
  }

  // Write CLAUDE.md
  fs.writeFileSync(claudeMdFile, result.claudeMd, 'utf-8');
  console.log(`✓ CLAUDE.MD extracted (${result.metadata.claudeMdLines} lines)`);

  // Write project-context
  fs.writeFileSync(projectContextFile, result.projectContext, 'utf-8');
  console.log(`✓ PROJECT-CONTEXT extracted (${result.metadata.projectContextLines} lines)`);

  console.log('');
  console.log('Metadata:');
  console.log(`  CLAUDE.MD:        ${result.metadata.claudeMdLines} lines, ${result.metadata.claudeMdBytes} bytes`);
  console.log(`  PROJECT-CONTEXT:  ${result.metadata.projectContextLines} lines, ${result.metadata.projectContextBytes} bytes`);

  return result;
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: parse-opus-output.js <input-file> <claude-md-output> <project-context-output>');
    console.error('Example: parse-opus-output.js synthesis-raw.md CLAUDE.md project-context.md');
    process.exit(1);
  }

  const [inputFile, claudeMdFile, projectContextFile] = args;

  try {
    parseAndSave(inputFile, claudeMdFile, projectContextFile);
    console.log('');
    console.log('✓ Parsing complete');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = {
  parseOpusOutput,
  parseAndSave,
  MARKERS
};
