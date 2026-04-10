import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildEnhancedFeedback,
  retryWithEnhancedFeedback,
  initRetryState,
  updateRetryState,
} from '../../../src/utils/enhanced-retry.js';
import type { ValidationResult } from '../../../src/utils/validator.js';

// Mock logger to avoid console output during tests
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
  },
}));

describe('enhanced-retry', () => {
  describe('buildEnhancedFeedback', () => {
    it('should return empty string when no error', () => {
      const state = initRetryState();
      const validation: ValidationResult = {
        valid: true,
        errors: [],
        data: {},
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toBe('');
    });

    it('should build basic feedback on first attempt', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Test error');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Missing required field: timestamp'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('ATTEMPT 1/5');
      expect(feedback).toContain('Test error');
      expect(feedback).toContain('Missing required field: timestamp');
    });

    it('should detect recurring JSON errors', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Invalid JSON format');
      state = updateRetryState(state, 'JSON parsing failed');

      const validation: ValidationResult = {
        valid: false,
        errors: ['JSON syntax error'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('ERROR PATTERNS DETECTED');
      expect(feedback).toContain('RECURRING: JSON format issues');
      expect(feedback).toContain('Double-check your JSON syntax');
    });

    it('should detect recurring missing field errors', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Missing required field: timestamp');
      state = updateRetryState(state, 'Required field agent_name is missing');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Required field: findings'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('RECURRING: Missing required fields');
      expect(feedback).toContain('Verify ALL required fields are present');
    });

    it('should detect markdown wrapping issues', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Found markdown code blocks');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Markdown detected in output'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      // Check that the feedback mentions markdown/code blocks in the critical instructions
      expect(feedback).toContain('no markdown');
      expect(feedback).toContain('no code blocks');
    });

    it('should provide specific guidance for JSON errors', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'JSON error');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Invalid JSON: unexpected token'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('JSON ERROR');
      expect(feedback).toContain('Use double quotes for strings');
      expect(feedback).toContain('No trailing commas');
      expect(feedback).toContain('Properly escape special characters');
    });

    it('should extract and list missing fields', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Validation failed');

      const validation: ValidationResult = {
        valid: false,
        errors: ['timestamp: Required', 'agent_name: Required', 'findings: Required'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('MISSING FIELDS: timestamp, agent_name, findings');
      expect(feedback).toContain('These fields are REQUIRED');
    });

    it('should provide guidance for agent_name errors', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Agent name mismatch');

      const validation: ValidationResult = {
        valid: false,
        errors: ['agent_name does not match'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('AGENT NAME ERROR');
      expect(feedback).toContain('agent_name field matches your analyzer name exactly');
    });

    it('should provide guidance for timestamp errors', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Invalid timestamp');

      const validation: ValidationResult = {
        valid: false,
        errors: ['timestamp format is invalid'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('TIMESTAMP ERROR');
      expect(feedback).toContain('ISO 8601 format');
    });

    it('should escalate warnings on multiple retries', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Error 1');
      state = updateRetryState(state, 'Error 2');
      state = updateRetryState(state, 'Error 3');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Still failing'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('Multiple retries required');
      expect(feedback).toContain('Pay close attention to error patterns');
    });

    it('should show final attempt warning', () => {
      let state = initRetryState(5);
      for (let i = 0; i < 4; i++) {
        state = updateRetryState(state, `Error ${i + 1}`);
      }

      const validation: ValidationResult = {
        valid: false,
        errors: ['Final error'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('FINAL ATTEMPT APPROACHING');
      expect(feedback).toContain('LAST chance');
    });

    it('should show previous attempt summary', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'First error message');
      state = updateRetryState(state, 'Second error message');
      state = updateRetryState(state, 'Third error message');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Current error'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('PREVIOUS ATTEMPT SUMMARY');
      expect(feedback).toContain('Attempt 1:');
      expect(feedback).toContain('Attempt 2:');
    });

    it('should show remaining attempts', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Error 1');
      state = updateRetryState(state, 'Error 2');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Current error'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('Remaining attempts: 3');
    });

    it('should include critical instructions', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Test error');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Test'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('CRITICAL INSTRUCTIONS');
      expect(feedback).toContain('Output valid, parseable JSON');
      expect(feedback).toContain('Include ALL required fields');
      expect(feedback).toContain('Use correct data types');
      expect(feedback).toContain('Match the agent_name');
      expect(feedback).toContain('ISO 8601 format for timestamps');
    });

    it('should format with clear visual separators', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Test error');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Test'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('━━━'); // Visual separator
      expect(feedback).toContain('=== CURRENT ERROR ===');
      expect(feedback).toContain('=== VALIDATION DETAILS ===');
    });
  });

  describe('retryWithEnhancedFeedback', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should succeed on first attempt with valid output', async () => {
      const validOutput = JSON.stringify({
        agent_name: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        findings: { test: 'data' },
      });

      const agentInvoke = vi
        .fn()
        .mockResolvedValue({ output: validOutput, sessionId: 'test-session-123' });
      const validator = vi.fn().mockReturnValue({
        valid: true,
        errors: [],
        data: { agent_name: 'test', timestamp: '2024-01-01T00:00:00Z', findings: { test: 'data' } },
      });

      const result = await retryWithEnhancedFeedback(agentInvoke, validator);

      expect(result).toBeDefined();
      expect(agentInvoke).toHaveBeenCalledTimes(1);
      expect(agentInvoke).toHaveBeenCalledWith('', undefined); // No feedback on first attempt, no session ID
    });

    it('should retry with feedback on validation failure', async () => {
      const invalidOutput = '{"invalid": "output"}';
      const validOutput = JSON.stringify({
        agent_name: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        findings: { test: 'data' },
      });

      const agentInvoke = vi
        .fn()
        .mockResolvedValueOnce({ output: invalidOutput, sessionId: 'session-1' })
        .mockResolvedValueOnce({ output: validOutput, sessionId: 'session-1' });

      const validator = vi
        .fn()
        .mockReturnValueOnce({
          valid: false,
          errors: ['Missing required field: agent_name'],
        })
        .mockReturnValueOnce({
          valid: true,
          errors: [],
          data: {
            agent_name: 'test',
            timestamp: '2024-01-01T00:00:00Z',
            findings: { test: 'data' },
          },
        });

      const result = await retryWithEnhancedFeedback(agentInvoke, validator, {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBeDefined();
      expect(agentInvoke).toHaveBeenCalledTimes(2);

      // Second call should have feedback
      const secondCallArg = agentInvoke.mock.calls[1][0];
      expect(secondCallArg).toContain('VALIDATION FAILED');
      expect(secondCallArg).toContain('Missing required field: agent_name');
    });

    it('should throw after max retries exceeded', async () => {
      const agentInvoke = vi.fn().mockResolvedValue('{"invalid": "output"}');
      const validator = vi.fn().mockReturnValue({
        valid: false,
        errors: ['Always fails'],
      });

      await expect(
        retryWithEnhancedFeedback(agentInvoke, validator, {
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
          jitter: false,
        }),
      ).rejects.toThrow('Validation failed after 3 attempts');

      expect(agentInvoke).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff between retries', async () => {
      const agentInvoke = vi.fn().mockResolvedValue('{"invalid": "output"}');
      const validator = vi.fn().mockReturnValue({
        valid: false,
        errors: ['Always fails'],
      });

      const start = Date.now();

      await expect(
        retryWithEnhancedFeedback(agentInvoke, validator, {
          maxAttempts: 3,
          initialDelayMs: 50,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitter: false,
        }),
      ).rejects.toThrow();

      const elapsed = Date.now() - start;

      // Should have waited: 50ms (after attempt 1) + 100ms (after attempt 2) = 150ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(140); // Small margin for execution time
    });

    it('should handle agent invocation errors', async () => {
      const agentInvoke = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(
          JSON.stringify({
            agent_name: 'test',
            timestamp: '2024-01-01T00:00:00Z',
            findings: { test: 'data' },
          }),
        );

      const validator = vi.fn().mockReturnValue({
        valid: true,
        errors: [],
        data: { agent_name: 'test', timestamp: '2024-01-01T00:00:00Z', findings: { test: 'data' } },
      });

      const result = await retryWithEnhancedFeedback(agentInvoke, validator, {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBeDefined();
      expect(agentInvoke).toHaveBeenCalledTimes(2);
    });

    it('should build progressive feedback with each retry', async () => {
      const agentInvoke = vi
        .fn()
        .mockResolvedValueOnce('{"error": "1"}')
        .mockResolvedValueOnce('{"error": "2"}')
        .mockResolvedValueOnce(
          JSON.stringify({
            agent_name: 'test',
            timestamp: '2024-01-01T00:00:00Z',
            findings: { test: 'data' },
          }),
        );

      const validator = vi
        .fn()
        .mockReturnValueOnce({
          valid: false,
          errors: ['Missing timestamp'],
        })
        .mockReturnValueOnce({
          valid: false,
          errors: ['Missing agent_name'],
        })
        .mockReturnValueOnce({
          valid: true,
          errors: [],
          data: {
            agent_name: 'test',
            timestamp: '2024-01-01T00:00:00Z',
            findings: { test: 'data' },
          },
        });

      await retryWithEnhancedFeedback(agentInvoke, validator, {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(agentInvoke).toHaveBeenCalledTimes(3);

      // Third call should have more detailed feedback
      const thirdCallArg = agentInvoke.mock.calls[2][0];
      expect(thirdCallArg).toContain('ATTEMPT 2/5');
      expect(thirdCallArg).toContain('PREVIOUS ATTEMPT SUMMARY');
    });

    it('should use custom retry config', async () => {
      const agentInvoke = vi.fn().mockResolvedValue('{"invalid": "output"}');
      const validator = vi.fn().mockReturnValue({
        valid: false,
        errors: ['Always fails'],
      });

      const customConfig = {
        maxAttempts: 2,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 3,
        jitter: false,
      };

      await expect(retryWithEnhancedFeedback(agentInvoke, validator, customConfig)).rejects.toThrow(
        'Validation failed after 2 attempts',
      );

      expect(agentInvoke).toHaveBeenCalledTimes(2);
    });

    it('should include error history in final error message', async () => {
      const agentInvoke = vi.fn().mockResolvedValue('{"invalid": "output"}');
      const validator = vi.fn().mockReturnValue({
        valid: false,
        errors: ['Test error'],
      });

      try {
        await retryWithEnhancedFeedback(agentInvoke, validator, {
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
          jitter: false,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Error history');
        expect((error as Error).message).toContain('Test error');
      }
    });

    it('should not wait after final failed attempt', async () => {
      const agentInvoke = vi.fn().mockResolvedValue('{"invalid": "output"}');
      const validator = vi.fn().mockReturnValue({
        valid: false,
        errors: ['Always fails'],
      });

      const start = Date.now();

      await expect(
        retryWithEnhancedFeedback(agentInvoke, validator, {
          maxAttempts: 2,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitter: false,
        }),
      ).rejects.toThrow();

      const elapsed = Date.now() - start;

      // Should only wait once (after first attempt), not after second (final) attempt
      expect(elapsed).toBeLessThan(250); // 100ms delay + margin, but NOT 300ms
    });
  });

  describe('pattern detection', () => {
    it('should detect schema validation pattern', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Schema validation failed');
      state = updateRetryState(state, 'Schema mismatch detected');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Schema error'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('RECURRING: Schema mismatch');
      expect(feedback).toContain('Review the exact schema requirements');
    });

    it('should not show patterns on first attempt', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'JSON error');

      const validation: ValidationResult = {
        valid: false,
        errors: ['JSON syntax error'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).not.toContain('ERROR PATTERNS DETECTED');
    });

    it('should show multiple detected patterns', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Invalid JSON and missing required field');
      state = updateRetryState(state, 'JSON parse error and required field missing');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Schema validation failed'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('RECURRING: JSON format issues');
      expect(feedback).toContain('RECURRING: Missing required fields');
    });
  });

  describe('schema hints', () => {
    it('should extract missing fields from validation errors', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'Validation failed');

      const validation: ValidationResult = {
        valid: false,
        errors: ['timestamp: Required', 'findings: Required'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).toContain('SCHEMA REQUIREMENTS');
      expect(feedback).toContain('timestamp, findings');
    });

    it('should not show schema hints when no missing fields', () => {
      let state = initRetryState(5);
      state = updateRetryState(state, 'General error');

      const validation: ValidationResult = {
        valid: false,
        errors: ['Unknown error'],
      };

      const feedback = buildEnhancedFeedback(state, validation);

      expect(feedback).not.toContain('SCHEMA REQUIREMENTS');
    });
  });
});
