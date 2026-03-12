#!/usr/bin/env node

/**
 * VALIDATE SYNTHESIS
 *
 * Validates Opus synthesizer output:
 * - Line count constraints (CLAUDE.md 30-250, project-context 50-600)
 * - Section marker validation
 * - Frontmatter validation
 * - Required sections present
 */

const fs = require('fs');
const path = require('path');

/**
 * Load validation rules from config
 */
function loadValidationRules(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.rules || {};
  } catch (error) {
    console.error('Warning: Could not load validation rules, using defaults');
    return {};
  }
}

/**
 * Count lines in content
 */
function countLines(content) {
  return content.split('\n').length;
}

/**
 * Extract frontmatter from content
 */
function extractFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    return { found: false, frontmatter: null, errors: ['Missing frontmatter start delimiter'] };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { found: false, frontmatter: null, errors: ['Missing frontmatter end delimiter'] };
  }

  const frontmatterLines = lines.slice(1, endIdx);
  const frontmatter = {};
  const errors = [];

  frontmatterLines.forEach((line, idx) => {
    if (line.trim() === '') return;

    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      frontmatter[key] = value;
    } else {
      errors.push(`Invalid frontmatter line ${idx + 2}: ${line}`);
    }
  });

  return { found: true, frontmatter, errors };
}

/**
 * Validate CLAUDE.md format
 */
