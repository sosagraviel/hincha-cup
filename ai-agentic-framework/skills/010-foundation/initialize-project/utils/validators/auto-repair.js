#!/usr/bin/env node

/**
 * AUTO-REPAIR
 *
 * Automatically repairs common issues in agent outputs:
 * - Missing frontmatter delimiters
 * - [NEEDS_VERIFICATION] markers
 * - Malformed JSON
 * - Content exceeding line limits
 * - Malformed YAML frontmatter
 */

const fs = require('fs');
const path = require('path');

/**
 * Repair configuration loader
 */
function loadRepairConfig(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.auto_repair || { repairs: [] };
  } catch (error) {
    console.error('Warning: Could not load repair config, using defaults');
    return { repairs: [] };
  }
}

/**
 * Fix missing frontmatter start delimiter
 */
function fixMissingFrontmatterStart(content) {
  const changes = [];
  let repaired = content;

  if (!content.trimStart().startsWith('---')) {
    repaired = '---\n' + content;
    changes.push({
      type: 'missing_frontmatter_start',
      action: 'prepended',
      value: '---'
    });
  }

  return { repaired, changes };
}

/**
 * Fix missing frontmatter end delimiter
 */
function fixMissingFrontmatterEnd(content) {
  const changes = [];
  let repaired = content;

  const lines = content.split('\n');
  if (lines[0] === '---') {
    let foundEnd = false;
    for (let i = 1; i < Math.min(lines.length, 30); i++) {
      if (lines[i] === '---') {
        foundEnd = true;
        break;
      }
    }

    if (!foundEnd) {
      // Find a good place to insert closing delimiter
      // Look for first blank line or first markdown header
      for (let i = 1; i < Math.min(lines.length, 30); i++) {
        if (lines[i] === '' || lines[i].startsWith('#')) {
          lines.splice(i, 0, '---');
          repaired = lines.join('\n');
          changes.push({
            type: 'missing_frontmatter_end',
            action: 'inserted',
            line: i
          });
          break;
        }
      }
    }
  }

  return { repaired, changes };
}

/**
 * Remove [NEEDS_VERIFICATION] markers
 */
function removeNeedsVerification(content) {
  const changes = [];
  let repaired = content;

  const pattern = /\[NEEDS_VERIFICATION:?[^\]]*\]/gi;
  const matches = content.match(pattern);

  if (matches && matches.length > 0) {
    repaired = content.replace(pattern, '');
    changes.push({
      type: 'remove_needs_verification',
      action: 'removed',
      count: matches.length,
      markers: matches
    });
  }

  return { repaired, changes };
}

/**
 * Fix malformed JSON
 */
function fixMalformedJSON(content) {
  const changes = [];
  let repaired = content;

  try {
    // Try to parse as JSON
    JSON.parse(content);
    return { repaired, changes }; // Already valid
  } catch (error) {
    // Try common fixes
    let fixed = content;

    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // Fix single quotes to double quotes
    fixed = fixed.replace(/'([^']*)'/g, '"$1"');

    // Fix unquoted keys
    fixed = fixed.replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    try {
      JSON.parse(fixed);
      repaired = fixed;
      changes.push({
        type: 'malformed_json',
        action: 'fixed',
        fixes: ['trailing_commas', 'quote_normalization', 'unquoted_keys']
      });
    } catch (stillError) {
      // Could not fix
      changes.push({
        type: 'malformed_json',
        action: 'failed',
        error: stillError.message
      });
    }
  }

  return { repaired, changes };
}

/**
 * Truncate content to max lines (smart truncation)
 */
