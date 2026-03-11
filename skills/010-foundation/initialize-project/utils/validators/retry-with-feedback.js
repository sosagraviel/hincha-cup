#!/usr/bin/env node

/**
 * RETRY WITH FEEDBACK
 *
 * Implements retry logic with exponential backoff for agent operations
 * - Exponential backoff (1s, 2s, 4s, 8s) with jitter
 * - Max 3 retries per operation (configurable)
 * - Includes validation errors in retry prompt
 * - Returns detailed attempt history
 */

const fs = require('fs');
const path = require('path');

/**
 * Load retry configuration
 */
function loadRetryConfig(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config;
  } catch (error) {
    console.error('Warning: Could not load retry config, using defaults');
    return {
      global: {
        max_attempts: 3,
        initial_delay_ms: 1000,
        max_delay_ms: 8000,
        backoff_multiplier: 2,
        jitter: true,
        jitter_factor: 0.1
      }
    };
  }
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt, config) {
  const { initial_delay_ms, max_delay_ms, backoff_multiplier, jitter, jitter_factor } = config;

  // Base delay: initial * (multiplier ^ attempt)
  let delay = initial_delay_ms * Math.pow(backoff_multiplier, attempt - 1);

  // Cap at max delay
  delay = Math.min(delay, max_delay_ms);

  // Add jitter if enabled
  if (jitter) {
    const jitterAmount = delay * jitter_factor;
    const randomJitter = (Math.random() - 0.5) * 2 * jitterAmount;
    delay += randomJitter;
  }

  return Math.floor(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build retry feedback message
 */
function buildRetryFeedback(validationResult, attempt, config) {
  const messages = config.retry_messages || {};
  const parts = [];

  parts.push(`Attempt ${attempt} failed validation.`);
  parts.push('');

  // Add specific error messages
  if (validationResult.errors && validationResult.errors.length > 0) {
    parts.push('Errors found:');
    validationResult.errors.forEach((error, idx) => {
      if (error.type === 'line_count_exceeded') {
        const template = messages.length_violation || 'Line count exceeded: {actual} (max: {max})';
        const message = template
          .replace('{actual}', error.actual)
          .replace('{max}', error.max)
          .replace('{min}', error.min || 'N/A');
        parts.push(`  ${idx + 1}. ${message}`);
      } else {
        parts.push(`  ${idx + 1}. ${error.type}: ${error.message}`);
      }
    });
    parts.push('');
  }

  // Add line count info if available
  if (validationResult.sections) {
    parts.push('Current line counts:');
    if (validationResult.sections.claudeMd) {
      parts.push(`  - CLAUDE.MD: ${validationResult.sections.claudeMd.lineCount} lines`);
    }
    if (validationResult.sections.projectContext) {
      parts.push(`  - PROJECT-CONTEXT: ${validationResult.sections.projectContext.lineCount} lines`);
    }
    parts.push('');
  }

  parts.push('Please revise your output to address these issues.');

  return parts.join('\n');
}

/**
 * Retry operation with exponential backoff
 *
 * @param {Function} operation - Async function that performs the operation
 * @param {Function} validator - Function that validates the result
 * @param {Object} options - Retry options
 * @returns {Object} - {success, attempts, finalOutput, history}
 */
async function retryWithFeedback(operation, validator, options = {}) {
  const {
    configPath,
    operationType = 'default',
    onRetry = null,
    verbose = false
  } = options;

  // Load config
  const config = configPath ? loadRetryConfig(configPath) : { global: {} };
  const operationConfig = config.per_operation?.[operationType] || config.global;

  const maxAttempts = operationConfig.max_attempts || 3;
  const history = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (verbose) {
      console.log(`\nAttempt ${attempt}/${maxAttempts}...`);
    }

    try {
      // Execute operation
      const startTime = Date.now();
      const output = await operation(attempt, history);
      const duration = Date.now() - startTime;

      // Validate output
      const validationResult = await validator(output);

      const attemptRecord = {
        attempt,
        timestamp: new Date().toISOString(),
        duration,
        valid: validationResult.valid,
        errors: validationResult.errors || [],
        warnings: validationResult.warnings || [],
        output: output
      };

      history.push(attemptRecord);

      // Success case
      if (validationResult.valid) {
        if (verbose) {
          console.log(`✓ Attempt ${attempt} succeeded`);
        }

        return {
          success: true,
          attempts: attempt,
          finalOutput: output,
          validationResult,
          history
        };
      }

      // Failed validation - prepare retry
      if (attempt < maxAttempts) {
        const delay = calculateDelay(attempt, operationConfig);
        const feedback = buildRetryFeedback(validationResult, attempt, operationConfig);

        if (verbose) {
          console.log(`✗ Attempt ${attempt} failed validation`);
          console.log(`Waiting ${delay}ms before retry...`);
          console.log('\nFeedback to agent:');
          console.log(feedback);
        }

        // Call onRetry callback if provided
        if (onRetry) {
          await onRetry(attempt, feedback, validationResult);
        }

        // Wait before retry
        await sleep(delay);
      } else {
        // Max attempts reached
        if (verbose) {
          console.log(`✗ Max attempts (${maxAttempts}) reached`);
        }

        return {
          success: false,
          attempts: attempt,
          finalOutput: output,
          validationResult,
          history,
          reason: 'max_attempts_reached'
        };
      }

    } catch (error) {
      // Operation or validation threw an error
      const attemptRecord = {
        attempt,
        timestamp: new Date().toISOString(),
        valid: false,
        error: error.message,
        stack: error.stack
      };

      history.push(attemptRecord);

      if (attempt >= maxAttempts) {
        if (verbose) {
          console.error(`✗ Attempt ${attempt} threw error: ${error.message}`);
        }

        return {
          success: false,
          attempts: attempt,
          finalOutput: null,
          validationResult: { valid: false, errors: [{ type: 'exception', message: error.message }] },
          history,
          reason: 'exception',
          exception: error
        };
      }

      // Retry after error
      const delay = calculateDelay(attempt, operationConfig);
      if (verbose) {
        console.error(`✗ Attempt ${attempt} threw error: ${error.message}`);
        console.log(`Waiting ${delay}ms before retry...`);
      }

      await sleep(delay);
    }
  }

  // Should not reach here, but handle just in case
  return {
    success: false,
    attempts: maxAttempts,
    finalOutput: null,
    validationResult: { valid: false, errors: [] },
    history,
    reason: 'unknown'
  };
}

/**
 * Simple retry wrapper (no feedback loop)
 */
async function simpleRetry(operation, maxAttempts = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation(attempt);
      return { success: true, result, attempts: attempt };
    } catch (error) {
      if (attempt >= maxAttempts) {
        return { success: false, error, attempts: attempt };
      }
      await sleep(delayMs * attempt);
    }
  }
}

