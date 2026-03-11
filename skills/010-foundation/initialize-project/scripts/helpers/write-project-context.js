#!/usr/bin/env node

/**
 * WRITE PROJECT-CONTEXT
 *
 * Writes project-context to project with validation
 * - YAML frontmatter validation
 * - Line count check (50-800 lines)
 * - Backup existing file
 * - Write to .claude/skills/project-context/SKILL.md
 * - Verify write successful
 */

const fs = require('fs');
const path = require('path');

/**
 * Validate project-context content before writing
 */
function validateContent(content, minLines = 50, maxLines = 800) {
  const errors = [];
  const warnings = [];

  // Line count
  const lines = content.split('\n');
  if (lines.length > maxLines) {
    errors.push({
      type: 'line_count_exceeded',
      message: `project-context has ${lines.length} lines (max: ${maxLines})`,
      actual: lines.length,
      max: maxLines
    });
  }

  if (lines.length < minLines) {
    errors.push({
      type: 'line_count_below_min',
      message: `project-context has ${lines.length} lines (min: ${minLines})`,
      actual: lines.length,
      min: minLines
    });
  }

  // Must start with frontmatter
  if (!content.trim().startsWith('---')) {
    errors.push({
      type: 'missing_frontmatter',
      message: 'project-context must start with YAML frontmatter (---)'
    });
  }

  // Check for second delimiter
  const secondDelimiterIdx = content.indexOf('---', 4);
  if (secondDelimiterIdx === -1) {
    errors.push({
      type: 'invalid_frontmatter',
      message: 'Missing closing frontmatter delimiter (---)'
    });
  }

  // Must have essential sections
  const requiredSections = [
    '# ',  // Main header
    '## Purpose',
    '## Architecture',
    '## Tech Stack'
  ];

  requiredSections.forEach(section => {
    if (!content.includes(section)) {
      warnings.push({
        type: 'missing_recommended_section',
        message: `Recommended section not found: ${section}`,
        section
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    lineCount: lines.length
  };
}

/**
 * Backup existing project-context if it exists
 */
function backupExisting(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.dirname(filePath);
  const backupPath = path.join(dir, `SKILL.md.backup-${timestamp}`);

  fs.copyFileSync(filePath, backupPath);
  console.log(`  Backed up existing file: ${backupPath}`);

  return backupPath;
}

/**
 * Write project-context to project
 */
function writeProjectContext(content, projectPath, options = {}) {
  const {
    minLines = 50,
    maxLines = 800,
    validate = true,
    backup = true,
    dryRun = false
  } = options;

  console.log('Writing project-context...');
  console.log(`  Project: ${projectPath}`);

  // Validate content
  if (validate) {
    console.log('  Validating content...');
    const validation = validateContent(content, minLines, maxLines);

    console.log(`  Lines: ${validation.lineCount} (range: ${minLines}-${maxLines})`);
    console.log(`  Errors: ${validation.errors.length}`);
    console.log(`  Warnings: ${validation.warnings.length}`);

    if (!validation.valid) {
      console.error('');
      console.error('✗ Validation failed:');
      validation.errors.forEach((err, idx) => {
        console.error(`  ${idx + 1}. ${err.message}`);
      });
      throw new Error('project-context validation failed');
    }

    if (validation.warnings.length > 0) {
      console.log('');
      console.log('  Warnings:');
      validation.warnings.forEach((warn, idx) => {
        console.log(`    ${idx + 1}. ${warn.message}`);
      });
    }
  }

  // Prepare paths
  const skillDir = path.join(projectPath, '.claude', 'skills', 'project-context');
  const skillPath = path.join(skillDir, 'SKILL.md');

  // Create directory if needed
  if (!dryRun && !fs.existsSync(skillDir)) {
    console.log('  Creating directory...');
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Backup existing
  if (backup && !dryRun) {
    backupExisting(skillPath);
  }

  // Write file
  if (dryRun) {
    console.log('');
    console.log('  [DRY RUN] Would write to:', skillPath);
    console.log('  Content preview:');
    console.log(content.split('\n').slice(0, 10).join('\n'));
    console.log('  ...');
  } else {
    fs.writeFileSync(skillPath, content, 'utf-8');
    console.log(`✓ Written to: ${skillPath}`);

    // Verify write
    if (fs.existsSync(skillPath)) {
      const written = fs.readFileSync(skillPath, 'utf-8');
      if (written === content) {
        console.log('✓ Write verified');
      } else {
        throw new Error('Write verification failed: content mismatch');
      }
    } else {
      throw new Error('Write verification failed: file not found');
    }
  }

  return {
    success: true,
    path: skillPath,
    lineCount: content.split('\n').length,
    bytes: Buffer.byteLength(content, 'utf-8')
  };
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: write-project-context.js <input-file> <project-path> [--dry-run] [--no-validate] [--no-backup]');
    console.error('Example: write-project-context.js project-context.md /path/to/project');
    process.exit(1);
  }

  const [inputFile, projectPath, ...flags] = args;

  // Parse flags
  const options = {
    dryRun: flags.includes('--dry-run'),
    validate: !flags.includes('--no-validate'),
    backup: !flags.includes('--no-backup')
  };

  // Read input
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');

  try {
    const result = writeProjectContext(content, projectPath, options);
    console.log('');
    console.log('✓ project-context write complete');
    console.log(`  Path:  ${result.path}`);
    console.log(`  Lines: ${result.lineCount}`);
    console.log(`  Bytes: ${result.bytes}`);
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = {
  writeProjectContext,
  validateContent,
  backupExisting
};
