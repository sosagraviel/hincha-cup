#!/usr/bin/env node

/**
 * Error Recovery System for Implement-Ticket Workflow
 *
 * Implements a four-layer error recovery architecture:
 * - Layer 1: Exponential backoff with jitter for transient errors
 * - Layer 2: Model fallback chain (Sonnet → Haiku → Opus)
 * - Layer 3: Error classification (retriable vs permanent)
 * - Layer 4: Checkpointing and resume capability
 *
 * Usage:
 *   const { retryWithBackoff, withModelFallback, classifyError, saveCheckpoint, loadCheckpoint } = require('./error-recovery.js')
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv();
addFormats(ajv);

// =============================================================================
// Layer 5: Infinite Retry Loop Detection (P0-14)
// =============================================================================

// Track retry history to detect stuck loops
const retryHistory = new Map();

/**
 * Create a hash from an error for detecting duplicate errors
 */
function hashError(error) {
  const errorString = typeof error === 'string'
    ? error
    : JSON.stringify({
        message: error.message,
        stack: error.stack?.split('\n')[0]
      });

  return crypto.createHash('sha256').update(errorString).digest('hex').substring(0, 16);
}

/**
 * Detect if we're stuck in an infinite retry loop
 *
 * @param {Error|string} error - Error to check
 * @param {string} context - Context identifier (e.g., 'coverage-retry', 'compile-retry')
 * @returns {Object} - Detection result with isStuck flag and suggestion
 */
function detectStuckRetries(error, context) {
  const errorHash = hashError(error);
  const contextKey = `${context}:${errorHash}`;

  if (!retryHistory.has(contextKey)) {
    retryHistory.set(contextKey, []);
  }

  const history = retryHistory.get(contextKey);
  history.push(Date.now());

  // Keep only last 5 attempts
  if (history.length > 5) {
    history.shift();
  }

  // Check for 3 consecutive identical errors within 5 minutes
  if (history.length >= 3) {
    const recentAttempts = history.slice(-3);
    const timeSpan = recentAttempts[2] - recentAttempts[0];
    const fiveMinutes = 5 * 60 * 1000;

    if (timeSpan < fiveMinutes) {
      return {
        isStuck: true,
        attempts: history.length,
        errorHash,
        timeSpan: Math.round(timeSpan / 1000),
        suggestion: 'Identical error occurred 3 times in ' + Math.round(timeSpan / 60000) + ' minutes.\n' +
                   'Consider:\n' +
                   '  1. Changing approach (different model, different prompt)\n' +
                   '  2. Manual intervention\n' +
                   '  3. Creating WIP PR for human review'
      };
    }
  }

  return { isStuck: false };
}

/**
 * Clear retry history for a specific context or all contexts
 */
function clearRetryHistory(context) {
  if (context) {
    // Clear specific context
    for (const key of retryHistory.keys()) {
      if (key.startsWith(context + ':')) {
        retryHistory.delete(key);
      }
    }
  } else {
    // Clear all history
    retryHistory.clear();
  }
}

// =============================================================================
// Layer 1: Exponential Backoff with Jitter
// =============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff and jitter
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry configuration
 * @param {number} options.maxAttempts - Maximum number of retry attempts (default: 5)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 60000)
 * @param {Function} options.onRetry - Callback called on each retry (receives attempt, error, delay)
 * @returns {Promise<any>} - Result of successful function execution
 * @throws {Error} - If all retry attempts fail
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 5,
    baseDelay = 1000,
    maxDelay = 60000,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retriable
      if (!isRetriableError(error)) {
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const cappedDelay = Math.min(exponentialDelay, maxDelay);

      // Add jitter (random factor between 0.5x and 1.5x)
      const jitterFactor = 0.5 + Math.random();
      const delay = Math.floor(cappedDelay * jitterFactor);

      console.warn(`[Retry] Attempt ${attempt + 1}/${maxAttempts} failed: ${error.message}`);
      console.warn(`[Retry] Retrying in ${(delay / 1000).toFixed(1)}s...`);

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retriable (transient)
 */
function isRetriableError(error) {
  // HTTP status codes that are retriable
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    // 429 Rate Limit, 503 Service Unavailable, 5xx Server Errors
    if (status === 429 || status === 503 || status >= 500) {
      return true;
    }
  }

  // Network errors
  if (error.code) {
    const retriableCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EAI_AGAIN'
    ];
    if (retriableCodes.includes(error.code)) {
      return true;
    }
  }

  // Error messages that indicate transient issues
  const retriableMessages = [
    'timeout',
    'timed out',
    'connection reset',
    'connection refused',
    'temporarily unavailable',
    'service unavailable',
    'rate limit',
    'too many requests'
  ];

  const errorMessage = (error.message || '').toLowerCase();
  return retriableMessages.some(msg => errorMessage.includes(msg));
}

