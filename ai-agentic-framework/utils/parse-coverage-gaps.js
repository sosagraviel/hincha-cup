#!/usr/bin/env node

/**
 * Coverage Gap Parser for Implement-Ticket Workflow
 *
 * Parses lcov.info files and generates actionable reports for coverage gaps.
 * Extracts uncovered line ranges with code context and suggests targeted tests.
 *
 * Usage:
 *   node parse-coverage-gaps.js <lcov-path> <jira-key> [output-path]
 *
 * Example:
 *   node parse-coverage-gaps.js coverage/lcov.info PROJ-123 .claude/coverage-gaps/PROJ-123-gaps.md
 *
 * Exit codes:
 *   0 - No coverage gaps found
 *   1 - Coverage gaps found (report generated)
 *   2 - Error parsing coverage data
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse lcov.info file and extract uncovered line ranges with context
 *
 * @param {string} lcovPath - Path to lcov.info file
 * @returns {Array<Object>} - Array of gap objects with file, uncoveredLines, and ranges
 */
function parseCoverageGaps(lcovPath) {
  try {
    const lcovContent = fs.readFileSync(lcovPath, 'utf-8');
    const files = lcovContent.split('end_of_record');

    const gaps = [];

    for (const fileSection of files) {
      if (!fileSection.trim()) continue;

      const lines = fileSection.split('\n');
      let currentFile = null;
      const uncoveredLines = [];

      for (const line of lines) {
        if (line.startsWith('SF:')) {
          currentFile = line.substring(3);
        } else if (line.startsWith('DA:')) {
          const [lineNum, hitCount] = line.substring(3).split(',').map(Number);
          if (hitCount === 0) {
            uncoveredLines.push(lineNum);
          }
        }
      }

      if (currentFile && uncoveredLines.length > 0) {
        gaps.push({
          file: currentFile,
          uncoveredLines,
          ranges: groupIntoRanges(uncoveredLines)
        });
      }
    }

    return gaps;
  } catch (error) {
    console.error(`Error parsing lcov file: ${error.message}`);
    process.exit(2);
  }
}

/**
 * Group individual line numbers into contiguous ranges
 *
 * @param {number[]} lines - Array of line numbers
 * @returns {Array<Object>} - Array of range objects with start, end, and count
 */
function groupIntoRanges(lines) {
  if (lines.length === 0) return [];

  lines.sort((a, b) => a - b);
  const ranges = [];
  let start = lines[0];
  let end = lines[0];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === end + 1) {
      end = lines[i];
    } else {
      ranges.push({ start, end, count: end - start + 1 });
      start = lines[i];
      end = lines[i];
    }
  }

  ranges.push({ start, end, count: end - start + 1 });
  return ranges;
}

/**
 * Extract code context around uncovered lines
 *
 * @param {string} filePath - Path to source file
 * @param {number} lineStart - Starting line number (1-indexed)
 * @param {number} lineEnd - Ending line number (1-indexed)
 * @returns {Object} - Context object with before, target, and after arrays
 */
