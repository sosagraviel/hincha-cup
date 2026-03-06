#!/usr/bin/env node

/**
 * Context-Aware Error Handling
 *
 * Analyzes errors and suggests fixes based on error patterns:
 * - Syntax errors (ESLint, TypeScript)
 * - Runtime errors (tests, execution)
 * - Build errors (webpack, vite, tsc)
 * - Dependency errors (version conflicts)
 *
 * Auto-applies safe fixes when possible, escalates complex errors with full context.
 *
 * Usage:
 *   const { handleError } = require('./error-handler');
 *
 *   try {
 *     execSync('npm run build');
 *   } catch (error) {
 *     const fix = await handleError(error, { operation: 'build', autoFix: true });
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Error patterns and their fixes
const ERROR_PATTERNS = {
  // TypeScript errors
  TS_MISSING_IMPORT: {
    pattern: /Cannot find name ['"](\w+)['"]/,
    category: 'typescript',
    severity: 'medium',
    autoFixable: true,
    suggestFix: (match) => ({
      type: 'missing_import',
      symbol: match[1],
      suggestion: `Add import for '${match[1]}'`,
      fix: `import { ${match[1]} } from '...'`
    })
  },

  TS_TYPE_ERROR: {
    pattern: /Type ['"](.+)['"] is not assignable to type ['"](.+)['"]/,
    category: 'typescript',
    severity: 'medium',
    autoFixable: false,
    suggestFix: (match) => ({
      type: 'type_mismatch',
      from: match[1],
      to: match[2],
      suggestion: `Type mismatch: expected '${match[2]}', got '${match[1]}'`,
      fix: `Add type cast or fix type definition`
    })
  },

  // ESLint errors
  ESLINT_ERROR: {
    pattern: /(\d+):(\d+)\s+error\s+(.+?)\s+([a-z-]+)$/m,
    category: 'lint',
    severity: 'low',
    autoFixable: true,
    suggestFix: (match) => ({
      type: 'lint_error',
      line: match[1],
      column: match[2],
      message: match[3],
      rule: match[4],
      suggestion: `ESLint error: ${match[3]}`,
      fix: `Run 'npm run lint:fix' or fix manually`
    })
  },

  // Build errors
  WEBPACK_ERROR: {
    pattern: /Module not found: Error: Can't resolve ['"](.+?)['"]/,
    category: 'build',
    severity: 'high',
    autoFixable: false,
    suggestFix: (match) => ({
      type: 'module_not_found',
      module: match[1],
      suggestion: `Module not found: '${match[1]}'`,
      fix: `Check import path or install missing dependency`
    })
  },

  VITE_ERROR: {
    pattern: /Failed to resolve import ['"](.+?)['"]/,
    category: 'build',
    severity: 'high',
    autoFixable: false,
    suggestFix: (match) => ({
      type: 'import_resolution_failed',
      importPath: match[1],
      suggestion: `Failed to resolve: '${match[1]}'`,
      fix: `Check import path or vite config`
    })
  },

  // Runtime errors
  REFERENCE_ERROR: {
    pattern: /ReferenceError: (\w+) is not defined/,
    category: 'runtime',
    severity: 'high',
    autoFixable: false,
    suggestFix: (match) => ({
      type: 'undefined_variable',
      variable: match[1],
      suggestion: `Variable '${match[1]}' is not defined`,
      fix: `Declare variable or import it`
    })
  },

  // Dependency errors
  PEER_DEPENDENCY: {
    pattern: /ERESOLVE unable to resolve dependency tree|peer dep missing: (.+?)@(.+?),/,
    category: 'dependency',
    severity: 'medium',
    autoFixable: true,
    suggestFix: (match) => ({
      type: 'peer_dependency',
      package: match[1],
      version: match[2],
      suggestion: `Peer dependency missing or incompatible`,
      fix: `Install with --legacy-peer-deps or fix version`
    })
  },

  VERSION_CONFLICT: {
    pattern: /npm ERR! Could not resolve dependency:\s+npm ERR! peer (.+?)@['"](.+?)['"]/,
    category: 'dependency',
    severity: 'medium',
    autoFixable: true,
    suggestFix: (match) => ({
      type: 'version_conflict',
      package: match[1],
      requiredVersion: match[2],
      suggestion: `Version conflict: ${match[1]}@${match[2]}`,
      fix: `Update ${match[1]} to ${match[2]} or use --legacy-peer-deps`
    })
  }
};

/**
 * Handle error with context-aware analysis and fixes
 *
 * @param {Error} error - Error object
 * @param {Object} options - Handling options
 * @param {string} options.operation - Operation that failed (build, test, lint, etc.)
 * @param {boolean} options.autoFix - Attempt auto-fix if possible (default: false)
 * @param {string} options.projectPath - Project root path
 * @param {string} options.ticketKey - Jira ticket key (for logging)
 * @returns {Promise<Object>} Error handling result
 */