// =============================================================================
// Layer 2: Model Fallback Chain
// =============================================================================

const MODEL_FALLBACK_CHAIN = ['sonnet', 'haiku', 'opus'];

/**
 * Execute a task with model fallback
 *
 * @param {Function} executeTask - Function that takes model name and executes task
 * @param {Object} options - Fallback configuration
 * @param {string[]} options.models - Model fallback chain (default: ['sonnet', 'haiku', 'opus'])
 * @param {Function} options.onFallback - Callback called on model fallback (receives fromModel, toModel, error)
 * @returns {Promise<any>} - Result of successful task execution
 * @throws {Error} - If all models fail
 */
async function withModelFallback(executeTask, options = {}) {
  const {
    models = MODEL_FALLBACK_CHAIN,
    onFallback = null
  } = options;

  let lastError;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      console.log(`[ModelFallback] Executing with ${model}...`);
      return await executeTask(model);
    } catch (error) {
      lastError = error;

      if (i === models.length - 1) {
        console.error(`[ModelFallback] All models failed. Last error: ${error.message}`);
        throw new Error(`All models failed. Last error: ${error.message}`);
      }

      const nextModel = models[i + 1];
      console.warn(`[ModelFallback] Model ${model} failed: ${error.message}`);
      console.warn(`[ModelFallback] Falling back to ${nextModel}...`);

      if (onFallback) {
        onFallback(model, nextModel, error);
      }
    }
  }

  throw lastError;
}

// =============================================================================
// Layer 3: Error Classification
// =============================================================================

const ErrorType = {
  RETRIABLE_TRANSIENT: 'retriable_transient',
  RETRIABLE_PERMANENT: 'retriable_permanent',
  NON_RETRIABLE: 'non_retriable'
};

/**
 * Classify an error into retriable or non-retriable
 *
 * @param {Error} error - Error to classify
 * @returns {Object} - Classification result with type, canRetry, and reason
 */
function classifyError(error) {
  const status = error.status || error.statusCode;
  const message = (error.message || '').toLowerCase();

  // Transient errors (network, rate limits, temporary server issues)
  if (status === 429 || status === 503 || (status >= 500 && status < 600)) {
    return {
      type: ErrorType.RETRIABLE_TRANSIENT,
      canRetry: true,
      reason: 'Transient server or network error'
    };
  }

  // Network timeouts and connection errors
  if (error.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code)) {
    return {
      type: ErrorType.RETRIABLE_TRANSIENT,
      canRetry: true,
      reason: 'Network connectivity issue'
    };
  }

  // Compilation errors (might be fixed with different approach)
  if (message.includes('typescript') ||
      message.includes('syntaxerror') ||
      message.includes('compilation') ||
      message.includes('type error')) {
    return {
      type: ErrorType.RETRIABLE_PERMANENT,
      canRetry: true,
      reason: 'Compilation error - may be fixed with different approach'
    };
  }

  // Test failures (might be fixed with code adjustments)
  if (message.includes('test failed') ||
      message.includes('assertion') ||
      message.includes('expected')) {
    return {
      type: ErrorType.RETRIABLE_PERMANENT,
      canRetry: true,
      reason: 'Test failure - may be fixed with code adjustments'
    };
  }

  // Non-retriable errors (authentication, permissions, not found)
  if (status === 401 || status === 403 || status === 404 || status === 422) {
    return {
      type: ErrorType.NON_RETRIABLE,
      canRetry: false,
      reason: 'Client error - requires manual intervention'
    };
  }

  // Default: treat as retriable transient
  return {
    type: ErrorType.RETRIABLE_TRANSIENT,
    canRetry: true,
    reason: 'Unknown error - defaulting to retriable'
  };
}

// =============================================================================
// Layer 4: Checkpointing
// =============================================================================

const CHECKPOINT_DIR = '.claude/checkpoints';

/**
 * Get Python version if available
 */
function getPythonVersion() {
  try {
    return execSync('python3 --version').toString().trim().split(' ')[1];
  } catch {
    return null;
  }
}

/**
 * Save a checkpoint with atomic operations and validation
 *
 * @param {string} ticketKey - Jira ticket key (e.g., PROJ-123)
 * @param {Object} checkpoint - Checkpoint data
 * @param {string} checkpoint.phase - Current phase name
 * @param {string[]} checkpoint.completedPhases - List of completed phase names
 * @param {Object} checkpoint.state - Additional state data
 */