/**
 * CLI interface for testing
 */
if (require.main === module) {
  console.log('Retry with feedback - Test mode');

  // Example operation that succeeds on 3rd attempt
  let callCount = 0;
  const mockOperation = async (attempt, history) => {
    callCount++;
    console.log(`  Operation called (count: ${callCount})`);

    if (attempt < 3) {
      return { data: 'invalid', lines: 250 };
    } else {
      return { data: 'valid', lines: 150 };
    }
  };

  // Example validator
  const mockValidator = async (output) => {
    const valid = output.lines < 200;
    return {
      valid,
      errors: valid ? [] : [{ type: 'line_count_exceeded', actual: output.lines, max: 200 }]
    };
  };

  // Run test
  (async () => {
    const result = await retryWithFeedback(mockOperation, mockValidator, {
      verbose: true,
      operationType: 'test'
    });

    console.log('\n=== Final Result ===');
    console.log('Success:', result.success);
    console.log('Attempts:', result.attempts);
    console.log('Final output:', result.finalOutput);
    console.log('\nHistory:');
    result.history.forEach((h, idx) => {
      console.log(`  ${idx + 1}. Attempt ${h.attempt}: ${h.valid ? 'VALID' : 'INVALID'}`);
    });
  })();
}

module.exports = {
  retryWithFeedback,
  simpleRetry,
  calculateDelay,
  buildRetryFeedback,
  loadRetryConfig
};
