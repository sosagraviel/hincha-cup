import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRegistry, globalHookRegistry } from '../../../src/hooks/hook-registry.js';
import { BaseHook, type HookContext, type ErrorAction } from '../../../src/hooks/base-hook.js';

// Test hook implementations
class TestHook extends BaseHook {
  readonly name = 'test-hook';
  readonly priority = 5;

  preExecutionCalled = false;
  postExecutionCalled = false;
  onErrorCalled = false;
  onRetryCalled = false;

  async preExecution(context: HookContext): Promise<HookContext> {
    this.preExecutionCalled = true;
    return { ...context, phaseInput: { modified: 'pre' } };
  }

  async postExecution(context: HookContext, result: any): Promise<any> {
    this.postExecutionCalled = true;
    return { ...result, modified: 'post' };
  }

  async onError(context: HookContext, error: Error): Promise<ErrorAction> {
    this.onErrorCalled = true;
    return 'retry';
  }

  async onRetry(context: HookContext, attempt: number): Promise<void> {
    this.onRetryCalled = true;
  }
}

class HighPriorityHook extends BaseHook {
  readonly name = 'high-priority-hook';
  readonly priority = 100;
}

class LowPriorityHook extends BaseHook {
  readonly name = 'low-priority-hook';
  readonly priority = 1;
}

class ConditionalHook extends BaseHook {
  readonly name = 'conditional-hook';
  private condition: boolean;

  constructor(condition: boolean) {
    super();
    this.condition = condition;
  }

  shouldRun(context: HookContext): boolean {
    return this.condition;
  }

  async preExecution(context: HookContext): Promise<HookContext> {
    return { ...context, phaseInput: { conditional: true } };
  }
}

class ThrowingHook extends BaseHook {
  readonly name = 'throwing-hook';

  async preExecution(context: HookContext): Promise<HookContext> {
    throw new Error('PreExecution failed');
  }

  async postExecution(context: HookContext, result: any): Promise<any> {
    throw new Error('PostExecution failed');
  }

  async onError(context: HookContext, error: Error): Promise<ErrorAction> {
    throw new Error('OnError failed');
  }

  async onRetry(context: HookContext, attempt: number): Promise<void> {
    throw new Error('OnRetry failed');
  }
}

class ErrorActionHook extends BaseHook {
  readonly name: string;
  private action: ErrorAction;

  constructor(name: string, action: ErrorAction) {
    super();
    this.name = name;
    this.action = action;
  }

  async onError(context: HookContext, error: Error): Promise<ErrorAction> {
    return this.action;
  }
}

