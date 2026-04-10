import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseHook,
  type HookContext,
  type ErrorAction,
  type HookLifecycle,
} from '../../../src/hooks/base-hook.js';

// Create a concrete implementation of BaseHook for testing
class TestHook extends BaseHook {
  readonly name = 'test-hook';
  readonly priority = 5;

  // Track method calls for testing
  preExecutionCalled = false;
  postExecutionCalled = false;
  onErrorCalled = false;
  onRetryCalled = false;

  async preExecution(context: HookContext): Promise<HookContext | void> {
    this.preExecutionCalled = true;
    return context;
  }

  async postExecution(context: HookContext, result: any): Promise<any | void> {
    this.postExecutionCalled = true;
    return result;
  }

  async onError(context: HookContext, error: Error): Promise<ErrorAction> {
    this.onErrorCalled = true;
    return 'retry';
  }

  async onRetry(context: HookContext, attempt: number): Promise<void> {
    this.onRetryCalled = true;
  }
}

// Minimal hook implementation (only name required)
class MinimalHook extends BaseHook {
  readonly name = 'minimal-hook';
}

// Hook with custom shouldRun logic
class ConditionalHook extends BaseHook {
  readonly name = 'conditional-hook';
  private condition: (context: HookContext) => boolean;

  constructor(condition: (context: HookContext) => boolean) {
    super();
    this.condition = condition;
  }

  shouldRun(context: HookContext): boolean {
    return this.condition(context);
  }
}