async function handleError(error, options = {}) {
  const {
    operation = 'unknown',
    autoFix = false,
    projectPath = process.cwd(),
    ticketKey = null
  } = options;

  console.log(`\n🔍 Analyzing error from operation: ${operation}`);

  const errorText = extractErrorText(error);

  // Analyze error patterns
  const analysis = analyzeError(errorText, operation);

  // Generate context
  const context = await generateErrorContext(error, operation, projectPath);

  // Create error report
  const report = {
    timestamp: new Date().toISOString(),
    operation,
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code
    },
    analysis,
    context,
    fixAttempted: false,
    fixSuccessful: false,
    suggestions: []
  };

  // Generate suggestions
  report.suggestions = generateSuggestions(analysis, context);

  console.log(`\nError Analysis:`);
  console.log(`  Category: ${analysis.category}`);
  console.log(`  Severity: ${analysis.severity}`);
  console.log(`  Auto-fixable: ${analysis.autoFixable ? 'Yes' : 'No'}`);

  if (report.suggestions.length > 0) {
    console.log(`\nSuggested Fixes:`);
    report.suggestions.forEach((suggestion, index) => {
      console.log(`  ${index + 1}. ${suggestion.suggestion}`);
    });
  }

  // Attempt auto-fix if enabled and error is auto-fixable
  if (autoFix && analysis.autoFixable) {
    console.log(`\n🔧 Attempting auto-fix...`);

    try {
      const fixResult = await applyAutoFix(analysis, projectPath);
      report.fixAttempted = true;
      report.fixSuccessful = fixResult.success;
      report.fixDetails = fixResult;

      if (fixResult.success) {
        console.log(`✅ Auto-fix applied: ${fixResult.description}`);
      } else {
        console.log(`❌ Auto-fix failed: ${fixResult.error}`);
      }
    } catch (fixError) {
      report.fixAttempted = true;
      report.fixSuccessful = false;
      report.fixDetails = { success: false, error: fixError.message };
      console.log(`❌ Auto-fix error: ${fixError.message}`);
    }
  }

  // Save error report if ticket key provided
  if (ticketKey) {
    await saveErrorReport(report, ticketKey, projectPath);
  }

  return report;
}

/**
 * Extract error text from Error object
 */
function extractErrorText(error) {
  let text = '';

  if (error.stdout) text += error.stdout;
  if (error.stderr) text += '\n' + error.stderr;
  if (error.message) text += '\n' + error.message;
  if (error.stack) text += '\n' + error.stack;

  return text;
}

/**
 * Analyze error against known patterns
 */
function analyzeError(errorText, operation) {
  const analysis = {
    category: 'unknown',
    severity: 'medium',
    autoFixable: false,
    matches: []
  };

  // Check each error pattern
  for (const [patternName, patternConfig] of Object.entries(ERROR_PATTERNS)) {
    const match = errorText.match(patternConfig.pattern);

    if (match) {
      const suggestion = patternConfig.suggestFix(match);

      analysis.matches.push({
        pattern: patternName,
        ...suggestion
      });

      // Update analysis with first match
      if (analysis.category === 'unknown') {
        analysis.category = patternConfig.category;
        analysis.severity = patternConfig.severity;
        analysis.autoFixable = patternConfig.autoFixable;
      }
    }
  }

  return analysis;
}

/**
 * Generate error context (recent changes, affected files, etc.)
 */