async function saveCheckpoint(ticketKey, checkpoint) {
  try {
    // Ensure checkpoint directory exists
    await fs.mkdir(CHECKPOINT_DIR, { recursive: true });

    const checkpointPath = path.join(CHECKPOINT_DIR, `implement-ticket-${ticketKey}.json`);
    const checkpointTempPath = `${checkpointPath}.tmp`;

    // Enhance checkpoint with git state and environment
    const enhancedCheckpoint = {
      ...checkpoint,
      ticketKey,
      timestamp: new Date().toISOString(),
      gitState: {
        commit: execSync('git rev-parse HEAD').toString().trim(),
        branch: execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
        hasUncommittedChanges: execSync('git status --porcelain').toString().trim().length > 0
      },
      environment: {
        nodeVersion: process.version,
        pythonVersion: getPythonVersion(),
        cwd: process.cwd()
      },
      version: '1.0'
    };

    // Validate against schema
    const schema = require('../schemas/checkpoint.schema.json');
    const validate = ajv.compile(schema);
    const valid = validate(enhancedCheckpoint);

    if (!valid) {
      throw new Error(
        `Checkpoint validation failed:\n${JSON.stringify(validate.errors, null, 2)}`
      );
    }

    // Atomic write: temp file -> validate -> rename
    await fs.writeFile(checkpointTempPath, JSON.stringify(enhancedCheckpoint, null, 2), 'utf8');

    // Validate temp file is readable
    const tempContent = await fs.readFile(checkpointTempPath, 'utf8');
    JSON.parse(tempContent); // Will throw if corrupted

    // Atomic rename
    await fs.rename(checkpointTempPath, checkpointPath);

    console.log(`[Checkpoint] Saved: ${checkpointPath}`);
    console.log(`  Phase: ${checkpoint.phase}`);
    console.log(`  Git commit: ${enhancedCheckpoint.gitState.commit.substring(0, 7)}`);
    return checkpointPath;
  } catch (error) {
    console.error(`[Checkpoint] Failed to save: ${error.message}`);
    // Don't throw - checkpointing failure shouldn't stop execution
  }
}

/**
 * Prompt user for confirmation
 */
async function askUser(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Load a checkpoint with validation and environment checks
 *
 * @param {string} ticketKey - Jira ticket key (e.g., PROJ-123)
 * @returns {Promise<Object|null>} - Checkpoint data or null if not found
 */
async function loadCheckpoint(ticketKey) {
  const checkpointPath = path.join(CHECKPOINT_DIR, `implement-ticket-${ticketKey}.json`);

  try {
    const data = await fs.readFile(checkpointPath, 'utf8');
    const checkpoint = JSON.parse(data);

    // Validate schema
    const schema = require('../schemas/checkpoint.schema.json');
    const validate = ajv.compile(schema);
    const valid = validate(checkpoint);

    if (!valid) {
      console.error('[Checkpoint] Validation failed:');
      console.error(JSON.stringify(validate.errors, null, 2));
      throw new Error('Corrupted checkpoint file');
    }

    // Validate git state
    const currentCommit = execSync('git rev-parse HEAD').toString().trim();
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

    if (checkpoint.gitState.commit !== currentCommit) {
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('  ⚠  GIT STATE MISMATCH');
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('');
      console.warn(`Checkpoint created at: ${checkpoint.gitState.commit.substring(0, 7)}`);
      console.warn(`Current commit:        ${currentCommit.substring(0, 7)}`);
      console.warn('');
      console.warn('This might cause issues if:');
      console.warn('- Files have changed since checkpoint');
      console.warn('- Dependencies have been updated');
      console.warn('- Database schema has changed');
      console.warn('');

      const shouldContinue = await askUser('Continue anyway? [y/N]: ');
      if (shouldContinue.toLowerCase() !== 'y') {
        throw new Error('Resume aborted due to git state mismatch');
      }
    }

    if (checkpoint.gitState.branch !== currentBranch) {
      console.warn(`[Checkpoint] Branch mismatch: checkpoint on '${checkpoint.gitState.branch}', currently on '${currentBranch}'`);
    }

    // Validate environment
    if (checkpoint.environment.nodeVersion !== process.version) {
      console.warn(`[Checkpoint] Node version mismatch: checkpoint used ${checkpoint.environment.nodeVersion}, currently ${process.version}`);
    }

    const currentPythonVersion = getPythonVersion();
    if (checkpoint.environment.pythonVersion && checkpoint.environment.pythonVersion !== currentPythonVersion) {
      console.warn(`[Checkpoint] Python version mismatch: checkpoint used ${checkpoint.environment.pythonVersion}, currently ${currentPythonVersion}`);
    }

    if (checkpoint.environment.cwd !== process.cwd()) {
      console.warn(`[Checkpoint] Working directory mismatch: checkpoint from ${checkpoint.environment.cwd}, currently ${process.cwd()}`);
    }

    // Check checkpoint age
    const checkpointAge = Date.now() - new Date(checkpoint.timestamp).getTime();
    const ageHours = checkpointAge / (1000 * 60 * 60);

    if (ageHours > 24) {
      console.warn(`[Checkpoint] Checkpoint is ${Math.floor(ageHours)} hours old (created ${checkpoint.timestamp})`);
      console.warn('  Old checkpoints might not reflect current codebase state');
    }

    console.log(`[Checkpoint] Validation passed - loaded phase: ${checkpoint.phase}`);
    return checkpoint;

  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // Checkpoint doesn't exist
    }
    throw error;
  }
}