function extractCodeContext(filePath, lineStart, lineEnd) {
  if (!fs.existsSync(filePath)) {
    return { before: [], target: [], after: [] };
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8').split('\n');
    const contextBefore = 3;
    const contextAfter = 3;

    return {
      before: fileContent.slice(Math.max(0, lineStart - contextBefore - 1), lineStart - 1),
      target: fileContent.slice(lineStart - 1, lineEnd),
      after: fileContent.slice(lineEnd, Math.min(fileContent.length, lineEnd + contextAfter))
    };
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`);
    return { before: [], target: [], after: [] };
  }
}

/**
 * Generate actionable coverage gap report in Markdown
 *
 * @param {Array<Object>} gaps - Array of gap objects from parseCoverageGaps
 * @param {string} jiraKey - Jira ticket key for report header
 * @returns {string} - Markdown report
 */
function generateCoverageGapReport(gaps, jiraKey) {
  let report = `# Coverage Gap Analysis: ${jiraKey}\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- Files with gaps: ${gaps.length}\n`;
  report += `- Total uncovered lines: ${gaps.reduce((sum, g) => sum + g.uncoveredLines.length, 0)}\n\n`;

  if (gaps.length === 0) {
    report += `**Status**: All lines covered!\n\n`;
    return report;
  }

  report += `## Detailed Gaps\n\n`;

  for (const gap of gaps) {
    const relativePath = gap.file.startsWith('/')
      ? path.relative(process.cwd(), gap.file)
      : gap.file;

    report += `### ${relativePath}\n\n`;
    report += `**Uncovered lines**: ${gap.uncoveredLines.length}\n\n`;

    for (const range of gap.ranges) {
      const context = extractCodeContext(gap.file, range.start, range.end);

      report += `#### Lines ${range.start}`;
      if (range.count > 1) {
        report += `-${range.end}`;
      }
      report += ` (${range.count} line${range.count > 1 ? 's' : ''})\n\n`;

      report += '```typescript\n';

      // Before context (dimmed with comments)
      if (context.before.length > 0) {
        context.before.forEach((line, i) => {
          const lineNum = range.start - context.before.length + i;
          report += `// ${lineNum}: ${line}\n`;
        });
      }

      // Target lines (highlighted with ❌)
      context.target.forEach((line, i) => {
        report += `❌ ${range.start + i}: ${line}\n`;
      });

      // After context (dimmed with comments)
      if (context.after.length > 0) {
        context.after.forEach((line, i) => {
          const lineNum = range.end + 1 + i;
          report += `// ${lineNum}: ${line}\n`;
        });
      }

      report += '```\n\n';

      // Generate test suggestion based on code context
      const firstLine = context.target[0]?.trim() || '';
      let testDescription = 'this code path';

      // Heuristics for better test suggestions
      if (firstLine.includes('if') || firstLine.includes('else')) {
        testDescription = 'this conditional branch';
      } else if (firstLine.includes('catch') || firstLine.includes('throw')) {
        testDescription = 'this error handling path';
      } else if (firstLine.includes('return')) {
        testDescription = 'this return path';
      } else if (firstLine.includes('case') || firstLine.includes('default')) {
        testDescription = 'this switch case';
      }

      report += '**Suggested test**:\n';
      report += '```typescript\n';
      report += `it('should cover ${testDescription} (lines ${range.start}-${range.end})', () => {\n`;
      report += `  // TODO: Add test to cover this code path\n`;
      if (firstLine) {
        report += `  // Context: ${firstLine.substring(0, 60)}${firstLine.length > 60 ? '...' : ''}\n`;
      }
      report += `});\n`;
      report += '```\n\n';
    }
  }

  return report;
}

/**
 * Generate JSON summary for programmatic consumption
 *
 * @param {Array<Object>} gaps - Array of gap objects
 * @returns {Object} - Summary object
 */
function generateSummaryJson(gaps) {
  return {
    timestamp: new Date().toISOString(),
    filesWithGaps: gaps.length,
    totalUncoveredLines: gaps.reduce((sum, g) => sum + g.uncoveredLines.length, 0),
    gaps: gaps.map(g => ({
      file: g.file,
      uncoveredLines: g.uncoveredLines,
      ranges: g.ranges
    }))
  };
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const [lcovPath, jiraKey, outputPath] = process.argv.slice(2);

  if (!lcovPath || !jiraKey) {
    console.error('Usage: parse-coverage-gaps.js <lcov-path> <jira-key> [output-path]');
    console.error('');
    console.error('Examples:');
    console.error('  parse-coverage-gaps.js coverage/lcov.info PROJ-123');
    console.error('  parse-coverage-gaps.js coverage/lcov.info PROJ-123 .claude/coverage-gaps/PROJ-123-gaps.md');
    process.exit(2);
  }

  if (!fs.existsSync(lcovPath)) {
    console.error(`Error: lcov file not found: ${lcovPath}`);
    process.exit(2);
  }

  console.log(`Parsing coverage data from ${lcovPath}...`);
  const gaps = parseCoverageGaps(lcovPath);

  if (gaps.length === 0) {
    console.log('✓ No coverage gaps found!');
    process.exit(0);
  }

  console.log(`Found ${gaps.length} file(s) with coverage gaps`);
  console.log(`Total uncovered lines: ${gaps.reduce((sum, g) => sum + g.uncoveredLines.length, 0)}`);

  const report = generateCoverageGapReport(gaps, jiraKey);

  if (outputPath) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, report);
    console.log(`✓ Gap report written to ${outputPath}`);

    // Also write JSON summary
    const jsonPath = outputPath.replace(/\.md$/, '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(generateSummaryJson(gaps), null, 2));
    console.log(`✓ JSON summary written to ${jsonPath}`);
  } else {
    console.log('\n' + report);
  }

  // Exit with non-zero to signal gaps exist
  process.exit(1);
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  parseCoverageGaps,
  generateCoverageGapReport,
  generateSummaryJson,
  groupIntoRanges,
  extractCodeContext
};
