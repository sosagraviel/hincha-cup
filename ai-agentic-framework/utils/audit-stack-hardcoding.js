#!/usr/bin/env node

/**
 * Stack Hardcoding Audit Utility
 *
 * Scans all skills and agent templates for hardcoded stack/language/framework names
 * that should be replaced with template variables for true stack-agnosticism.
 *
 * Usage:
 *   node utils/audit-stack-hardcoding.js
 *   node utils/audit-stack-hardcoding.js --fix (auto-fix where possible)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Configuration
const AI_STORE_ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(AI_STORE_ROOT, 'skills');
const AGENTS_DIR = path.join(AI_STORE_ROOT, 'agents/templates');
const OUTPUT_FILE = path.join(AI_STORE_ROOT, 'docs/stack-audit-report.md');

// Hardcoded patterns to detect (case-insensitive)
const HARDCODED_PATTERNS = {
  languages: [
    'typescript',
    'javascript',
    'python',
    'java',
    'golang',
    'go lang',
    'ruby',
    'rust',
    'php',
    'c\\+\\+',
    'csharp',
    'c#'
  ],
  frameworks: [
    'react',
    'vue',
    'angular',
    'nextjs',
    'next\\.js',
    'express',
    'fastapi',
    'django',
    'flask',
    'nestjs',
    'spring boot',
    'rails',
    'laravel'
  ],
  testFrameworks: [
    'jest',
    'mocha',
    'pytest',
    'junit',
    'rspec',
    'vitest',
    'cypress',
    'playwright'
  ]
};

// Allowed patterns (these are OK to keep)
const ALLOWED_PATTERNS = [
  /mastering-typescript/,  // Skill names are OK
  /mastering-python/,      // Skill names are OK
  /mastering-react/,       // Skill names are OK
  /\{\{stack\}\}/,         // Template variables are OK
  /\{\{framework\}\}/,     // Template variables are OK
  /\{\{language\}\}/,      // Template variables are OK
  /package\.json/,         // File names are OK
  /pyproject\.toml/,       // File names are OK
  /tsconfig\.json/,        // File names are OK
  /\.ts$/,                 // File extensions are OK
  /\.py$/,                 // File extensions are OK
  /\.js$/,                 // File extensions are OK
];

// Results storage
const results = {
  filesScanned: 0,
  filesWithIssues: 0,
  totalIssues: 0,
  issues: []
};

/**
 * Check if a line should be ignored based on allowed patterns
 */
function shouldIgnore(line) {
  return ALLOWED_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Scan a file for hardcoded stack references
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileIssues = [];

  lines.forEach((line, lineNumber) => {
    // Skip if line matches allowed patterns
    if (shouldIgnore(line)) {
      return;
    }

    // Check for hardcoded languages
    HARDCODED_PATTERNS.languages.forEach(lang => {
      const regex = new RegExp(`\\b${lang}\\b`, 'i');
      if (regex.test(line)) {
        fileIssues.push({
          line: lineNumber + 1,
          type: 'language',
          pattern: lang,
          content: line.trim(),
          suggestion: 'Replace with {{stack}} or {{language}} variable'
        });
      }
    });

    // Check for hardcoded frameworks
    HARDCODED_PATTERNS.frameworks.forEach(framework => {
      const regex = new RegExp(`\\b${framework}\\b`, 'i');
      if (regex.test(line)) {
        fileIssues.push({
          line: lineNumber + 1,
          type: 'framework',
          pattern: framework,
          content: line.trim(),
          suggestion: 'Replace with {{framework}} variable'
        });
      }
    });

    // Check for hardcoded test frameworks
    HARDCODED_PATTERNS.testFrameworks.forEach(test => {
      const regex = new RegExp(`\\b${test}\\b`, 'i');
      if (regex.test(line)) {
        fileIssues.push({
          line: lineNumber + 1,
          type: 'test_framework',
          pattern: test,
          content: line.trim(),
          suggestion: 'Replace with {{test_framework}} variable'
        });
      }
    });
  });

  if (fileIssues.length > 0) {
    results.filesWithIssues++;
    results.totalIssues += fileIssues.length;
    results.issues.push({
      file: path.relative(AI_STORE_ROOT, filePath),
      issues: fileIssues
    });
  }

  results.filesScanned++;
}

/**
 * Recursively scan directory
 */
function scanDirectory(dir, extensions = ['.md', '.js', '.ts']) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Directory not found: ${dir}`);
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath, extensions);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        scanFile(fullPath);
      }
    }
  });
}

/**
 * Generate markdown report
 */
function generateReport() {
  let report = `# Stack Hardcoding Audit Report

**Generated:** ${new Date().toISOString()}
**AI-Store Root:** ${AI_STORE_ROOT}

---

## Summary

| Metric | Count |
|--------|-------|
| Files Scanned | ${results.filesScanned} |
| Files with Issues | ${results.filesWithIssues} |
| Total Issues | ${results.totalIssues} |
| Pass Rate | ${((1 - results.filesWithIssues / results.filesScanned) * 100).toFixed(1)}% |

