#!/usr/bin/env node

/**
 * Automatic Retry Logic for Flaky Operations
 *
 * Provides retry strategies with exponential backoff for:
 * - Network requests (API calls, npm installs)
 * - File I/O operations (race conditions)
 * - Test execution (timing-dependent)
 * - Database connections
 *
 * Usage:
 *   const { retryWithBackoff } = require('./retry-with-backoff');
 *
 *   await retryWithBackoff(
 *     async () => execSync('npm install'),
 *     { maxRetries: 3, operation: 'npm_install' }
 *   );
 */

const fs = require('fs');
const path = require('path');

// Retry strategies for different operation types
const RETRY_STRATEGIES = {
  NETWORK: {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  },
  FILE_IO: {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2,
    jitter: false
  },
  DATABASE: {
    maxRetries: 5,
    initialDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 1.5,
    jitter: true
  },
  TEST: {
    maxRetries: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: false
  },
  DEFAULT: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true
  }
};

// Operation type mapping
const OPERATION_TYPES = {
  npm_install: 'NETWORK',
  npm_publish: 'NETWORK',
  api_request: 'NETWORK',
  http_request: 'NETWORK',
  file_read: 'FILE_IO',
  file_write: 'FILE_IO',
  file_delete: 'FILE_IO',
  db_connect: 'DATABASE',
  db_query: 'DATABASE',
  test_run: 'TEST'
};

/**
 * Retry an async operation with exponential backoff
 *
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {number} options.backoffMultiplier - Backoff multiplier (default: 2)
 * @param {boolean} options.jitter - Add random jitter to delays (default: true)
 * @param {string} options.operation - Operation type (for strategy selection)
 * @param {Function} options.shouldRetry - Custom function to determine if error is retryable
 * @param {Function} options.onRetry - Callback called before each retry (retry number, error, delay)
 * @returns {Promise<any>} Operation result
 */