function validateClaudeMd(content, rules) {
  const errors = [];
  const warnings = [];
  const lineCount = countLines(content);

  // Line count validation
  const lineRules = rules.claude_md?.line_count || { min: 30, max: 250, target: 120 };
  if (lineCount > lineRules.max) {
    errors.push({
      type: 'line_count_exceeded',
      message: `CLAUDE.md has ${lineCount} lines (max: ${lineRules.max})`,
      actual: lineCount,
      max: lineRules.max
    });
  }

  if (lineCount < lineRules.min) {
    warnings.push({
      type: 'line_count_below_min',
      message: `CLAUDE.md has ${lineCount} lines (min: ${lineRules.min})`,
      actual: lineCount,
      min: lineRules.min
    });
  }

  // Frontmatter validation (CLAUDE.md doesn't require frontmatter)
  // Only validate if frontmatter is present
  const frontmatterResult = extractFrontmatter(content);
  if (frontmatterResult.found && frontmatterResult.errors.length > 0) {
    warnings.push({
      type: 'frontmatter_invalid',
      message: 'CLAUDE.md has invalid frontmatter (frontmatter is optional)',
      details: frontmatterResult.errors
    });
  }

  // Required sections validation
  const requiredSections = rules.claude_md?.required_sections || [
    '# ',
    '## Tech Stack',
    '## File Placement Guide',
    '## Essential Commands'
  ];

  requiredSections.forEach(section => {
    if (!content.includes(section)) {
      errors.push({
        type: 'missing_required_section',
        message: `CLAUDE.md missing required section: ${section}`,
        section
      });
    }
  });

  // Forbidden patterns validation
  const forbiddenPatterns = rules.claude_md?.forbidden_patterns || [];
  forbiddenPatterns.forEach(pattern => {
    const regex = new RegExp(pattern.pattern);
    if (regex.test(content)) {
      errors.push({
        type: 'forbidden_pattern',
        message: pattern.message || `Forbidden pattern found: ${pattern.pattern}`,
        pattern: pattern.pattern
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    lineCount,
    frontmatter: frontmatterResult.frontmatter
  };
}

/**
 * Validate project-context format
 */
function validateProjectContext(content, rules) {
  const errors = [];
  const warnings = [];
  const lineCount = countLines(content);

  // Line count validation
  const lineRules = rules.project_context?.line_count || { min: 50, max: 600, target: 300 };

  if (lineCount > lineRules.max) {
    errors.push({
      type: 'line_count_exceeded',
      message: `project-context has ${lineCount} lines (max: ${lineRules.max})`,
      actual: lineCount,
      max: lineRules.max
    });
  }

  if (lineCount < lineRules.min) {
    errors.push({
      type: 'line_count_below_min',
      message: `project-context has ${lineCount} lines (min: ${lineRules.min})`,
      actual: lineCount,
      min: lineRules.min
    });
  }

  // Frontmatter validation
  const frontmatterResult = extractFrontmatter(content);
  if (!frontmatterResult.found) {
    errors.push({
      type: 'frontmatter_missing',
      message: 'project-context missing frontmatter',
      details: frontmatterResult.errors
    });
  }

  if (frontmatterResult.errors.length > 0) {
    errors.push({
      type: 'frontmatter_invalid',
      message: 'project-context has invalid frontmatter',
      details: frontmatterResult.errors
    });
  }

  // Validate required frontmatter fields
  if (frontmatterResult.found && frontmatterResult.frontmatter) {
    const requiredFields = rules.project_context?.frontmatter?.required_fields || ['name', 'description'];
    requiredFields.forEach(field => {
      if (!frontmatterResult.frontmatter[field]) {
        errors.push({
          type: 'frontmatter_missing_field',
          message: `project-context frontmatter missing required field: ${field}`,
          field
        });
      }
    });

    // Validate name field value if specified
    const expectedName = rules.project_context?.frontmatter?.name_value;
    if (expectedName && frontmatterResult.frontmatter.name !== expectedName) {
      errors.push({
        type: 'frontmatter_invalid_name',
        message: `project-context frontmatter name should be "${expectedName}", got "${frontmatterResult.frontmatter.name}"`,
        expected: expectedName,
        actual: frontmatterResult.frontmatter.name
      });
    }
  }

  // Required sections
  const requiredSections = rules.project_context?.required_sections || [
    '# ',
    '## Purpose',
    '## Architecture',
    '## Tech Stack'
  ];

  requiredSections.forEach(section => {
    if (!content.includes(section)) {
      errors.push({
        type: 'missing_required_section',
        message: `project-context missing required section: ${section}`,
        section
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    lineCount,
    frontmatter: frontmatterResult.frontmatter
  };
}

/**
 * Validate synthesis output with section markers
 * Supports both HTML comment markers and markdown header formats
 */
function validateSynthesisOutput(content, configPath) {
  const rules = loadValidationRules(configPath);
  const errors = [];
  const warnings = [];

  // Check for section markers - support both formats
  // Format 1: HTML comments (old format)
  const claudeMdMarkerHTML = '<!-- SECTION: CLAUDE.MD -->';
  const projectContextMarkerHTML = '<!-- SECTION: PROJECT-CONTEXT -->';

  // Format 2: Markdown headers (current format)
  const claudeMdMarkerMD = '# CLAUDE.md Content';
  const projectContextMarkerMD = '# project-context/SKILL.md Content';

  let claudeMdIdx = -1;
  let projectContextIdx = -1;
  let markerLength = 0;
  let usingHTMLFormat = false;

  // Detect which format is used
  if (content.includes(claudeMdMarkerHTML)) {
    claudeMdIdx = content.indexOf(claudeMdMarkerHTML);
    projectContextIdx = content.indexOf(projectContextMarkerHTML);
    markerLength = claudeMdMarkerHTML.length;
    usingHTMLFormat = true;
  } else if (content.includes(claudeMdMarkerMD)) {
    claudeMdIdx = content.indexOf(claudeMdMarkerMD);
    projectContextIdx = content.indexOf(projectContextMarkerMD);
    markerLength = claudeMdMarkerMD.length;
  }

  if (claudeMdIdx === -1) {
    errors.push({
      type: 'missing_section_marker',
      message: 'Missing CLAUDE.MD section marker (expected "# CLAUDE.md Content" or "<!-- SECTION: CLAUDE.MD -->")',
      marker: claudeMdMarkerMD
    });
  }

  if (projectContextIdx === -1) {
    errors.push({
      type: 'missing_section_marker',
      message: 'Missing PROJECT-CONTEXT section marker (expected "# project-context/SKILL.md Content" or "<!-- SECTION: PROJECT-CONTEXT -->")',
      marker: projectContextMarkerMD
    });
  }

  // Extract sections
  let claudeMdContent = '';
  let projectContextContent = '';

  if (claudeMdIdx !== -1 && projectContextIdx !== -1) {
    // Skip the marker line and extract content
    const claudeStartIdx = claudeMdIdx + markerLength;
    const claudeEndIdx = projectContextIdx;

    claudeMdContent = content.substring(claudeStartIdx, claudeEndIdx).trim();

    // For project-context, skip its marker and take rest of content
    const contextStartIdx = projectContextIdx + (usingHTMLFormat ? projectContextMarkerHTML.length : projectContextMarkerMD.length);
    projectContextContent = content.substring(contextStartIdx).trim();
  }

  // Validate each section
  let claudeMdResult = { valid: false, errors: [], warnings: [], lineCount: 0 };
  let projectContextResult = { valid: false, errors: [], warnings: [], lineCount: 0 };

  if (claudeMdContent) {
    claudeMdResult = validateClaudeMd(claudeMdContent, rules);
  } else {
    errors.push({
      type: 'empty_section',
      message: 'CLAUDE.MD section is empty'
    });
  }

  if (projectContextContent) {
    projectContextResult = validateProjectContext(projectContextContent, rules);
  } else {
    errors.push({
      type: 'empty_section',
      message: 'PROJECT-CONTEXT section is empty'
    });
  }

  // Combine results
  return {
    valid: errors.length === 0 && claudeMdResult.valid && projectContextResult.valid,
    errors: [
      ...errors,
      ...claudeMdResult.errors.map(e => ({ ...e, section: 'CLAUDE.MD' })),
      ...projectContextResult.errors.map(e => ({ ...e, section: 'PROJECT-CONTEXT' }))
    ],
    warnings: [
      ...warnings,
      ...claudeMdResult.warnings.map(w => ({ ...w, section: 'CLAUDE.MD' })),
      ...projectContextResult.warnings.map(w => ({ ...w, section: 'PROJECT-CONTEXT' }))
    ],
    sections: {
      claudeMd: claudeMdResult,
      projectContext: projectContextResult
    }
  };
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: validate-synthesis.js <file> <config-path> [mode]');
    console.error('Modes:');
    console.error('  (default)             - Validate full synthesis output with section markers');
    console.error('  claude-md-only        - Validate only CLAUDE.md content');
    console.error('  project-context-only  - Validate only project-context content');
    console.error('Example: validate-synthesis.js synthesis.md ./config/validation-rules.json');
    console.error('Example: validate-synthesis.js CLAUDE.md ./config/validation-rules.json claude-md-only');
    process.exit(1);
  }

  const [filePath, configPath, mode] = args;

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const rules = loadValidationRules(configPath);
  let result;

  if (mode === 'claude-md-only') {
    result = validateClaudeMd(content, rules);
    console.log('CLAUDE.MD Validation:');
    console.log('  Valid:', result.valid);
    console.log('  Lines:', result.lineCount);
    console.log('  Errors:', result.errors.length);
    console.log('  Warnings:', result.warnings.length);
  } else if (mode === 'project-context-only') {
    result = validateProjectContext(content, rules);
    console.log('PROJECT-CONTEXT Validation:');
    console.log('  Valid:', result.valid);
    console.log('  Lines:', result.lineCount);
    console.log('  Errors:', result.errors.length);
    console.log('  Warnings:', result.warnings.length);
  } else {
    result = validateSynthesisOutput(content, configPath);
    console.log('Validation result:');
    console.log('  Valid:', result.valid);
    console.log('  Errors:', result.errors.length);
    console.log('  Warnings:', result.warnings.length);

    if (result.sections.claudeMd) {
      console.log('\nCLAUDE.MD:');
      console.log('  Lines:', result.sections.claudeMd.lineCount);
      console.log('  Valid:', result.sections.claudeMd.valid);
    }

    if (result.sections.projectContext) {
      console.log('\nPROJECT-CONTEXT:');
      console.log('  Lines:', result.sections.projectContext.lineCount);
      console.log('  Valid:', result.sections.projectContext.valid);
    }
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. [${err.section || 'GLOBAL'}] ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach((warn, idx) => {
      console.log(`  ${idx + 1}. [${warn.section || 'GLOBAL'}] ${warn.message}`);
    });
  }

  console.log('\n' + JSON.stringify(result, null, 2));

  process.exit(result.valid ? 0 : 1);
}

module.exports = {
  validateSynthesisOutput,
  validateClaudeMd,
  validateProjectContext,
  countLines,
  extractFrontmatter
};