---

`;

  if (results.totalIssues === 0) {
    report += `## ✅ No Issues Found

All scanned files are stack-agnostic! No hardcoded stack/language/framework names detected.
`;
  } else {
    report += `## ⚠️ Issues Found

The following files contain hardcoded stack references that should be replaced with template variables:

---

`;

    results.issues.forEach(fileIssue => {
      report += `### \`${fileIssue.file}\`

**Issues:** ${fileIssue.issues.length}

`;

      // Group by type
      const byType = {
        language: [],
        framework: [],
        test_framework: []
      };

      fileIssue.issues.forEach(issue => {
        byType[issue.type].push(issue);
      });

      // Report languages
      if (byType.language.length > 0) {
        report += `#### Languages (${byType.language.length})\n\n`;
        byType.language.forEach(issue => {
          report += `- **Line ${issue.line}:** \`${issue.pattern}\`\n`;
          report += `  \`\`\`\n  ${issue.content}\n  \`\`\`\n`;
          report += `  💡 ${issue.suggestion}\n\n`;
        });
      }

      // Report frameworks
      if (byType.framework.length > 0) {
        report += `#### Frameworks (${byType.framework.length})\n\n`;
        byType.framework.forEach(issue => {
          report += `- **Line ${issue.line}:** \`${issue.pattern}\`\n`;
          report += `  \`\`\`\n  ${issue.content}\n  \`\`\`\n`;
          report += `  💡 ${issue.suggestion}\n\n`;
        });
      }

      // Report test frameworks
      if (byType.test_framework.length > 0) {
        report += `#### Test Frameworks (${byType.test_framework.length})\n\n`;
        byType.test_framework.forEach(issue => {
          report += `- **Line ${issue.line}:** \`${issue.pattern}\`\n`;
          report += `  \`\`\`\n  ${issue.content}\n  \`\`\`\n`;
          report += `  💡 ${issue.suggestion}\n\n`;
        });
      }

      report += `---\n\n`;
    });
  }

  report += `## Recommendations

### Template Variables to Use

| Variable | Use For | Example |
|----------|---------|---------|
| \`{{stack}}\` | Primary language (TypeScript, Python, Go, etc.) | \`mastering-{{stack}}\` |
| \`{{language}}\` | Alternate for language name | \`{{language}} developer\` |
| \`{{framework}}\` | Framework name (React, Django, NestJS, etc.) | \`mastering-{{framework}}\` |
| \`{{test_framework}}\` | Testing library (Jest, Pytest, JUnit, etc.) | \`Run {{test_framework}} tests\` |
| \`{{lint_command}}\` | Linting command | \`{{lint_command}}\` |
| \`{{type_check_command}}\` | Type checking command | \`{{type_check_command}}\` |

### Where Variables Are Populated

Variables are populated by \`utils/stack-detection.js\` during:
1. \`initialize-project\` - Initial project setup
2. Agent template instantiation - When spawning implementer/tester agents

### Exemptions

The following are allowed and will not trigger warnings:
- Skill folder names (e.g., \`mastering-typescript/\`)
- File names (e.g., \`package.json\`, \`tsconfig.json\`)
- File extensions (e.g., \`.ts\`, \`.py\`, \`.js\`)
- Template variable references (e.g., \`{{stack}}\`, \`{{framework}}\`)

---

## Next Steps

1. **Review flagged files** and determine which need refactoring
2. **Replace hardcoded values** with appropriate template variables
3. **Update agent templates** to use variable substitution
4. **Re-run audit** to verify fixes
5. **Update documentation** to reflect stack-agnostic approach

---

**Audit completed successfully.**
`;

  return report;
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Stack Hardcoding Audit');
  console.log('========================\n');

  console.log(`📁 Scanning: ${SKILLS_DIR}`);
  scanDirectory(SKILLS_DIR);

  console.log(`📁 Scanning: ${AGENTS_DIR}`);
  scanDirectory(AGENTS_DIR);

  console.log('\n📊 Generating report...');
  const report = generateReport();

  // Ensure docs directory exists
  const docsDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Write report
  fs.writeFileSync(OUTPUT_FILE, report, 'utf-8');

  console.log(`\n✅ Report saved: ${OUTPUT_FILE}`);
  console.log('\nSummary:');
  console.log(`  Files scanned: ${results.filesScanned}`);
  console.log(`  Files with issues: ${results.filesWithIssues}`);
  console.log(`  Total issues: ${results.totalIssues}`);

  if (results.totalIssues > 0) {
    console.log(`\n⚠️  ${results.totalIssues} issues found. Review ${OUTPUT_FILE} for details.`);
    process.exit(1);
  } else {
    console.log('\n✅ No issues found! All files are stack-agnostic.');
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { scanFile, scanDirectory, generateReport };
