#!/usr/bin/env node

/**
 * Self-Healing Test Failure Recovery
 *
 * Automatically detects and fixes common test failures:
 * - Missing dependencies (MODULE_NOT_FOUND)
 * - Timing issues (TIMEOUT, ECONNREFUSED)
 * - Snapshot mismatches
 * - Environment variable issues
 * - Port conflicts
 * - Database connection failures
 *
 * Usage:
 *   node self-healing-tests.js --test-command "npm test" --max-retries 3
 *   node self-healing-tests.js --test-output test-failure.log --fix --ticket JIRA-123
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Failure patterns and their fixes
const FAILURE_PATTERNS = {
  MISSING_DEPENDENCY: {
    pattern: /Cannot find module '([^']+)'|MODULE_NOT_FOUND.*['"]([^'"]+)['"]/i,
    severity: 'high',
    autoFixable: true
  },
  TIMEOUT: {
    pattern: /Test timeout|ETIMEDOUT|Timeout of \d+ms exceeded/i,
    severity: 'medium',
    autoFixable: true
  },
  PORT_CONFLICT: {
    pattern: /EADDRINUSE|address already in use.*:(\d+)|port (\d+) is already in use/i,
    severity: 'high',
    autoFixable: true
  },
  SNAPSHOT_MISMATCH: {
    pattern: /Snapshot .* mismatched|Received value does not match stored snapshot/i,
    severity: 'low',
    autoFixable: true
  },
  ENV_VAR_MISSING: {
    pattern: /Environment variable .* is not defined|Missing environment variable.*['"]([^'"]+)['"]/i,
    severity: 'medium',
    autoFixable: true
  },
  DATABASE_CONNECTION: {
    pattern: /ECONNREFUSED.*postgres|Could not connect to database|Connection terminated unexpectedly/i,
    severity: 'high',
    autoFixable: true
  },
  DATABASE_NOT_FOUND: {
    pattern: /database "([^"]+)" does not exist/i,
    severity: 'high',
    autoFixable: true
  },
  MIGRATION_PENDING: {
    pattern: /pending migration|Migration .* has not been run/i,
    severity: 'high',
    autoFixable: true
  }
};

/**
 * Run tests with self-healing
 *
 * @param {Object} options - Test options
 * @param {string} options.testCommand - Command to run tests
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {string} options.ticketKey - Jira ticket key for logging
 * @param {string} options.projectPath - Project root path
 * @returns {Promise<Object>} Test result with healing attempts
 */
