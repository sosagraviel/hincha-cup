import {
  BaseHook,
  HookContext,
  HookLifecycle,
  HookExecutionResult,
  ErrorAction,
} from './base-hook.js';

/**
 * Hook Registry
 *
 * Manages hook registration and execution
 * Supports:
 * - Multiple hooks per lifecycle
 * - Priority-based execution order
 * - Hook composition (chaining)
 * - Error handling
 * - Conditional execution
 */
export class HookRegistry {
  private hooks: Map<string, BaseHook[]> = new Map();

  /**
   * Register a hook for a specific phase
   *
   * @param phase Phase name (e.g., 'phase4_implementation')
   * @param hook Hook instance to register
   */
  register(phase: string, hook: BaseHook): void {
    const phaseHooks = this.hooks.get(phase) || [];
    phaseHooks.push(hook);

    // Sort by priority (highest first)
    phaseHooks.sort((a, b) => b.priority - a.priority);

    this.hooks.set(phase, phaseHooks);
  }

  /**
   * Register multiple hooks for a phase
   *
   * @param phase Phase name
   * @param hooks Array of hook instances
   */
  registerMany(phase: string, hooks: BaseHook[]): void {
    hooks.forEach((hook) => this.register(phase, hook));
  }

  /**
   * Unregister a hook from a phase
   *
   * @param phase Phase name
   * @param hookName Hook name to unregister
   */
  unregister(phase: string, hookName: string): void {
    const phaseHooks = this.hooks.get(phase) || [];
    const filtered = phaseHooks.filter((h) => h.name !== hookName);
    this.hooks.set(phase, filtered);
  }

  /**
   * Get all hooks registered for a phase
   *
   * @param phase Phase name
   * @returns Array of hooks (sorted by priority)
   */
  getHooks(phase: string): BaseHook[] {
    return this.hooks.get(phase) || [];
  }

  /**
   * Clear all hooks for a phase
   *
   * @param phase Phase name
   */
  clear(phase: string): void {
    this.hooks.delete(phase);
  }

  /**
   * Clear all hooks from registry
   */
  clearAll(): void {
    this.hooks.clear();
  }

  /**
   * Execute preExecution hooks for a phase
   *
   * @param context Hook context
   * @returns Modified context (after all hooks)
   */
  async executePreExecution(context: HookContext): Promise<HookContext> {
    const hooks = this.getHooks(context.phase);
    let currentContext = context;

    for (const hook of hooks) {
      if (!hook.shouldRun(currentContext)) {
        continue;
      }

      if (hook.preExecution) {
        try {
          const result = await hook.preExecution(currentContext);
          if (result) {
            currentContext = result;
          }
        } catch (error) {
          currentContext.logger.warn(
            `Hook ${hook.name} preExecution failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Continue with other hooks
        }
      }
    }

    return currentContext;
  }

  /**
   * Execute postExecution hooks for a phase
   *
   * @param context Hook context with phase output
   * @param result Phase execution result
   * @returns Modified result (after all hooks)
   */
  async executePostExecution(context: HookContext, result: any): Promise<any> {
    const hooks = this.getHooks(context.phase);
    let currentResult = result;

    for (const hook of hooks) {
      if (!hook.shouldRun(context)) {
        continue;
      }

      if (hook.postExecution) {
        try {
          const hookResult = await hook.postExecution(context, currentResult);
          if (hookResult !== undefined) {
            currentResult = hookResult;
          }
        } catch (error) {
          context.logger.warn(
            `Hook ${hook.name} postExecution failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Continue with other hooks
        }
      }
    }

    return currentResult;
  }

  /**
   * Execute onError hooks for a phase
   * Returns the error action with highest priority
   *
   * @param context Hook context with error
   * @param error The error that occurred
   * @returns Error handling action
   */
  async executeOnError(context: HookContext, error: Error): Promise<ErrorAction> {
    const hooks = this.getHooks(context.phase);
    const actions: ErrorAction[] = [];

    for (const hook of hooks) {
      if (!hook.shouldRun(context)) {
        continue;
      }

      if (hook.onError) {
        try {
          const action = await hook.onError(context, error);
          actions.push(action);
        } catch (hookError) {
          context.logger.warn(
            `Hook ${hook.name} onError failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
          );
          // Default to retry if hook fails
          actions.push('retry');
        }
      }
    }

    // Return action with highest priority
    // Priority: fail > skip > continue > retry
    if (actions.includes('fail')) return 'fail';
    if (actions.includes('skip')) return 'skip';
    if (actions.includes('continue')) return 'continue';
    return 'retry'; // Default
  }

  /**
   * Execute onRetry hooks for a phase
   *
   * @param context Hook context with attempt number
   * @param attempt Current retry attempt
   */
  async executeOnRetry(context: HookContext, attempt: number): Promise<void> {
    const hooks = this.getHooks(context.phase);

    for (const hook of hooks) {
      if (!hook.shouldRun(context)) {
        continue;
      }

      if (hook.onRetry) {
        try {
          await hook.onRetry(context, attempt);
        } catch (error) {
          context.logger.warn(
            `Hook ${hook.name} onRetry failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Continue with other hooks
        }
      }
    }
  }

  /**
   * Get hook execution results for a phase
   * Useful for debugging and monitoring
   *
   * @param phase Phase name
   * @param lifecycle Lifecycle to check
   * @returns Array of execution results
   */
  getExecutionResults(phase: string, lifecycle: HookLifecycle): HookExecutionResult[] {
    const hooks = this.getHooks(phase);
    return hooks.map((hook) => ({
      success: true,
      hookName: hook.name,
      lifecycle,
    }));
  }

  /**
   * Check if any hooks are registered for a phase
   *
   * @param phase Phase name
   * @returns true if hooks exist
   */
  hasHooks(phase: string): boolean {
    const hooks = this.getHooks(phase);
    return hooks.length > 0;
  }

  /**
   * Get count of hooks registered for a phase
   *
   * @param phase Phase name
   * @returns Number of hooks
   */
  getHookCount(phase: string): number {
    return this.getHooks(phase).length;
  }

  /**
   * Get all registered phases
   *
   * @returns Array of phase names
   */
  getPhases(): string[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * Export hook registry state for debugging
   *
   * @returns Registry state
   */
  toJSON(): Record<string, string[]> {
    const state: Record<string, string[]> = {};

    for (const [phase, hooks] of this.hooks.entries()) {
      state[phase] = hooks.map((h) => `${h.name} (priority: ${h.priority})`);
    }

    return state;
  }
}

/**
 * Global hook registry instance
 * Shared across the application
 */
export const globalHookRegistry = new HookRegistry();
