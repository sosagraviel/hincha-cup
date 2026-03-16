#!/usr/bin/env node

/**
 * VALIDATE FILE LINKS
 *
 * Validates skill references and file paths in generated content:
 * - Check skill references exist in framework
 * - Validate `/skill <name>` commands
 * - Check file paths are valid
 * - Validate required vs optional skill linking
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract skill references from content
 * Matches patterns like: /skill <name>, /050-language-frameworks/mastering-typescript
 */
function extractSkillReferences(content) {
  const references = [];

  // Pattern 1: /skill <name>
  const skillCommandPattern = /\/skill\s+([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = skillCommandPattern.exec(content)) !== null) {
    references.push({
      type: 'skill_command',
      name: match[1],
      fullMatch: match[0]
    });
  }

  // Pattern 2: Skill path references (050-language-frameworks/mastering-typescript)
  const skillPathPattern = /([0-9]{3}-[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/g;
  while ((match = skillPathPattern.exec(content)) !== null) {
    references.push({
      type: 'skill_path',
      path: match[1],
      fullMatch: match[0]
    });
  }

  // Pattern 3: .claude/skills/ references
  const claudeSkillPattern = /\.claude\/skills\/([a-zA-Z0-9_\/-]+)/g;
  while ((match = claudeSkillPattern.exec(content)) !== null) {
    references.push({
      type: 'claude_skill',
      path: match[1],
      fullMatch: match[0]
    });
  }

  return references;
}

/**
 * Check if skill exists in framework
 */
function checkSkillExists(skillPath, frameworkPath) {
  const fullPath = path.join(frameworkPath, 'qubika-agentic-framework/skills', skillPath);

  // Check for SKILL.md
  const skillFile = path.join(fullPath, 'SKILL.md');
  if (fs.existsSync(skillFile)) {
    return { exists: true, path: fullPath, type: 'skill_directory' };
  }

  // Check if directory exists
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    return { exists: true, path: fullPath, type: 'directory_without_skill' };
  }

  return { exists: false, path: fullPath };
}

/**
 * Load required skills configuration
 */
function loadRequiredSkills(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.skills || {};
  } catch (error) {
    console.error('Warning: Could not load skill requirements config');
    return {};
  }
}

/**
 * Get required skills for stack profile
 */
function getRequiredSkillsForStack(stackProfile, skillRequirements) {
  const required = [];
  const optional = [];

  // By language
  if (stackProfile.languages && skillRequirements.by_language) {
    stackProfile.languages.forEach(lang => {
      const langKey = lang.toLowerCase();
      if (skillRequirements.by_language[langKey]) {
        required.push(...(skillRequirements.by_language[langKey].required || []));
        optional.push(...(skillRequirements.by_language[langKey].optional || []));
      }
    });
  }

  // By frontend framework
  if (stackProfile.frontend?.framework && skillRequirements.by_frontend_framework) {
    const framework = stackProfile.frontend.framework.toLowerCase();
    if (skillRequirements.by_frontend_framework[framework]) {
      required.push(...(skillRequirements.by_frontend_framework[framework].required || []));
      optional.push(...(skillRequirements.by_frontend_framework[framework].optional || []));
    }
  }

  // By backend framework
  if (stackProfile.backend?.framework && skillRequirements.by_backend_framework) {
    const framework = stackProfile.backend.framework.toLowerCase();
    if (skillRequirements.by_backend_framework[framework]) {
      required.push(...(skillRequirements.by_backend_framework[framework].required || []));
      optional.push(...(skillRequirements.by_backend_framework[framework].optional || []));
    }
  }

  return {
    required: [...new Set(required)],
    optional: [...new Set(optional)]
  };
}

/**
 * Validate skill references in content
 */