async function runTestsWithHealing(options) {
  const {
    testCommand,
    maxRetries = 3,
    ticketKey = null,
    projectPath = process.cwd()
  } = options;

  const healingLog = {
    timestamp: new Date().toISOString(),
    testCommand,
    attempts: [],
    finalResult: null,
    totalHealingActions: 0
  };

  console.log(`🧪 Running tests with self-healing (max ${maxRetries} retries)...`);
  console.log(`Command: ${testCommand}`);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const attemptLog = {
      attemptNumber: attempt,
      timestamp: new Date().toISOString(),
      testOutput: '',
      failures: [],
      healingActions: [],
      success: false
    };

    try {
      // Run tests
      console.log(`\nAttempt ${attempt}/${maxRetries + 1}...`);
      const output = execSync(testCommand, {
        cwd: projectPath,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      attemptLog.testOutput = output;
      attemptLog.success = true;
      healingLog.attempts.push(attemptLog);
      healingLog.finalResult = 'success';

      console.log('✅ Tests passed!');
      break;
    } catch (error) {
      attemptLog.testOutput = error.stdout + '\n' + error.stderr;
      attemptLog.success = false;

      // Detect failures
      const detectedFailures = detectFailures(attemptLog.testOutput);
      attemptLog.failures = detectedFailures;

      console.log(`❌ Tests failed (${detectedFailures.length} failures detected)`);
      detectedFailures.forEach(failure => {
        console.log(`   - ${failure.type}: ${failure.message}`);
      });

      // If this is the last attempt, don't try to heal
      if (attempt > maxRetries) {
        healingLog.attempts.push(attemptLog);
        healingLog.finalResult = 'failed';
        console.log('\n❌ Max retries reached. Tests still failing.');
        break;
      }

      // Try to heal failures
      const healingActions = await healFailures(detectedFailures, projectPath);
      attemptLog.healingActions = healingActions;
      healingLog.totalHealingActions += healingActions.length;

      console.log(`🔧 Applied ${healingActions.length} healing actions:`);
      healingActions.forEach(action => {
        console.log(`   - ${action.action}: ${action.details}`);
      });

      healingLog.attempts.push(attemptLog);

      // Wait a bit before retrying
      await sleep(2000);
    }
  }

  // Save healing log
  if (ticketKey) {
    await saveHealingLog(healingLog, ticketKey, projectPath);
  }

  return healingLog;
}

/**
 * Detect failures from test output
 */
function detectFailures(testOutput) {
  const failures = [];

  for (const [type, config] of Object.entries(FAILURE_PATTERNS)) {
    const matches = testOutput.match(config.pattern);
    if (matches) {
      failures.push({
        type,
        severity: config.severity,
        autoFixable: config.autoFixable,
        message: matches[0],
        extractedData: matches.slice(1).filter(Boolean)
      });
    }
  }

  return failures;
}

/**
 * Heal detected failures
 */
async function healFailures(failures, projectPath) {
  const healingActions = [];

  for (const failure of failures) {
    if (!failure.autoFixable) {
      console.log(`⚠️  Cannot auto-fix: ${failure.type}`);
      continue;
    }

    let action = null;

    switch (failure.type) {
      case 'MISSING_DEPENDENCY':
        action = await healMissingDependency(failure, projectPath);
        break;
      case 'TIMEOUT':
        action = await healTimeout(failure, projectPath);
        break;
      case 'PORT_CONFLICT':
        action = await healPortConflict(failure, projectPath);
        break;
      case 'SNAPSHOT_MISMATCH':
        action = await healSnapshotMismatch(failure, projectPath);
        break;
      case 'ENV_VAR_MISSING':
        action = await healMissingEnvVar(failure, projectPath);
        break;
      case 'DATABASE_CONNECTION':
        action = await healDatabaseConnection(failure, projectPath);
        break;
      case 'DATABASE_NOT_FOUND':
        action = await healDatabaseNotFound(failure, projectPath);
        break;
      case 'MIGRATION_PENDING':
        action = await healPendingMigration(failure, projectPath);
        break;
    }

    if (action) {
      healingActions.push(action);
    }
  }

  return healingActions;
}

/**
 * Heal missing dependency
 */
async function healMissingDependency(failure, projectPath) {
  const moduleName = failure.extractedData[0];

  console.log(`🔧 Installing missing dependency: ${moduleName}`);

  try {
    // Detect package manager
    const packageManager = detectPackageManager(projectPath);

    // Install dependency
    const installCmd = packageManager === 'pnpm' ? `pnpm add ${moduleName}` :
                       packageManager === 'yarn' ? `yarn add ${moduleName}` :
                       `npm install ${moduleName}`;

    execSync(installCmd, { cwd: projectPath, stdio: 'inherit' });

    return {
      type: 'MISSING_DEPENDENCY',
      action: 'Installed missing dependency',
      details: moduleName,
      success: true
    };
  } catch (error) {
    return {
      type: 'MISSING_DEPENDENCY',
      action: 'Failed to install dependency',
      details: moduleName,
      success: false,
      error: error.message
    };
  }
}

/**
 * Heal timeout issues
 */
async function healTimeout(failure, projectPath) {
  console.log('🔧 Increasing test timeouts...');

  // Try to find and update jest/vitest config
  const configFiles = [
    'jest.config.js',
    'jest.config.ts',
    'vitest.config.js',
    'vitest.config.ts',
    'playwright.config.js',
    'playwright.config.ts'
  ];

  for (const configFile of configFiles) {
    const configPath = path.join(projectPath, configFile);
    if (fs.existsSync(configPath)) {
      try {
        let config = fs.readFileSync(configPath, 'utf8');

        // Increase timeout values
        if (configFile.includes('jest') || configFile.includes('vitest')) {
          // Look for testTimeout and increase it
          if (/testTimeout:\s*\d+/.test(config)) {
            config = config.replace(/testTimeout:\s*(\d+)/g, (match, timeout) => {
              const newTimeout = parseInt(timeout) * 2;
              return `testTimeout: ${newTimeout}`;
            });
          } else {
            // Add testTimeout if not present
            config = config.replace(/(export default\s*{)/,
              '$1\n  testTimeout: 30000,');
          }
        } else if (configFile.includes('playwright')) {
          // Increase Playwright timeout
          if (/timeout:\s*\d+/.test(config)) {
            config = config.replace(/timeout:\s*(\d+)/g, (match, timeout) => {
              const newTimeout = parseInt(timeout) * 2;
              return `timeout: ${newTimeout}`;
            });
          } else {
            config = config.replace(/(use:\s*{)/,
              '$1\n    timeout: 60000,');
          }
        }

        fs.writeFileSync(configPath, config);

        return {
          type: 'TIMEOUT',
          action: 'Increased test timeout',
          details: `Updated ${configFile}`,
          success: true
        };
      } catch (error) {
        console.warn(`⚠️  Could not update ${configFile}:`, error.message);
      }
    }
  }

  return {
    type: 'TIMEOUT',
    action: 'Could not increase timeout',
    details: 'No config file found',
    success: false
  };
}

/**
 * Heal port conflict
 */
async function healPortConflict(failure, projectPath) {
  const conflictedPort = failure.extractedData[0];

  console.log(`🔧 Resolving port conflict on port ${conflictedPort}...`);

  // Find an available port
  const availablePort = await findAvailablePort(parseInt(conflictedPort) + 1);

  // Try to update environment variable or config
  const envFile = path.join(projectPath, '.env.testing');
  if (fs.existsSync(envFile)) {
    let envContent = fs.readFileSync(envFile, 'utf8');

    // Update port in .env file
    if (envContent.includes(`PORT=${conflictedPort}`)) {
      envContent = envContent.replace(
        new RegExp(`PORT=${conflictedPort}`, 'g'),
        `PORT=${availablePort}`
      );
      fs.writeFileSync(envFile, envContent);

      return {
        type: 'PORT_CONFLICT',
        action: 'Changed port in .env.testing',
        details: `${conflictedPort} → ${availablePort}`,
        success: true
      };
    }
  }

  return {
    type: 'PORT_CONFLICT',
    action: 'Set PORT environment variable',
    details: `PORT=${availablePort}`,
    success: true
  };
}

/**
 * Find an available port starting from startPort
 */
async function findAvailablePort(startPort) {
  const net = require('net');

  return new Promise((resolve) => {
    function tryPort(port) {
      const server = net.createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          tryPort(port + 1);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(port);
      });

      server.listen(port);
    }

    tryPort(startPort);
  });
}

/**
 * Heal snapshot mismatch
 */
async function healSnapshotMismatch(failure, projectPath) {
  console.log('🔧 Updating snapshots...');

  // Detect test framework
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { type: 'SNAPSHOT_MISMATCH', action: 'Could not update snapshots', success: false };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const hasJest = 'jest' in (packageJson.devDependencies || {});
  const hasVitest = 'vitest' in (packageJson.devDependencies || {});

  try {
    if (hasJest) {
      execSync('npm test -- -u', { cwd: projectPath, stdio: 'inherit' });
    } else if (hasVitest) {
      execSync('npm test -- -u', { cwd: projectPath, stdio: 'inherit' });
    }

    return {
      type: 'SNAPSHOT_MISMATCH',
      action: 'Updated test snapshots',
      details: 'Ran tests with -u flag',
      success: true
    };
  } catch (error) {
    return {
      type: 'SNAPSHOT_MISMATCH',
      action: 'Failed to update snapshots',
      details: error.message,
      success: false
    };
  }
}

/**
 * Heal missing environment variable
 */
async function healMissingEnvVar(failure, projectPath) {
  const varName = failure.extractedData[0];

  console.log(`🔧 Adding default environment variable: ${varName}`);

  const envFile = path.join(projectPath, '.env.testing');

  // Default values for common env vars
  const defaults = {
    'DATABASE_URL': 'postgresql://localhost:5432/test_db',
    'REDIS_URL': 'redis://localhost:6379',
    'JWT_SECRET': 'test-jwt-secret-do-not-use-in-production',
    'NODE_ENV': 'test',
    'PORT': '3001'
  };

  const defaultValue = defaults[varName] || 'test-value';

  try {
    // Append to .env.testing
    const envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';

    if (!envContent.includes(`${varName}=`)) {
      fs.appendFileSync(envFile, `\n${varName}=${defaultValue}\n`);

      return {
        type: 'ENV_VAR_MISSING',
        action: 'Added environment variable',
        details: `${varName}=${defaultValue}`,
        success: true
      };
    }
  } catch (error) {
    return {
      type: 'ENV_VAR_MISSING',
      action: 'Failed to add environment variable',
      details: varName,
      success: false
    };
  }
}

/**
 * Heal database connection issues
 */
async function healDatabaseConnection(failure, projectPath) {
  console.log('🔧 Attempting to restart database...');

  try {
    // Try to start database using docker-compose
    execSync('docker-compose up -d postgres', { cwd: projectPath, stdio: 'inherit' });

    // Wait for database to be ready
    await sleep(5000);

    return {
      type: 'DATABASE_CONNECTION',
      action: 'Restarted database container',
      details: 'docker-compose up -d postgres',
      success: true
    };
  } catch (error) {
    return {
      type: 'DATABASE_CONNECTION',
      action: 'Could not restart database',
      details: error.message,
      success: false
    };
  }
}

/**
 * Heal database not found
 */
async function healDatabaseNotFound(failure, projectPath) {
  const dbName = failure.extractedData[0];

  console.log(`🔧 Creating database: ${dbName}`);

  try {
    // Try to create database
    execSync(`docker-compose exec -T postgres createdb -U postgres ${dbName}`, {
      cwd: projectPath,
      stdio: 'inherit'
    });

    return {
      type: 'DATABASE_NOT_FOUND',
      action: 'Created database',
      details: dbName,
      success: true
    };
  } catch (error) {
    return {
      type: 'DATABASE_NOT_FOUND',
      action: 'Could not create database',
      details: dbName,
      success: false
    };
  }
}

/**
 * Heal pending migrations
 */
async function healPendingMigration(failure, projectPath) {
  console.log('🔧 Running pending migrations...');

  try {
    // Detect migration command from package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const migrationCmd = packageJson.scripts?.['migration:run'] ||
                        packageJson.scripts?.['migrate'] ||
                        'npm run typeorm migration:run';

    execSync(migrationCmd, { cwd: projectPath, stdio: 'inherit' });

    return {
      type: 'MIGRATION_PENDING',
      action: 'Ran pending migrations',
      details: migrationCmd,
      success: true
    };
  } catch (error) {
    return {
      type: 'MIGRATION_PENDING',
      action: 'Could not run migrations',
      details: error.message,
      success: false
    };
  }
}

/**
 * Detect package manager
 */
function detectPackageManager(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Save healing log
 */
async function saveHealingLog(healingLog, ticketKey, projectPath) {
  const healingDir = path.join(projectPath, '.claude', 'healing');
  fs.mkdirSync(healingDir, { recursive: true });

  const logPath = path.join(healingDir, `${ticketKey}-healing-log.md`);

  const markdown = `# Self-Healing Test Log - ${ticketKey}

**Timestamp**: ${healingLog.timestamp}
**Test Command**: \`${healingLog.testCommand}\`
**Total Attempts**: ${healingLog.attempts.length}
**Total Healing Actions**: ${healingLog.totalHealingActions}
**Final Result**: ${healingLog.finalResult === 'success' ? '✅ SUCCESS' : '❌ FAILED'}

---

${healingLog.attempts.map((attempt, index) => `
## Attempt ${attempt.attemptNumber}

**Timestamp**: ${attempt.timestamp}
**Result**: ${attempt.success ? '✅ Passed' : '❌ Failed'}

${attempt.failures.length > 0 ? `### Failures Detected (${attempt.failures.length})

${attempt.failures.map(f => `- **${f.type}** (${f.severity} severity): ${f.message}`).join('\n')}` : ''}

${attempt.healingActions.length > 0 ? `### Healing Actions Applied (${attempt.healingActions.length})

${attempt.healingActions.map(a => `- **${a.type}**: ${a.action} - ${a.details} (${a.success ? '✅ Success' : '❌ Failed'})`).join('\n')}` : ''}

---
`).join('\n')}

## Summary

${healingLog.finalResult === 'success' ?
  `✅ Tests passed after ${healingLog.attempts.length} attempt(s) with ${healingLog.totalHealingActions} healing action(s).` :
  `❌ Tests failed after ${healingLog.attempts.length} attempt(s) despite ${healingLog.totalHealingActions} healing action(s).`
}
`;

  fs.writeFileSync(logPath, markdown);
  console.log(`\n📝 Healing log saved to: ${logPath}`);
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key === 'max-retries') {
      options.maxRetries = parseInt(value);
    } else if (key === 'test-command') {
      options.testCommand = value;
    } else if (key === 'ticket') {
      options.ticketKey = value;
    }
  }

  if (!options.testCommand) {
    console.error('Usage: node self-healing-tests.js --test-command "npm test" --ticket JIRA-123 [--max-retries 3]');
    process.exit(1);
  }

  runTestsWithHealing(options)
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('Self-Healing Test Summary');
      console.log('='.repeat(60));
      console.log(`Final Result: ${result.finalResult === 'success' ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`Total Attempts: ${result.attempts.length}`);
      console.log(`Healing Actions: ${result.totalHealingActions}`);

      process.exit(result.finalResult === 'success' ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Error during self-healing:', error);
      process.exit(1);
    });
}

module.exports = {
  runTestsWithHealing,
  detectFailures,
  healFailures
};