async function retryWithBackoff(operation, options = {}) {
  // Determine strategy based on operation type
  const strategyKey = OPERATION_TYPES[options.operation] || 'DEFAULT';
  const strategy = RETRY_STRATEGIES[strategyKey];

  const {
    maxRetries = strategy.maxRetries,
    initialDelay = strategy.initialDelay,
    maxDelay = strategy.maxDelay,
    backoffMultiplier = strategy.backoffMultiplier,
    jitter = strategy.jitter,
    shouldRetry = defaultShouldRetry,
    onRetry = null
  } = options;

  let lastError;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await operation();

      if (attempt > 0) {
        console.log(`✅ Operation succeeded on attempt ${attempt + 1}/${maxRetries + 1}`);
      }

      return result;
    } catch (error) {
      lastError = error;
      attempt++;

      // Check if we should retry
      if (attempt > maxRetries || !shouldRetry(error)) {
        break;
      }

      // Calculate delay with exponential backoff
      const baseDelay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt - 1),
        maxDelay
      );

      // Add jitter if enabled (random +/- 20%)
      const delay = jitter
        ? baseDelay * (0.8 + Math.random() * 0.4)
        : baseDelay;

      console.log(
        `⚠️  Attempt ${attempt}/${maxRetries + 1} failed: ${error.message}`
      );
      console.log(`   Retrying in ${Math.round(delay)}ms...`);

      // Call onRetry callback if provided
      if (onRetry) {
        await onRetry(attempt, error, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  const errorMessage = `Operation failed after ${attempt} attempt(s): ${lastError.message}`;
  console.error(`❌ ${errorMessage}`);
  throw new Error(errorMessage);
}

/**
 * Default retry decision function
 * Returns true if error is retryable, false otherwise
 */
function defaultShouldRetry(error) {
  const retryableErrors = [
    // Network errors
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',

    // HTTP errors (5xx)
    'status code 5',
    '500',
    '502',
    '503',
    '504',

    // File I/O errors
    'EBUSY',
    'EAGAIN',
    'EMFILE',
    'ENFILE',

    // Database errors
    'connection refused',
    'connection timeout',
    'too many connections',
    'deadlock',

    // NPM errors
    'network',
    'FETCH_ERROR',
    'registry error'
  ];

  const errorString = (error.message || error.toString()).toLowerCase();

  return retryableErrors.some(pattern =>
    errorString.includes(pattern.toLowerCase())
  );
}

/**
 * Retry with custom strategy
 */
async function retryWithCustomStrategy(operation, strategy) {
  return retryWithBackoff(operation, {
    ...strategy,
    operation: 'custom'
  });
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convenience wrappers for common operations
 */

/**
 * Retry network request
 */
async function retryNetworkRequest(requestFn, options = {}) {
  return retryWithBackoff(requestFn, {
    ...options,
    operation: 'api_request'
  });
}

/**
 * Retry file operation
 */
async function retryFileOperation(fileFn, options = {}) {
  return retryWithBackoff(fileFn, {
    ...options,
    operation: 'file_write'
  });
}

/**
 * Retry database operation
 */
async function retryDatabaseOperation(dbFn, options = {}) {
  return retryWithBackoff(dbFn, {
    ...options,
    operation: 'db_connect'
  });
}

/**
 * Retry npm command
 */
async function retryNpmCommand(commandFn, options = {}) {
  return retryWithBackoff(commandFn, {
    ...options,
    operation: 'npm_install'
  });
}

/**
 * Create a retry wrapper for a function
 * Returns a new function that automatically retries on failure
 */
function withRetry(fn, options = {}) {
  return async (...args) => {
    return retryWithBackoff(() => fn(...args), options);
  };
}

/**
 * Batch retry multiple operations with the same strategy
 */
async function retryAll(operations, options = {}) {
  const results = [];

  for (const operation of operations) {
    try {
      const result = await retryWithBackoff(operation, options);
      results.push({ success: true, result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  return results;
}

/**
 * Retry with circuit breaker pattern
 * Stops retrying if failure rate exceeds threshold
 */
class RetryCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 0.5; // 50%
    this.windowSize = options.windowSize || 10; // Last 10 operations
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute

    this.failures = [];
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = null;
  }

  async execute(operation, retryOptions = {}) {
    // Check circuit breaker state
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;

      if (timeSinceFailure < this.resetTimeout) {
        throw new Error('Circuit breaker is OPEN. Too many failures.');
      }

      // Try to half-open
      this.state = 'HALF_OPEN';
      console.log('🔄 Circuit breaker: HALF_OPEN (testing)');
    }

    try {
      const result = await retryWithBackoff(operation, retryOptions);

      // Success - record and potentially close circuit
      this.recordSuccess();

      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        console.log('✅ Circuit breaker: CLOSED (recovered)');
      }

      return result;
    } catch (error) {
      // Failure - record and potentially open circuit
      this.recordFailure();

      if (this.shouldOpen()) {
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();
        console.log('⛔ Circuit breaker: OPEN (too many failures)');
      }

      throw error;
    }
  }

  recordSuccess() {
    this.failures.push(false);
    this.trimWindow();
  }

  recordFailure() {
    this.failures.push(true);
    this.trimWindow();
  }

  trimWindow() {
    if (this.failures.length > this.windowSize) {
      this.failures = this.failures.slice(-this.windowSize);
    }
  }

  shouldOpen() {
    if (this.failures.length < this.windowSize) {
      return false;
    }

    const failureCount = this.failures.filter(f => f === true).length;
    const failureRate = failureCount / this.failures.length;

    return failureRate >= this.failureThreshold;
  }

  reset() {
    this.failures = [];
    this.state = 'CLOSED';
    this.lastFailureTime = null;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures.length,
      failureRate: this.failures.filter(f => f).length / Math.max(1, this.failures.length)
    };
  }
}

// Export
module.exports = {
  retryWithBackoff,
  retryWithCustomStrategy,
  retryNetworkRequest,
  retryFileOperation,
  retryDatabaseOperation,
  retryNpmCommand,
  withRetry,
  retryAll,
  RetryCircuitBreaker,
  RETRY_STRATEGIES,
  sleep
};

// CLI example (for testing)
if (require.main === module) {
  const { execSync } = require('child_process');

  console.log('Testing retry with backoff...\n');

  // Example: Retry a flaky command
  const flakyCommand = async () => {
    // Simulate random failure
    if (Math.random() < 0.7) {
      throw new Error('ECONNREFUSED: Connection refused');
    }
    return 'Success!';
  };

  retryWithBackoff(flakyCommand, {
    maxRetries: 5,
    operation: 'api_request',
    onRetry: (attempt, error, delay) => {
      console.log(`   [Retry callback] Attempt ${attempt}, waiting ${Math.round(delay)}ms`);
    }
  })
    .then(result => {
      console.log(`\n✅ Final result: ${result}`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`\n❌ Final error: ${error.message}`);
      process.exit(1);
    });
}
