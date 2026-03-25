import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBackoffDelay,
  sleep,
  initRetryState,
  updateRetryState,
  completeRetryState,
  shouldRetry,
  buildErrorFeedback,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from '../../../src/utils/retry.js';

describe('retry utilities', () => {
  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff without jitter', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        jitter: false,
      };

      expect(calculateBackoffDelay(0, config)).toBe(2000); // 2000 * 2^0
      expect(calculateBackoffDelay(1, config)).toBe(4000); // 2000 * 2^1
      expect(calculateBackoffDelay(2, config)).toBe(8000); // 2000 * 2^2
      expect(calculateBackoffDelay(3, config)).toBe(16000); // 2000 * 2^3
    });

    it('should respect max delay', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        jitter: false,
        maxDelayMs: 10000,
      };

      expect(calculateBackoffDelay(10, config)).toBe(10000); // Should be capped
    });

    it('should apply jitter when enabled', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        jitter: true,
      };

      const delay = calculateBackoffDelay(1, config);
      // With jitter, delay should be between 50% and 100% of base delay
      expect(delay).toBeGreaterThanOrEqual(2000); // 50% of 4000
      expect(delay).toBeLessThanOrEqual(4000); // 100% of 4000
    });

    it('should use default config when not provided', () => {
      const delay = calculateBackoffDelay(0);
      expect(delay).toBeGreaterThanOrEqual(1000); // 50% of 2000 with jitter
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('should handle custom multiplier', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        backoffMultiplier: 3,
        jitter: false,
      };

      expect(calculateBackoffDelay(0, config)).toBe(2000); // 2000 * 3^0
      expect(calculateBackoffDelay(1, config)).toBe(6000); // 2000 * 3^1
      expect(calculateBackoffDelay(2, config)).toBe(18000); // 2000 * 3^2
    });

    it('should handle custom initial delay', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        initialDelayMs: 5000,
        jitter: false,
      };

      expect(calculateBackoffDelay(0, config)).toBe(5000);
      expect(calculateBackoffDelay(1, config)).toBe(10000);
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow small margin
      expect(elapsed).toBeLessThan(150);
    });

    it('should return a promise', () => {
      const result = sleep(1);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('initRetryState', () => {
    it('should initialize with default max attempts', () => {
      const state = initRetryState();

      expect(state.attempt).toBe(0);
      expect(state.max_attempts).toBe(5);
      expect(state.error_history).toEqual([]);
      expect(state.started_at).toBeDefined();
      if (state.started_at) {
        expect(new Date(state.started_at).getTime()).toBeCloseTo(Date.now(), -2);
      }
    });

    it('should initialize with custom max attempts', () => {
      const state = initRetryState(10);

      expect(state.attempt).toBe(0);
      expect(state.max_attempts).toBe(10);
    });

    it('should have valid ISO timestamp', () => {
      const state = initRetryState();

      expect(state.started_at).toBeDefined();
      if (state.started_at) {
        expect(() => new Date(state.started_at!)).not.toThrow();
        expect(state.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    });
  });

  describe('updateRetryState', () => {
    let initialState: any;

    beforeEach(() => {
      initialState = initRetryState(5);
    });

    it('should increment attempt counter', () => {
      const updated = updateRetryState(initialState, 'test error');

      expect(updated.attempt).toBe(1);
      expect(initialState.attempt).toBe(0); // Should not mutate original
    });

    it('should store last error', () => {
      const error = 'Connection timeout';
      const updated = updateRetryState(initialState, error);

      expect(updated.last_error).toBe(error);
    });

    it('should add error to history', () => {
      const error1 = 'First error';
      const state1 = updateRetryState(initialState, error1);

      expect(state1.error_history).toEqual([error1]);

      const error2 = 'Second error';
      const state2 = updateRetryState(state1, error2);

      expect(state2.error_history).toEqual([error1, error2]);
    });

    it('should limit error history to last 3 errors', () => {
      let state = initialState;
      const errors = ['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5'];

      for (const error of errors) {
        state = updateRetryState(state, error);
      }

      expect(state.error_history).toEqual(['Error 3', 'Error 4', 'Error 5']);
      expect(state.error_history.length).toBe(3);
    });

    it('should calculate next delay', () => {
      const updated = updateRetryState(initialState, 'test error');

      expect(updated.next_delay_ms).toBeDefined();
      expect(updated.next_delay_ms).toBeGreaterThan(0);
    });

    it('should use custom config for delay calculation', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        jitter: false,
      };

      const updated = updateRetryState(initialState, 'test error', config);

      expect(updated.next_delay_ms).toBe(2000); // 1000 * 2^1
    });
  });

  describe('completeRetryState', () => {
    it('should mark state as complete', () => {
      const state = initRetryState();
      const completed = completeRetryState(state);

      expect(completed.completed_at).toBeDefined();
      expect(new Date(completed.completed_at!).getTime()).toBeCloseTo(Date.now(), -2);
    });

    it('should clear error fields', () => {
      const state = updateRetryState(initRetryState(), 'test error');
      const completed = completeRetryState(state);

      expect(completed.last_error).toBeUndefined();
      expect(completed.next_delay_ms).toBeUndefined();
    });

    it('should preserve attempt history', () => {
      let state = initRetryState();
      state = updateRetryState(state, 'error 1');
      state = updateRetryState(state, 'error 2');
      const completed = completeRetryState(state);

      expect(completed.error_history).toEqual(['error 1', 'error 2']);
      expect(completed.attempt).toBe(2);
    });
  });

  describe('shouldRetry', () => {
    it('should return true when attempts remain', () => {
      const state = initRetryState(5);

      expect(shouldRetry(state)).toBe(true);
      expect(shouldRetry({ ...state, attempt: 1 })).toBe(true);
      expect(shouldRetry({ ...state, attempt: 4 })).toBe(true);
    });

    it('should return false when max attempts reached', () => {
      const state = { ...initRetryState(5), attempt: 5 };

      expect(shouldRetry(state)).toBe(false);
    });

    it('should return false when max attempts exceeded', () => {
      const state = { ...initRetryState(3), attempt: 10 };

      expect(shouldRetry(state)).toBe(false);
    });

    it('should handle edge case with zero max attempts', () => {
      const state = initRetryState(0);

      expect(shouldRetry(state)).toBe(false);
    });
  });

  describe('buildErrorFeedback', () => {
    it('should return empty string when no error', () => {
      const state = initRetryState();

      expect(buildErrorFeedback(state)).toBe('');
    });

    it('should build feedback with last error', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Connection timeout');

      const feedback = buildErrorFeedback(state);

      expect(feedback).toContain('PREVIOUS ATTEMPT FAILED');
      expect(feedback).toContain('Attempt 1/5');
      expect(feedback).toContain('Connection timeout');
    });

    it('should include error history when multiple attempts', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'First error');
      state = updateRetryState(state, 'Second error');

      const feedback = buildErrorFeedback(state);

      expect(feedback).toContain('PREVIOUS ERRORS');
      expect(feedback).toContain('Attempt 1: First error');
    });

    it('should not show previous errors section on first attempt', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'First error');

      const feedback = buildErrorFeedback(state);

      expect(feedback).not.toContain('PREVIOUS ERRORS');
    });

    it('should include instructions', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Test error');

      const feedback = buildErrorFeedback(state);

      expect(feedback).toContain('INSTRUCTIONS');
      expect(feedback).toContain('JSON format must be valid');
      expect(feedback).toContain('All required fields must be present');
      expect(feedback).toContain('Follow the schema exactly');
    });

    it('should show correct attempt numbers', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Error 1');
      state = updateRetryState(state, 'Error 2');
      state = updateRetryState(state, 'Error 3');

      const feedback = buildErrorFeedback(state);

      expect(feedback).toContain('Attempt 3/5');
    });

    it('should limit previous errors display', () => {
      let state = initRetryState(10);

      for (let i = 1; i <= 5; i++) {
        state = updateRetryState(state, `Error ${i}`);
      }

      const feedback = buildErrorFeedback(state);

      // Should only show errors from history (last 3 + current)
      expect(feedback).toContain('Error 3'); // From history
      expect(feedback).toContain('Error 4'); // From history
      expect(feedback).not.toContain('Error 1'); // Too old, trimmed
      expect(feedback).not.toContain('Error 2'); // Too old, trimmed
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(5);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(2000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
    });
  });
});