describe('HookRegistry', () => {
  let registry: HookRegistry;
  let mockContext: HookContext;

  beforeEach(() => {
    registry = new HookRegistry();
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
        success: vi.fn()
      }
    };
  });

  describe('register', () => {
    it('should register a hook for a phase', () => {
      const hook = new TestHook();
      registry.register('phase4_implementation', hook);

      const hooks = registry.getHooks('phase4_implementation');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hook);
    });

    it('should register multiple hooks for same phase', () => {
      const hook1 = new TestHook();
      const hook2 = new HighPriorityHook();

      registry.register('phase4_implementation', hook1);
      registry.register('phase4_implementation', hook2);

      const hooks = registry.getHooks('phase4_implementation');
      expect(hooks).toHaveLength(2);
    });

    it('should sort hooks by priority (highest first)', () => {
      const lowPriority = new LowPriorityHook();
      const highPriority = new HighPriorityHook();
      const mediumPriority = new TestHook();

      registry.register('phase4_implementation', lowPriority);
      registry.register('phase4_implementation', highPriority);
      registry.register('phase4_implementation', mediumPriority);

      const hooks = registry.getHooks('phase4_implementation');
      expect(hooks[0].name).toBe('high-priority-hook'); // priority 100
      expect(hooks[1].name).toBe('test-hook'); // priority 5
      expect(hooks[2].name).toBe('low-priority-hook'); // priority 1
    });

    it('should handle multiple phases', () => {
      const hook1 = new TestHook();
      const hook2 = new HighPriorityHook();

      registry.register('phase4_implementation', hook1);
      registry.register('phase5_testing', hook2);

      expect(registry.getHooks('phase4_implementation')).toHaveLength(1);
      expect(registry.getHooks('phase5_testing')).toHaveLength(1);
    });
  });

  describe('registerMany', () => {
    it('should register multiple hooks at once', () => {
      const hooks = [new TestHook(), new HighPriorityHook(), new LowPriorityHook()];

      registry.registerMany('phase4_implementation', hooks);

      expect(registry.getHooks('phase4_implementation')).toHaveLength(3);
    });

    it('should maintain priority ordering', () => {
      const hooks = [new LowPriorityHook(), new HighPriorityHook(), new TestHook()];

      registry.registerMany('phase4_implementation', hooks);

      const registered = registry.getHooks('phase4_implementation');
      expect(registered[0].priority).toBeGreaterThanOrEqual(registered[1].priority);
      expect(registered[1].priority).toBeGreaterThanOrEqual(registered[2].priority);
    });

    it('should handle empty array', () => {
      registry.registerMany('phase4_implementation', []);

      expect(registry.getHooks('phase4_implementation')).toHaveLength(0);
    });
  });

  describe('unregister', () => {
    it('should unregister hook by name', () => {
      const hook = new TestHook();
      registry.register('phase4_implementation', hook);

      registry.unregister('phase4_implementation', 'test-hook');

      expect(registry.getHooks('phase4_implementation')).toHaveLength(0);
    });

    it('should only remove specified hook', () => {
      const hook1 = new TestHook();
      const hook2 = new HighPriorityHook();

      registry.register('phase4_implementation', hook1);
      registry.register('phase4_implementation', hook2);

      registry.unregister('phase4_implementation', 'test-hook');

      const hooks = registry.getHooks('phase4_implementation');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('high-priority-hook');
    });

    it('should handle unregistering non-existent hook', () => {
      registry.unregister('phase4_implementation', 'non-existent');

      expect(registry.getHooks('phase4_implementation')).toHaveLength(0);
    });
  });

  describe('getHooks', () => {
    it('should return empty array for phase with no hooks', () => {
      const hooks = registry.getHooks('non-existent-phase');

      expect(hooks).toEqual([]);
    });

    it('should return hooks in priority order', () => {
      const hooks = [new LowPriorityHook(), new TestHook(), new HighPriorityHook()];
      registry.registerMany('phase4_implementation', hooks);

      const retrieved = registry.getHooks('phase4_implementation');

      expect(retrieved[0].priority).toBe(100);
      expect(retrieved[1].priority).toBe(5);
      expect(retrieved[2].priority).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all hooks for a phase', () => {
      registry.registerMany('phase4_implementation', [new TestHook(), new HighPriorityHook()]);

      registry.clear('phase4_implementation');

      expect(registry.getHooks('phase4_implementation')).toHaveLength(0);
    });

    it('should not affect other phases', () => {
      registry.register('phase4_implementation', new TestHook());
      registry.register('phase5_testing', new HighPriorityHook());

      registry.clear('phase4_implementation');

      expect(registry.getHooks('phase4_implementation')).toHaveLength(0);
      expect(registry.getHooks('phase5_testing')).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all hooks from all phases', () => {
      registry.register('phase4_implementation', new TestHook());
      registry.register('phase5_testing', new HighPriorityHook());
      registry.register('phase6_documentation', new LowPriorityHook());

      registry.clearAll();

      expect(registry.getHooks('phase4_implementation')).toHaveLength(0);
      expect(registry.getHooks('phase5_testing')).toHaveLength(0);
      expect(registry.getHooks('phase6_documentation')).toHaveLength(0);
    });
  });

  describe('executePreExecution', () => {
    it('should execute all preExecution hooks', async () => {
      const hook = new TestHook();
      registry.register('phase4_implementation', hook);

      await registry.executePreExecution(mockContext);

      expect(hook.preExecutionCalled).toBe(true);
    });

    it('should chain context modifications', async () => {
      class Hook1 extends BaseHook {
        readonly name = 'hook1';
        async preExecution(context: HookContext): Promise<HookContext> {
          return { ...context, phaseInput: { step: 1 } };
        }
      }

      class Hook2 extends BaseHook {
        readonly name = 'hook2';
        async preExecution(context: HookContext): Promise<HookContext> {
          return {
            ...context,
            phaseInput: { ...(context.phaseInput || {}), step: 2 }
          };
        }
      }

      registry.register('phase4_implementation', new Hook1());
      registry.register('phase4_implementation', new Hook2());

      const result = await registry.executePreExecution(mockContext);

      expect(result.phaseInput).toEqual({ step: 2 });
    });

    it('should skip hooks that should not run', async () => {
      const shouldRun = new ConditionalHook(true);
      const shouldNotRun = new ConditionalHook(false);

      registry.register('phase4_implementation', shouldRun);
      registry.register('phase4_implementation', shouldNotRun);

      const result = await registry.executePreExecution(mockContext);

      expect(result.phaseInput).toEqual({ conditional: true });
    });

    it('should handle hooks without preExecution method', async () => {
      class NoPreHook extends BaseHook {
        readonly name = 'no-pre-hook';
      }

      registry.register('phase4_implementation', new NoPreHook());

      const result = await registry.executePreExecution(mockContext);

      expect(result).toBeDefined();
    });

    it('should handle hook errors gracefully', async () => {
      const throwingHook = new ThrowingHook();
      const normalHook = new TestHook();

      registry.register('phase4_implementation', throwingHook);
      registry.register('phase4_implementation', normalHook);

      const result = await registry.executePreExecution(mockContext);

      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('throwing-hook')
      );
      expect(normalHook.preExecutionCalled).toBe(true);
    });

    it('should preserve context when hook returns void', async () => {
      class VoidHook extends BaseHook {
        readonly name = 'void-hook';
        async preExecution(context: HookContext): Promise<void> {
          // Return void
        }
      }

      registry.register('phase4_implementation', new VoidHook());

      const result = await registry.executePreExecution(mockContext);

      expect(result).toEqual(mockContext);
    });
  });

  describe('executePostExecution', () => {
    it('should execute all postExecution hooks', async () => {
      const hook = new TestHook();
      registry.register('phase4_implementation', hook);

      await registry.executePostExecution(mockContext, { data: 'test' });

      expect(hook.postExecutionCalled).toBe(true);
    });

    it('should chain result modifications', async () => {
      class Hook1 extends BaseHook {
        readonly name = 'hook1';
        async postExecution(context: HookContext, result: any): Promise<any> {
          return { ...result, step1: true };
        }
      }

      class Hook2 extends BaseHook {
        readonly name = 'hook2';
        async postExecution(context: HookContext, result: any): Promise<any> {
          return { ...result, step2: true };
        }
      }

      registry.register('phase4_implementation', new Hook1());
      registry.register('phase4_implementation', new Hook2());

      const result = await registry.executePostExecution(mockContext, { original: true });

      expect(result).toEqual({ original: true, step1: true, step2: true });
    });

    it('should skip hooks that should not run', async () => {
      const shouldNotRun = new ConditionalHook(false);
      registry.register('phase4_implementation', shouldNotRun);

      const result = await registry.executePostExecution(mockContext, { data: 'test' });

      expect(result).toEqual({ data: 'test' });
    });

    it('should handle hooks without postExecution method', async () => {
      class NoPostHook extends BaseHook {
        readonly name = 'no-post-hook';
      }

      registry.register('phase4_implementation', new NoPostHook());

      const result = await registry.executePostExecution(mockContext, { data: 'test' });

      expect(result).toEqual({ data: 'test' });
    });

    it('should handle hook errors gracefully', async () => {
      const throwingHook = new ThrowingHook();
      registry.register('phase4_implementation', throwingHook);

      const result = await registry.executePostExecution(mockContext, { data: 'test' });

      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('throwing-hook')
      );
    });

    it('should preserve result when hook returns undefined', async () => {
      class UndefinedHook extends BaseHook {
        readonly name = 'undefined-hook';
        async postExecution(context: HookContext, result: any): Promise<undefined> {
          return undefined;
        }
      }

      registry.register('phase4_implementation', new UndefinedHook());

      const originalResult = { data: 'test' };
      const result = await registry.executePostExecution(mockContext, originalResult);

      expect(result).toEqual(originalResult);
    });
  });

  describe('executeOnError', () => {
    it('should execute all onError hooks', async () => {
      const hook = new TestHook();
      registry.register('phase4_implementation', hook);

      await registry.executeOnError(mockContext, new Error('test'));

      expect(hook.onErrorCalled).toBe(true);
    });

    it('should return fail action with highest priority', async () => {
      registry.register('phase4_implementation', new ErrorActionHook('retry-hook', 'retry'));
      registry.register('phase4_implementation', new ErrorActionHook('fail-hook', 'fail'));
      registry.register('phase4_implementation', new ErrorActionHook('continue-hook', 'continue'));

      const action = await registry.executeOnError(mockContext, new Error('test'));

      expect(action).toBe('fail');
    });

    it('should return skip when no fail actions', async () => {
      registry.register('phase4_implementation', new ErrorActionHook('retry-hook', 'retry'));
      registry.register('phase4_implementation', new ErrorActionHook('skip-hook', 'skip'));
      registry.register('phase4_implementation', new ErrorActionHook('continue-hook', 'continue'));

      const action = await registry.executeOnError(mockContext, new Error('test'));

      expect(action).toBe('skip');
    });

    it('should return continue when no fail or skip actions', async () => {
      registry.register('phase4_implementation', new ErrorActionHook('retry1', 'retry'));
      registry.register('phase4_implementation', new ErrorActionHook('continue-hook', 'continue'));
      registry.register('phase4_implementation', new ErrorActionHook('retry2', 'retry'));

      const action = await registry.executeOnError(mockContext, new Error('test'));

      expect(action).toBe('continue');
    });

    it('should return retry as default', async () => {
      registry.register('phase4_implementation', new ErrorActionHook('retry1', 'retry'));
      registry.register('phase4_implementation', new ErrorActionHook('retry2', 'retry'));

      const action = await registry.executeOnError(mockContext, new Error('test'));

      expect(action).toBe('retry');
    });

    it('should return retry when no hooks registered', async () => {
      const action = await registry.executeOnError(mockContext, new Error('test'));

      expect(action).toBe('retry');
    });

    it('should handle hook errors gracefully', async () => {
      const throwingHook = new ThrowingHook();
      registry.register('phase4_implementation', throwingHook);

      const action = await registry.executeOnError(mockContext, new Error('test'));

      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('throwing-hook')
      );
      expect(action).toBe('retry'); // Falls back to retry
    });

    it('should skip hooks that should not run', async () => {
      const shouldNotRun = new ConditionalHook(false);
      registry.register('phase4_implementation', shouldNotRun);

      const action = await registry.executeOnError(mockContext, new Error('test'));

      expect(action).toBe('retry');
    });
  });

  describe('executeOnRetry', () => {
    it('should execute all onRetry hooks', async () => {
      const hook = new TestHook();
      registry.register('phase4_implementation', hook);

      await registry.executeOnRetry(mockContext, 2);

      expect(hook.onRetryCalled).toBe(true);
    });

    it('should pass attempt number to hooks', async () => {
      let receivedAttempt = 0;

      class RetryHook extends BaseHook {
        readonly name = 'retry-hook';
        async onRetry(context: HookContext, attempt: number): Promise<void> {
          receivedAttempt = attempt;
        }
      }

      registry.register('phase4_implementation', new RetryHook());

      await registry.executeOnRetry(mockContext, 3);

      expect(receivedAttempt).toBe(3);
    });

    it('should handle hooks without onRetry method', async () => {
      class NoRetryHook extends BaseHook {
        readonly name = 'no-retry-hook';
      }

      registry.register('phase4_implementation', new NoRetryHook());

      // Should not throw
      await registry.executeOnRetry(mockContext, 1);
    });

    it('should handle hook errors gracefully', async () => {
      const throwingHook = new ThrowingHook();
      registry.register('phase4_implementation', throwingHook);

      await registry.executeOnRetry(mockContext, 1);

      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('throwing-hook')
      );
    });

    it('should skip hooks that should not run', async () => {
      const shouldNotRun = new ConditionalHook(false);
      registry.register('phase4_implementation', shouldNotRun);

      // Should not throw
      await registry.executeOnRetry(mockContext, 1);
    });
  });

  describe('getExecutionResults', () => {
    it('should return execution results for registered hooks', () => {
      registry.register('phase4_implementation', new TestHook());
      registry.register('phase4_implementation', new HighPriorityHook());

      const results = registry.getExecutionResults('phase4_implementation', 'preExecution');

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].lifecycle).toBe('preExecution');
    });

    it('should return empty array for phase with no hooks', () => {
      const results = registry.getExecutionResults('non-existent', 'preExecution');

      expect(results).toEqual([]);
    });

    it('should include hook names in results', () => {
      registry.register('phase4_implementation', new TestHook());

      const results = registry.getExecutionResults('phase4_implementation', 'postExecution');

      expect(results[0].hookName).toBe('test-hook');
    });
  });

  describe('hasHooks', () => {
    it('should return true when hooks are registered', () => {
      registry.register('phase4_implementation', new TestHook());

      expect(registry.hasHooks('phase4_implementation')).toBe(true);
    });

    it('should return false when no hooks are registered', () => {
      expect(registry.hasHooks('non-existent')).toBe(false);
    });
  });

  describe('getHookCount', () => {
    it('should return count of registered hooks', () => {
      registry.register('phase4_implementation', new TestHook());
      registry.register('phase4_implementation', new HighPriorityHook());

      expect(registry.getHookCount('phase4_implementation')).toBe(2);
    });

    it('should return 0 for phase with no hooks', () => {
      expect(registry.getHookCount('non-existent')).toBe(0);
    });
  });

  describe('getPhases', () => {
    it('should return all registered phases', () => {
      registry.register('phase4_implementation', new TestHook());
      registry.register('phase5_testing', new HighPriorityHook());
      registry.register('phase6_documentation', new LowPriorityHook());

      const phases = registry.getPhases();

      expect(phases).toHaveLength(3);
      expect(phases).toContain('phase4_implementation');
      expect(phases).toContain('phase5_testing');
      expect(phases).toContain('phase6_documentation');
    });

    it('should return empty array when no hooks registered', () => {
      const phases = registry.getPhases();

      expect(phases).toEqual([]);
    });
  });

  describe('toJSON', () => {
    it('should export registry state', () => {
      registry.register('phase4_implementation', new TestHook());
      registry.register('phase4_implementation', new HighPriorityHook());

      const state = registry.toJSON();

      expect(state['phase4_implementation']).toBeDefined();
      expect(state['phase4_implementation']).toHaveLength(2);
    });

    it('should include hook names and priorities', () => {
      registry.register('phase4_implementation', new TestHook());

      const state = registry.toJSON();

      expect(state['phase4_implementation'][0]).toContain('test-hook');
      expect(state['phase4_implementation'][0]).toContain('priority: 5');
    });

    it('should return empty object when no hooks registered', () => {
      const state = registry.toJSON();

      expect(state).toEqual({});
    });
  });

  describe('globalHookRegistry', () => {
    it('should export a global registry instance', () => {
      expect(globalHookRegistry).toBeInstanceOf(HookRegistry);
    });

    it('should be available for use', () => {
      // Global registry should be accessible and usable
      globalHookRegistry.register('test-phase', new TestHook());
      expect(globalHookRegistry.hasHooks('test-phase')).toBe(true);

      // Clean up
      globalHookRegistry.clear('test-phase');
    });
  });
});