describe('BaseHook', () => {
  let mockContext: HookContext;

  beforeEach(() => {
    mockContext = {
      phase: 'phase4_implementation',
      ticketId: 'TICKET-123',
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      tempDir: '/tmp/test',
      timestamp: '2024-01-01T00:00:00Z',
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
      },
    };
  });

  describe('abstract properties', () => {
    it('should have name property', () => {
      const hook = new TestHook();
      expect(hook.name).toBe('test-hook');
    });

    it('should have priority property with default value', () => {
      const minimalHook = new MinimalHook();
      expect(minimalHook.priority).toBe(0);
    });

    it('should allow custom priority', () => {
      const hook = new TestHook();
      expect(hook.priority).toBe(5);
    });
  });

  describe('preExecution', () => {
    it('should be optional and default to no-op', async () => {
      const hook = new MinimalHook();

      // Should not throw and return void
      const result = await hook.preExecution?.(mockContext);

      expect(result).toBeUndefined();
    });

    it('should be callable when implemented', async () => {
      const hook = new TestHook();

      const result = await hook.preExecution?.(mockContext);

      expect(hook.preExecutionCalled).toBe(true);
      expect(result).toEqual(mockContext);
    });

    it('should allow context modification', async () => {
      class ModifyingHook extends BaseHook {
        readonly name = 'modifying-hook';

        async preExecution(context: HookContext): Promise<HookContext> {
          return {
            ...context,
            phaseInput: { modified: true },
          };
        }
      }

      const hook = new ModifyingHook();
      const result = await hook.preExecution(mockContext);

      expect(result).toBeDefined();
      expect(result.phaseInput).toEqual({ modified: true });
    });

    it('should handle context with phaseInput', async () => {
      const contextWithInput: HookContext = {
        ...mockContext,
        phaseInput: { existing: 'data' },
      };

      class InputHook extends BaseHook {
        readonly name = 'input-hook';

        async preExecution(context: HookContext): Promise<HookContext> {
          expect(context.phaseInput).toEqual({ existing: 'data' });
          return context;
        }
      }

      const hook = new InputHook();
      await hook.preExecution(contextWithInput);
    });
  });

  describe('postExecution', () => {
    it('should be optional and default to no-op', async () => {
      const hook = new MinimalHook();

      const result = await hook.postExecution?.(mockContext, { success: true });

      expect(result).toBeUndefined();
    });

    it('should be callable when implemented', async () => {
      const hook = new TestHook();
      const phaseResult = { data: 'test result' };

      const result = await hook.postExecution?.(mockContext, phaseResult);

      expect(hook.postExecutionCalled).toBe(true);
      expect(result).toEqual(phaseResult);
    });

    it('should allow result modification', async () => {
      class TransformingHook extends BaseHook {
        readonly name = 'transforming-hook';

        async postExecution(context: HookContext, result: any): Promise<any> {
          return {
            ...result,
            transformed: true,
            timestamp: context.timestamp,
          };
        }
      }

      const hook = new TransformingHook();
      const originalResult = { data: 'original' };
      const transformedResult = await hook.postExecution(mockContext, originalResult);

      expect(transformedResult.data).toBe('original');
      expect(transformedResult.transformed).toBe(true);
      expect(transformedResult.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('should handle context with phaseOutput', async () => {
      const contextWithOutput: HookContext = {
        ...mockContext,
        phaseOutput: { outputData: 'test' },
      };

      class OutputHook extends BaseHook {
        readonly name = 'output-hook';

        async postExecution(context: HookContext, result: any): Promise<any> {
          expect(context.phaseOutput).toEqual({ outputData: 'test' });
          return result;
        }
      }

      const hook = new OutputHook();
      await hook.postExecution(contextWithOutput, {});
    });
  });

  describe('onError', () => {
    it('should default to retry action', async () => {
      const hook = new MinimalHook();
      const error = new Error('Test error');

      const action = await hook.onError?.(mockContext, error);

      expect(action).toBe('retry');
    });

    it('should be callable when implemented', async () => {
      const hook = new TestHook();
      const error = new Error('Test error');

      const action = await hook.onError?.(mockContext, error);

      expect(hook.onErrorCalled).toBe(true);
      expect(action).toBe('retry');
    });

    it('should support all error actions', async () => {
      const actions: ErrorAction[] = ['retry', 'continue', 'fail', 'skip'];

      for (const expectedAction of actions) {
        class CustomErrorHook extends BaseHook {
          readonly name = `error-hook-${expectedAction}`;

          async onError(context: HookContext, error: Error): Promise<ErrorAction> {
            return expectedAction;
          }
        }

        const hook = new CustomErrorHook();
        const error = new Error('Test error');
        const action = await hook.onError(mockContext, error);

        expect(action).toBe(expectedAction);
      }
    });

    it('should receive error in context', async () => {
      const testError = new Error('Specific error message');
      const contextWithError: HookContext = {
        ...mockContext,
        error: testError,
      };

      class ErrorCheckHook extends BaseHook {
        readonly name = 'error-check-hook';

        async onError(context: HookContext, error: Error): Promise<ErrorAction> {
          expect(context.error).toBe(testError);
          expect(error.message).toBe('Specific error message');
          return 'fail';
        }
      }

      const hook = new ErrorCheckHook();
      await hook.onError(contextWithError, testError);
    });

    it('should allow conditional error handling', async () => {
      class SmartErrorHook extends BaseHook {
        readonly name = 'smart-error-hook';

        async onError(context: HookContext, error: Error): Promise<ErrorAction> {
          if (error.message.includes('network')) {
            return 'retry';
          } else if (error.message.includes('validation')) {
            return 'fail';
          } else {
            return 'skip';
          }
        }
      }

      const hook = new SmartErrorHook();

      expect(await hook.onError(mockContext, new Error('network timeout'))).toBe('retry');
      expect(await hook.onError(mockContext, new Error('validation failed'))).toBe('fail');
      expect(await hook.onError(mockContext, new Error('unknown error'))).toBe('skip');
    });
  });

  describe('onRetry', () => {
    it('should be optional and default to no-op', async () => {
      const hook = new MinimalHook();

      // Should not throw
      const result = await hook.onRetry?.(mockContext, 1);

      expect(result).toBeUndefined();
    });

    it('should be callable when implemented', async () => {
      const hook = new TestHook();

      await hook.onRetry?.(mockContext, 2);

      expect(hook.onRetryCalled).toBe(true);
    });

    it('should receive attempt number', async () => {
      class AttemptTrackingHook extends BaseHook {
        readonly name = 'attempt-tracking-hook';
        attempts: number[] = [];

        async onRetry(context: HookContext, attempt: number): Promise<void> {
          this.attempts.push(attempt);
        }
      }

      const hook = new AttemptTrackingHook();

      await hook.onRetry(mockContext, 1);
      await hook.onRetry(mockContext, 2);
      await hook.onRetry(mockContext, 3);

      expect(hook.attempts).toEqual([1, 2, 3]);
    });

    it('should receive attempt in context', async () => {
      const contextWithAttempt: HookContext = {
        ...mockContext,
        attempt: 3,
      };

      class RetryCheckHook extends BaseHook {
        readonly name = 'retry-check-hook';

        async onRetry(context: HookContext, attempt: number): Promise<void> {
          expect(context.attempt).toBe(3);
          expect(attempt).toBe(3);
        }
      }

      const hook = new RetryCheckHook();
      await hook.onRetry(contextWithAttempt, 3);
    });

    it('should support logging during retry', async () => {
      class LoggingRetryHook extends BaseHook {
        readonly name = 'logging-retry-hook';

        async onRetry(context: HookContext, attempt: number): Promise<void> {
          context.logger.warn(`Retrying phase ${context.phase}, attempt ${attempt}`);
        }
      }

      const hook = new LoggingRetryHook();
      await hook.onRetry(mockContext, 2);

      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Retrying phase phase4_implementation, attempt 2',
      );
    });
  });

  describe('shouldRun', () => {
    it('should default to always true', () => {
      const hook = new MinimalHook();

      expect(hook.shouldRun(mockContext)).toBe(true);
    });

    it('should be overridable for conditional execution', () => {
      const alwaysRun = new ConditionalHook(() => true);
      const neverRun = new ConditionalHook(() => false);

      expect(alwaysRun.shouldRun(mockContext)).toBe(true);
      expect(neverRun.shouldRun(mockContext)).toBe(false);
    });

    it('should support phase-based conditions', () => {
      const onlyPhase4 = new ConditionalHook(
        (context) => context.phase === 'phase4_implementation',
      );
      const onlyPhase5 = new ConditionalHook((context) => context.phase === 'phase5_testing');

      expect(onlyPhase4.shouldRun(mockContext)).toBe(true);
      expect(onlyPhase5.shouldRun(mockContext)).toBe(false);
    });

    it('should support complex conditions', () => {
      const conditionalHook = new ConditionalHook((context) => {
        return context.phase.startsWith('phase') && context.ticketId.startsWith('TICKET-');
      });

      expect(conditionalHook.shouldRun(mockContext)).toBe(true);

      const invalidContext = {
        ...mockContext,
        ticketId: 'INVALID-123',
      };
      expect(conditionalHook.shouldRun(invalidContext)).toBe(false);
    });
  });

  describe('logger integration', () => {
    it('should provide logger in context', () => {
      expect(mockContext.logger).toBeDefined();
      expect(mockContext.logger.info).toBeDefined();
      expect(mockContext.logger.warn).toBeDefined();
      expect(mockContext.logger.error).toBeDefined();
      expect(mockContext.logger.success).toBeDefined();
    });

    it('should allow hooks to use logger', async () => {
      class LoggingHook extends BaseHook {
        readonly name = 'logging-hook';

        async preExecution(context: HookContext): Promise<void> {
          context.logger.info(`Pre-execution for ${context.phase}`);
        }
      }

      const hook = new LoggingHook();
      await hook.preExecution(mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Pre-execution for phase4_implementation',
      );
    });
  });

  describe('context properties', () => {
    it('should include all required properties', () => {
      expect(mockContext.phase).toBe('phase4_implementation');
      expect(mockContext.ticketId).toBe('TICKET-123');
      expect(mockContext.projectPath).toBe('/test/project');
      expect(mockContext.frameworkPath).toBe('/test/framework');
      expect(mockContext.tempDir).toBe('/tmp/test');
      expect(mockContext.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('should support optional properties', () => {
      const fullContext: HookContext = {
        ...mockContext,
        phaseInput: { input: 'data' },
        phaseOutput: { output: 'data' },
        error: new Error('test'),
        attempt: 2,
      };

      expect(fullContext.phaseInput).toEqual({ input: 'data' });
      expect(fullContext.phaseOutput).toEqual({ output: 'data' });
      expect(fullContext.error).toBeInstanceOf(Error);
      expect(fullContext.attempt).toBe(2);
    });
  });

  describe('type definitions', () => {
    it('should define ErrorAction type correctly', () => {
      const actions: ErrorAction[] = ['retry', 'continue', 'fail', 'skip'];

      // TypeScript will catch if these aren't valid ErrorAction values
      expect(actions).toHaveLength(4);
    });

    it('should define HookLifecycle type correctly', () => {
      const lifecycles: HookLifecycle[] = ['preExecution', 'postExecution', 'onError', 'onRetry'];

      expect(lifecycles).toHaveLength(4);
    });
  });

  describe('inheritance and extensibility', () => {
    it('should allow multiple hook implementations', () => {
      class HookA extends BaseHook {
        readonly name = 'hook-a';
      }

      class HookB extends BaseHook {
        readonly name = 'hook-b';
        readonly priority = 10;
      }

      const hookA = new HookA();
      const hookB = new HookB();

      expect(hookA.name).toBe('hook-a');
      expect(hookB.name).toBe('hook-b');
      expect(hookA.priority).toBe(0);
      expect(hookB.priority).toBe(10);
    });

    it('should support selective lifecycle implementation', () => {
      class OnlyErrorHook extends BaseHook {
        readonly name = 'only-error-hook';

        async onError(context: HookContext, error: Error): Promise<ErrorAction> {
          return 'fail';
        }
      }

      const hook = new OnlyErrorHook();

      expect(hook.preExecution).toBeDefined();
      expect(hook.postExecution).toBeDefined();
      expect(hook.onError).toBeDefined();
      expect(hook.onRetry).toBeDefined();
    });

    it('should allow hooks to maintain state', async () => {
      class StatefulHook extends BaseHook {
        readonly name = 'stateful-hook';
        private executionCount = 0;

        async preExecution(context: HookContext): Promise<void> {
          this.executionCount++;
        }

        getExecutionCount(): number {
          return this.executionCount;
        }
      }

      const hook = new StatefulHook();

      await hook.preExecution(mockContext);
      await hook.preExecution(mockContext);
      await hook.preExecution(mockContext);

      expect(hook.getExecutionCount()).toBe(3);
    });
  });
});
