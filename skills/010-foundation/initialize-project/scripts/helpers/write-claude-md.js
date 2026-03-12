#!/usr/bin/env node

/**
 * WRITE CLAUDE.MD
 *
 * Writes CLAUDE.md to project with validation
 * - Line count check (< 250 lines)
 * - Format validation
 * - Backup existing file
 * - Write to .claude/CLAUDE.md
 * - Verify write successful
 */

const fs = require('fs');
const path = require('path');

/**
 * Validate CLAUDE.md content before writing
 */
function validateContent(content, maxLines = 250) {
  const errors = [];
  const warnings = [];

  // Line count
  const lines = content.split('\n');
  if (lines.length > maxLines) {
    errors.push({
      type: 'line_count_exceeded',
      message: `CLAUDE.md has ${lines.length} lines (max: ${maxLines})`,
      actual: lines.length,
      max: maxLines
    });
  }

  // Must start with frontmatter
  if (!content.trim().startsWith('---')) {
    errors.push({
      type: 'missing_frontmatter',
      message: 'CLAUDE.md must start with YAML frontmatter (---)'
    });
  }

  // Must have essential sections
  const requiredSections = [
    '# ',  // Main header
    '## Tech Stack',
    '## File Placement',
    '## Essential Commands'
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
 * Backup existing CLAUDE.md if it exists
 */
function backupExisting(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${timestamp}`;

  fs.copyFileSync(filePath, backupPath);
  console.log(`  Backed up existing file: ${backupPath}`);

  return backupPath;
}

/**
 * Write CLAUDE.md to project
 */
function writeClaudeMd(content, projectPath, options = {}) {
  const {
    maxLines = 250,
    validate = true,
    backup = true,
    dryRun = false
  } = options;

  console.log('Writing CLAUDE.md...');
  console.log(`  Project: ${projectPath}`);

  // Validate content
  if (validate) {
    console.log('  Validating content...');
    const validation = validateContent(content, maxLines);

    console.log(`  Lines: ${validation.lineCount}/${maxLines}`);
    console.log(`  Errors: ${validation.errors.length}`);
    console.log(`  Warnings: ${validation.warnings.length}`);

    if (!validation.valid) {
      console.error('');
      console.error('✗ Validation failed:');
      validation.errors.forEach((err, idx) => {
        console.error(`  ${idx + 1}. ${err.message}`);
      });
      throw new Error('CLAUDE.md validation failed');
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
  const claudeDir = path.join(projectPath, '.claude');
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  // Create .claude directory if needed
  if (!dryRun && !fs.existsSync(claudeDir)) {
    console.log('  Creating .claude directory...');
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // Backup existing
  if (backup && !dryRun) {
    backupExisting(claudeMdPath);
  }

  // Write file
  if (dryRun) {
    console.log('');
    console.log('  [DRY RUN] Would write to:', claudeMdPath);
    console.log('  Content preview:');
    console.log(content.split('\n').slice(0, 10).join('\n'));
    console.log('  ...');
  } else {
    fs.writeFileSync(claudeMdPath, content, 'utf-8');
    console.log(`✓ Written to: ${claudeMdPath}`);

    // Verify write
    if (fs.existsSync(claudeMdPath)) {
      const written = fs.readFileSync(claudeMdPath, 'utf-8');
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
    path: claudeMdPath,
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
    console.error('Usage: write-claude-md.js <input-file> <project-path> [--dry-run] [--no-validate] [--no-backup]');
    console.error('Example: write-claude-md.js CLAUDE.md /path/to/project');
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
    const result = writeClaudeMd(content, projectPath, options);
    console.log('');
    console.log('✓ CLAUDE.md write complete');
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
  writeClaudeMd,
  validateContent,
  backupExisting
};