/**
 * Delete a checkpoint
 *
 * @param {string} ticketKey - Jira ticket key (e.g., PROJ-123)
 */
async function deleteCheckpoint(ticketKey) {
  try {
    const checkpointPath = path.join(CHECKPOINT_DIR, `implement-ticket-${ticketKey}.json`);
    await fs.unlink(checkpointPath);
    console.log(`[Checkpoint] Deleted checkpoint for ${ticketKey}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[Checkpoint] Failed to delete: ${error.message}`);
    }
  }
}

/**
 * Clean up old checkpoints
 *
 * @param {number} maxAge - Maximum age in milliseconds (default: 7 days)
 * @returns {Promise<number>} - Number of checkpoints removed
 */
async function cleanupOldCheckpoints(maxAge = 7 * 24 * 60 * 60 * 1000) {
  try {
    const files = await fs.readdir(CHECKPOINT_DIR);
    let removedCount = 0;

    for (const file of files) {
      if (!file.startsWith('implement-ticket-') || !file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(CHECKPOINT_DIR, file);
      const stats = await fs.stat(filePath);
      const age = Date.now() - stats.mtime.getTime();

      if (age > maxAge) {
        const ageDays = Math.floor(age / (1000 * 60 * 60 * 24));
        console.log(`[Checkpoint] Removing old checkpoint: ${file} (${ageDays} days old)`);
        await fs.unlink(filePath);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[Checkpoint] Cleaned up ${removedCount} old checkpoint(s)`);
    }

    return removedCount;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0; // Directory doesn't exist
    }
    console.error(`[Checkpoint] Failed to cleanup: ${error.message}`);
    return 0;
  }
}

/**
 * List all checkpoints
 *
 * @returns {Promise<string[]>} - List of ticket keys with checkpoints
 */
async function listCheckpoints() {
  try {
    const files = await fs.readdir(CHECKPOINT_DIR);
    return files
      .filter(f => f.startsWith('implement-ticket-') && f.endsWith('.json'))
      .map(f => f.replace('implement-ticket-', '').replace('.json', ''));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error(`[Checkpoint] Failed to list: ${error.message}`);
    return [];
  }
}

// =============================================================================
// Layer 5: API Rate Limit Tracking
// =============================================================================

/**
 * Rate limit state per service
 * Tracks remaining requests, reset time, and total limit
 */
const rateLimits = {
  claude: { remaining: null, reset: null, limit: null },
  github: { remaining: null, reset: null, limit: null },
  jira: { remaining: null, reset: null, limit: null },
  notion: { remaining: null, reset: null, limit: null }
};

/**
 * Track rate limit information from API response headers
 *
 * @param {string} service - Service name (claude, github, jira, notion)
 * @param {Object} headers - Response headers object
 */
function trackRateLimit(service, headers) {
  const serviceKey = service.toLowerCase();

  if (!rateLimits[serviceKey]) {
    rateLimits[serviceKey] = { remaining: null, reset: null, limit: null };
  }

  // Extract rate limit headers (different APIs use different header names)
  const remainingHeaders = {
    claude: 'anthropic-ratelimit-requests-remaining',
    github: 'x-ratelimit-remaining',
    jira: 'x-ratelimit-remaining',
    notion: 'x-ratelimit-remaining'
  };

  const resetHeaders = {
    claude: 'anthropic-ratelimit-requests-reset',
    github: 'x-ratelimit-reset',
    jira: 'x-ratelimit-reset',
    notion: 'x-ratelimit-reset'
  };

  const limitHeaders = {
    claude: 'anthropic-ratelimit-requests-limit',
    github: 'x-ratelimit-limit',
    jira: 'x-ratelimit-limit',
    notion: 'x-ratelimit-limit'
  };

  // Parse remaining requests
  const remainingHeader = headers[remainingHeaders[serviceKey]];
  if (remainingHeader) {
    const remaining = parseInt(remainingHeader);
    if (!isNaN(remaining)) {
      rateLimits[serviceKey].remaining = remaining;
    }
  }

  // Parse reset time
  const resetHeader = headers[resetHeaders[serviceKey]];
  if (resetHeader) {
    // Handle both Unix timestamp and ISO date formats
    const resetTime = isNaN(resetHeader)
      ? new Date(resetHeader)
      : new Date(parseInt(resetHeader) * 1000);
    rateLimits[serviceKey].reset = resetTime;
  }

  // Parse total limit
  const limitHeader = headers[limitHeaders[serviceKey]];
  if (limitHeader) {
    const limit = parseInt(limitHeader);
    if (!isNaN(limit)) {
      rateLimits[serviceKey].limit = limit;
    }
  }

  // Log warning if approaching limit (less than 10 requests remaining)
  if (rateLimits[serviceKey].remaining !== null && rateLimits[serviceKey].remaining < 10) {
    console.warn(`⚠ ${service} API rate limit low: ${rateLimits[serviceKey].remaining} requests remaining`);

    if (rateLimits[serviceKey].reset) {
      const now = new Date();
      const resetTime = rateLimits[serviceKey].reset;
      const minutesUntilReset = Math.ceil((resetTime - now) / 60000);

      if (minutesUntilReset > 0) {
        console.warn(`  Resets in ${minutesUntilReset} minute(s) at ${resetTime.toISOString()}`);
      } else {
        console.warn(`  Reset time has passed, limit should refresh on next request`);
      }
    }
  }
}

/**
 * Check if sufficient rate limit budget exists for an operation
 *
 * @param {string} service - Service name (claude, github, jira, notion)
 * @param {number} requiredCalls - Number of API calls required (default: 1)
 * @returns {Object} - Result object with allowed, remaining, required, resetIn, message
 */
function checkRateLimit(service, requiredCalls = 1) {
  const serviceKey = service.toLowerCase();
  const limit = rateLimits[serviceKey];

  if (!limit || limit.remaining === null) {
    // No rate limit data yet, assume OK
    return { allowed: true };
  }

  if (limit.remaining < requiredCalls) {
    const now = new Date();
    const resetTime = limit.reset ? new Date(limit.reset) : null;
    const minutesUntilReset = resetTime
      ? Math.ceil((resetTime - now) / 60000)
      : null;

    return {
      allowed: false,
      remaining: limit.remaining,
      required: requiredCalls,
      resetIn: minutesUntilReset,
      message: `${service} API rate limit insufficient:\n` +
               `  Remaining: ${limit.remaining}\n` +
               `  Required: ${requiredCalls}\n` +
               (resetTime ? `  Resets in: ${minutesUntilReset} minute(s)\n` : '') +
               `\nWait for rate limit reset or reduce API calls.`
    };
  }

  return {
    allowed: true,
    remaining: limit.remaining,
    message: `${service} API rate limit OK: ${limit.remaining} requests remaining`
  };
}

/**
 * Get current rate limit status for all services
 *
 * @returns {Object} - Rate limit state for all services
 */
function getRateLimitStatus() {
  return JSON.parse(JSON.stringify(rateLimits)); // Return deep copy
}

/**
 * Reset rate limit tracking for a specific service or all services
 *
 * @param {string|null} service - Service name to reset, or null for all
 */
function resetRateLimits(service = null) {
  if (service) {
    const serviceKey = service.toLowerCase();
    if (rateLimits[serviceKey]) {
      rateLimits[serviceKey] = { remaining: null, reset: null, limit: null };
      console.log(`[RateLimit] Reset tracking for ${service}`);
    }
  } else {
    // Reset all services
    for (const key in rateLimits) {
      rateLimits[key] = { remaining: null, reset: null, limit: null };
    }
    console.log('[RateLimit] Reset tracking for all services');
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Layer 1: Retry
  retryWithBackoff,
  isRetriableError,

  // Layer 2: Model Fallback
  withModelFallback,
  MODEL_FALLBACK_CHAIN,

  // Layer 3: Error Classification
  classifyError,
  ErrorType,

  // Layer 4: Checkpointing
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpoint,
  listCheckpoints,
  cleanupOldCheckpoints,

  // Layer 5: Rate Limiting (P0-11)
  trackRateLimit,
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimits,

  // Layer 5: Stuck Retry Detection (P0-14)
  detectStuckRetries,
  hashError,
  clearRetryHistory,

  // Utilities
  sleep,
  getPythonVersion,
  askUser
};