async function generateErrorContext(error, operation, projectPath) {
  const context = {
    operation,
    workingDirectory: projectPath,
    recentChanges: [],
    affectedFiles: [],
    environment: {}
  };

  // Get recent git changes (if in git repo)
  try {
    const recentCommits = execSync('git log --oneline -5', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    context.recentChanges = recentCommits.split('\n').filter(Boolean);
  } catch (e) {
    // Not a git repo or git not available
  }

  // Extract file paths from error stack
  if (error.stack) {
    const fileMatches = error.stack.matchAll(/at .+ \((.+?):(\d+):(\d+)\)/g);
    for (const match of fileMatches) {
      context.affectedFiles.push({
        path: match[1],
        line: match[2],
        column: match[3]
      });
    }
  }

  // Get environment info
  context.environment = {
    nodeVersion: process.version,
    platform: process.platform,
    cwd: projectPath
  };

  return context;
}

/**
 * Generate fix suggestions based on analysis and context
 */
function generateSuggestions(analysis, context) {
  const suggestions = [];

  // Add suggestions from matched patterns
  analysis.matches.forEach(match => {
    suggestions.push({
      type: match.type,
      suggestion: match.suggestion,
      fix: match.fix,
      autoFixable: analysis.autoFixable
    });
  });

  // Add operation-specific suggestions
  if (context.operation === 'build') {
    suggestions.push({
      type: 'clean_build',
      suggestion: 'Try cleaning build artifacts',
      fix: 'rm -rf dist/ .next/ out/',
      autoFixable: true
    });
  }

  if (context.operation === 'test') {
    suggestions.push({
      type: 'clear_cache',
      suggestion: 'Clear test cache',
      fix: 'npm test -- --clearCache',
      autoFixable: true
    });
  }

  return suggestions;
}

/**
 * Apply auto-fix for known error patterns
 */
async function applyAutoFix(analysis, projectPath) {
  if (!analysis.autoFixable || analysis.matches.length === 0) {
    return { success: false, error: 'No auto-fixable errors found' };
  }

  const firstMatch = analysis.matches[0];

  try {
    switch (firstMatch.type) {
      case 'lint_error':
        return await fixLintErrors(projectPath);

      case 'peer_dependency':
      case 'version_conflict':
        return await fixDependencyConflict(projectPath);

      case 'clean_build':
        return await cleanBuildArtifacts(projectPath);

      case 'clear_cache':
        return await clearTestCache(projectPath);

      default:
        return {
          success: false,
          error: `No auto-fix available for type: ${firstMatch.type}`
        };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fix lint errors with eslint --fix
 */
async function fixLintErrors(projectPath) {
  try {
    execSync('npm run lint:fix 2>&1 || npx eslint . --fix', {
      cwd: projectPath,
      stdio: 'inherit'
    });

    return {
      success: true,
      description: 'Ran ESLint with --fix flag',
      command: 'eslint --fix'
    };
  } catch (error) {
    throw new Error(`ESLint fix failed: ${error.message}`);
  }
}

/**
 * Fix dependency conflicts
 */
async function fixDependencyConflict(projectPath) {
  // Detect package manager
  const packageManager = fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml')) ? 'pnpm' :
                        fs.existsSync(path.join(projectPath, 'yarn.lock')) ? 'yarn' : 'npm';

  try {
    if (packageManager === 'npm') {
      execSync('npm install --legacy-peer-deps', {
        cwd: projectPath,
        stdio: 'inherit'
      });
    } else if (packageManager === 'pnpm') {
      execSync('pnpm install --strict-peer-dependencies=false', {
        cwd: projectPath,
        stdio: 'inherit'
      });
    } else {
      execSync('yarn install', {
        cwd: projectPath,
        stdio: 'inherit'
      });
    }

    return {
      success: true,
      description: `Reinstalled dependencies with ${packageManager}`,
      command: `${packageManager} install`
    };
  } catch (error) {
    throw new Error(`Dependency install failed: ${error.message}`);
  }
}

/**
 * Clean build artifacts
 */
async function cleanBuildArtifacts(projectPath) {
  const dirsToClean = ['dist', '.next', 'out', 'build', '.cache'];

  const cleaned = [];
  for (const dir of dirsToClean) {
    const dirPath = path.join(projectPath, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      cleaned.push(dir);
    }
  }

  return {
    success: true,
    description: `Cleaned build artifacts: ${cleaned.join(', ')}`,
    cleaned
  };
}

/**
 * Clear test cache
 */
async function clearTestCache(projectPath) {
  try {
    // Try Jest cache clear
    execSync('npx jest --clearCache 2>&1 || true', {
      cwd: projectPath,
      stdio: 'inherit'
    });

    return {
      success: true,
      description: 'Cleared Jest test cache',
      command: 'jest --clearCache'
    };
  } catch (error) {
    throw new Error(`Cache clear failed: ${error.message}`);
  }
}

/**
 * Save error report
 */
async function saveErrorReport(report, ticketKey, projectPath) {
  const errorsDir = path.join(projectPath, '.claude', 'errors');
  fs.mkdirSync(errorsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(errorsDir, `${ticketKey}-${timestamp}.json`);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📝 Error report saved to: ${reportPath}`);
}

// Export
module.exports = {
  handleError,
  analyzeError,
  applyAutoFix,
  ERROR_PATTERNS
};

// CLI example
if (require.main === module) {
  const mockError = new Error('ESLint error');
  mockError.stdout = `
/path/to/file.ts
  45:12  error  'foo' is not defined  no-undef
  50:8   error  Missing semicolon     semi
`;

  handleError(mockError, {
    operation: 'lint',
    autoFix: true,
    ticketKey: 'TEST-ERROR'
  })
    .then(report => {
      console.log('\n✅ Error handling complete');
      console.log(`   Fix attempted: ${report.fixAttempted}`);
      console.log(`   Fix successful: ${report.fixSuccessful}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error handling failed:', error);
      process.exit(1);
    });
}