function truncateToMaxLines(content, maxLines, preserveSections = true) {
  const changes = [];
  const lines = content.split('\n');

  if (lines.length <= maxLines) {
    return { repaired: content, changes };
  }

  let repaired;

  if (preserveSections) {
    // Smart truncation: keep important sections
    const sectionLines = [];
    let currentSection = null;
    const sections = [];

    lines.forEach((line, idx) => {
      if (line.startsWith('#')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          header: line,
          startLine: idx,
          lines: [line]
        };
      } else if (currentSection) {
        currentSection.lines.push(line);
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    // Keep all section headers + proportional content
    let availableLines = maxLines;
    const sectionHeaders = sections.map(s => s.header).join('\n');
    availableLines -= sections.length;

    const truncatedSections = sections.map(section => {
      const maxSectionLines = Math.floor(availableLines / sections.length);
      const truncated = section.lines.slice(0, maxSectionLines);
      if (truncated.length < section.lines.length) {
        truncated.push('...');
      }
      return truncated.join('\n');
    });

    repaired = truncatedSections.join('\n\n');
  } else {
    // Simple truncation
    repaired = lines.slice(0, maxLines).join('\n') + '\n\n... (truncated)';
  }

  changes.push({
    type: 'truncate_content',
    action: 'truncated',
    originalLines: lines.length,
    truncatedLines: repaired.split('\n').length,
    preserveSections
  });

  return { repaired, changes };
}

/**
 * Fix malformed YAML frontmatter
 */
function fixYAMLFrontmatter(content) {
  const changes = [];
  let repaired = content;

  const lines = content.split('\n');
  if (lines[0] !== '---') {
    return { repaired, changes };
  }

  // Find end of frontmatter
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { repaired, changes };
  }

  const frontmatterLines = lines.slice(1, endIdx);
  const fixedFrontmatter = [];

  frontmatterLines.forEach(line => {
    // Fix common YAML issues
    let fixed = line;

    // Ensure proper key: value spacing
    fixed = fixed.replace(/^(\s*)([a-zA-Z0-9_-]+):([^ ])/g, '$1$2: $3');

    // Fix boolean values
    fixed = fixed.replace(/:\s*(true|false|yes|no)$/i, (match, value) => {
      return ': ' + value.toLowerCase();
    });

    fixedFrontmatter.push(fixed);
  });

  const bodyLines = lines.slice(endIdx + 1);
  repaired = ['---', ...fixedFrontmatter, '---', ...bodyLines].join('\n');

  if (repaired !== content) {
    changes.push({
      type: 'yaml_frontmatter',
      action: 'fixed',
      fixes: ['spacing', 'boolean_normalization']
    });
  }

  return { repaired, changes };
}

/**
 * Apply all repairs based on config
 */
function autoRepair(content, config) {
  let repaired = content;
  const allChanges = [];
  let success = true;

  // Apply repairs in sequence
  const repairs = [
    { name: 'frontmatter_start', fn: fixMissingFrontmatterStart },
    { name: 'frontmatter_end', fn: fixMissingFrontmatterEnd },
    { name: 'needs_verification', fn: removeNeedsVerification },
    { name: 'yaml_frontmatter', fn: fixYAMLFrontmatter }
  ];

  repairs.forEach(repair => {
    const result = repair.fn(repaired);
    repaired = result.repaired;
    if (result.changes.length > 0) {
      allChanges.push(...result.changes);
    }
  });

  return {
    repaired,
    changes: allChanges,
    success,
    original: content,
    modified: repaired !== content
  };
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: auto-repair.js <input-file> [output-file] [config-path]');
    console.error('Example: auto-repair.js input.md output.md ./config/validation-rules.json');
    process.exit(1);
  }

  const [inputFile, outputFile, configPath] = args;

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');
  const config = configPath ? loadRepairConfig(configPath) : { repairs: [] };

  const result = autoRepair(content, config);

  console.log('Auto-repair result:');
  console.log('  Modified:', result.modified);
  console.log('  Changes:', result.changes.length);
  console.log('  Success:', result.success);
  console.log('\nChanges:');
  result.changes.forEach((change, idx) => {
    console.log(`  ${idx + 1}. ${change.type} - ${change.action}`);
  });

  if (outputFile) {
    fs.writeFileSync(outputFile, result.repaired, 'utf-8');
    console.log(`\nRepaired content written to: ${outputFile}`);
  } else {
    console.log('\nRepaired content:');
    console.log(result.repaired);
  }

  process.exit(0);
}

module.exports = {
  autoRepair,
  fixMissingFrontmatterStart,
  fixMissingFrontmatterEnd,
  removeNeedsVerification,
  fixMalformedJSON,
  truncateToMaxLines,
  fixYAMLFrontmatter
};
