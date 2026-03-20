import type { RetryState } from '../state/schemas/initialize-project.schema.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Default retry configuration
 * - 5 attempts (matches bash implementation)
 * - Initial delay: 2 seconds
 * - Max delay: 30 seconds
 * - 2x backoff multiplier
 * - Jitter enabled to avoid thundering herd
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true
};

/**
 * Calculate next delay using exponential backoff
 *
 * Formula: delay = min(initialDelay * (multiplier ^ attempt), maxDelay)
 * With jitter: delay = baseDelay * (0.5 + random * 0.5)
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );

  if (config.jitter) {
    // Add 0-50% jitter to prevent thundering herd
    return Math.floor(baseDelay * (0.5 + Math.random() * 0.5));
  }

  return baseDelay;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize retry state for a new operation
 */
export function initRetryState(maxAttempts: number = DEFAULT_RETRY_CONFIG.maxAttempts): RetryState {
  return {
    attempt: 0,
    max_attempts: maxAttempts,
    error_history: [],
    started_at: new Date().toISOString()
  };
}

/**
 * Update retry state after a failed attempt
 *
 * @param state - Current retry state
 * @param error - Error message from failed attempt
 * @param config - Retry configuration
 * @returns Updated retry state
 */
export function updateRetryState(
  state: RetryState,
  error: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): RetryState {
  const nextAttempt = state.attempt + 1;
  const errorHistory = [...state.error_history, error].slice(-3); // Keep last 3 errors

  return {
    ...state,
    attempt: nextAttempt,
    last_error: error,
    error_history: errorHistory,
    next_delay_ms: calculateBackoffDelay(nextAttempt, config)
  };
}

/**
 * Mark retry state as completed successfully
 */
export function completeRetryState(state: RetryState): RetryState {
  return {
    ...state,
    completed_at: new Date().toISOString(),
    last_error: undefined,
    next_delay_ms: undefined
  };
}

/**
 * Check if should retry based on current state
 */
export function shouldRetry(state: RetryState): boolean {
  return state.attempt < state.max_attempts;
}

/**
 * Build error feedback prompt from retry state
 *
 * This creates a prompt that includes:
 * - Current attempt number
 * - Last error message
 * - History of previous errors (for pattern recognition)
 *
 * Used to feed back error information to agents for self-correction.
 */
export function buildErrorFeedback(state: RetryState): string {
  if (!state.last_error) {
    return '';
  }

  const lines = [
    '',
    `⚠️  PREVIOUS ATTEMPT FAILED (Attempt ${state.attempt}/${state.max_attempts})`,
    '',
    '=== ERROR FROM LAST ATTEMPT ===',
    state.last_error,
    ''
  ];

  if (state.error_history.length > 1) {
    lines.push('=== PREVIOUS ERRORS ===');
    state.error_history.slice(0, -1).forEach((err, idx) => {
      lines.push(`Attempt ${idx + 1}: ${err}`);
    });
    lines.push('');
  }

  lines.push('=== INSTRUCTIONS ===');
  lines.push('Please fix the issues identified above and try again.');
  lines.push('Pay special attention to:');
  lines.push('1. JSON format must be valid');
  lines.push('2. All required fields must be present');
  lines.push('3. Follow the schema exactly');
  lines.push('');

  return lines.join('\n');
}