function validateSkillReferences(content, frameworkPath, stackProfile = null, configPath = null) {
  const errors = [];
  const warnings = [];
  const missingSkills = [];
  const foundSkills = [];

  // Extract references
  const references = extractSkillReferences(content);

  // Check each reference
  references.forEach(ref => {
    let skillPath;

    if (ref.type === 'skill_command') {
      // Convert skill name to likely path
      // This is a heuristic - may need adjustment
      skillPath = `050-language-frameworks/${ref.name}`;
    } else if (ref.type === 'skill_path') {
      skillPath = ref.path;
    } else if (ref.type === 'claude_skill') {
      skillPath = ref.path;
    }

    const checkResult = checkSkillExists(skillPath, frameworkPath);

    if (!checkResult.exists) {
      errors.push({
        type: 'skill_not_found',
        message: `Skill not found: ${skillPath}`,
        reference: ref.fullMatch,
        skillPath
      });
      missingSkills.push(skillPath);
    } else {
      foundSkills.push(skillPath);

      if (checkResult.type === 'directory_without_skill') {
        warnings.push({
          type: 'missing_skill_md',
          message: `Directory exists but missing SKILL.md: ${skillPath}`,
          reference: ref.fullMatch,
          skillPath
        });
      }
    }
  });

  // Check required skills if stackProfile provided
  if (stackProfile && configPath) {
    const skillRequirements = loadRequiredSkills(configPath);
    const requiredSkills = getRequiredSkillsForStack(stackProfile, skillRequirements);

    requiredSkills.required.forEach(skillPath => {
      if (!foundSkills.includes(skillPath) && !missingSkills.includes(skillPath)) {
        errors.push({
          type: 'required_skill_missing',
          message: `Required skill not linked: ${skillPath}`,
          skillPath,
          severity: 'critical'
        });
        missingSkills.push(skillPath);
      }
    });

    requiredSkills.optional.forEach(skillPath => {
      if (!foundSkills.includes(skillPath)) {
        warnings.push({
          type: 'optional_skill_missing',
          message: `Optional skill not linked: ${skillPath}`,
          skillPath,
          severity: 'low'
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missingSkills: [...new Set(missingSkills)],
    foundSkills: [...new Set(foundSkills)],
    references
  };
}

/**
 * Validate file paths in content
 */
function validateFilePaths(content, basePath) {
  const errors = [];
  const warnings = [];

  // Extract file path references
  // Pattern: paths in markdown links, code blocks, etc.
  const filePathPattern = /(?:^|\s)([.\/][a-zA-Z0-9_\/-]+\.[a-zA-Z0-9]+)/gm;
  let match;

  while ((match = filePathPattern.exec(content)) !== null) {
    const filePath = match[1];
    const fullPath = path.resolve(basePath, filePath);

    if (!fs.existsSync(fullPath)) {
      warnings.push({
        type: 'file_not_found',
        message: `Referenced file not found: ${filePath}`,
        filePath,
        fullPath
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate all links in content
 */
function validateAllLinks(content, frameworkPath, projectPath, stackProfile = null, configPath = null) {
  const skillValidation = validateSkillReferences(content, frameworkPath, stackProfile, configPath);
  const fileValidation = validateFilePaths(content, projectPath);

  return {
    valid: skillValidation.valid && fileValidation.valid,
    errors: [...skillValidation.errors, ...fileValidation.errors],
    warnings: [...skillValidation.warnings, ...fileValidation.warnings],
    missingSkills: skillValidation.missingSkills,
    foundSkills: skillValidation.foundSkills,
    references: skillValidation.references
  };
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: validate-file-links.js <content-file> <framework-path> <project-path> [config-path]');
    console.error('Example: validate-file-links.js CLAUDE.md /path/to/framework /path/to/project ./config/skill-requirements.json');
    process.exit(1);
  }

  const [contentFile, frameworkPath, projectPath, configPath] = args;

  if (!fs.existsSync(contentFile)) {
    console.error(`Error: Content file not found: ${contentFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(contentFile, 'utf-8');
  const result = validateAllLinks(content, frameworkPath, projectPath, null, configPath);

  console.log('Validation result:');
  console.log('  Valid:', result.valid);
  console.log('  Errors:', result.errors.length);
  console.log('  Warnings:', result.warnings.length);
  console.log('  Missing skills:', result.missingSkills.length);
  console.log('  Found skills:', result.foundSkills.length);
  console.log('  References:', result.references.length);

  if (result.missingSkills.length > 0) {
    console.log('\nMissing skills:');
    result.missingSkills.forEach((skill, idx) => {
      console.log(`  ${idx + 1}. ${skill}`);
    });
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach((warn, idx) => {
      console.log(`  ${idx + 1}. ${warn.message}`);
    });
  }

  console.log('\n' + JSON.stringify(result, null, 2));

  process.exit(result.valid ? 0 : 1);
}

module.exports = {
  validateSkillReferences,
  validateFilePaths,
  validateAllLinks,
  extractSkillReferences,
  checkSkillExists,
  getRequiredSkillsForStack
};
