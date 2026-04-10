/**
 * Base Hook System for Implement-Ticket Workflow
 *
 * Provides lifecycle hooks for phases:
 * - preExecution: Before phase runs
 * - postExecution: After phase succeeds
 * - onError: When phase fails
 * - onRetry: Before retry attempt
 *
 * Each hook can:
 * - Transform context
 * - Validate inputs/outputs
 * - Auto-fix common issues
 * - Decide error handling strategy
 */

/**
 * Hook context passed to all lifecycle methods
 * Contains phase state, config, and utilities
 */
export interface HookContext {
  phase: string; // e.g., 'phase4_implementation'
  ticketId: string;

  // Paths
  projectPath: string;
  frameworkPath: string;
  tempDir: string;

  phaseInput?: any; // Data from previous phase's disk output
  phaseOutput?: any; // Current phase's output (for postExecution)

  error?: Error;
  attempt?: number; // Current retry attempt

  timestamp: string;

  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    success: (message: string) => void;
  };
}

/**
 * Error action returned by onError hook
 * Determines how to handle the error
 */
export type ErrorAction =
  | 'retry' // Retry the phase
  | 'continue' // Continue to next phase despite error
  | 'fail' // Fail the entire workflow
  | 'skip'; // Skip this phase

/**
 * Abstract base class for all hooks
 * Subclasses implement lifecycle methods as needed
 */
export abstract class BaseHook {
  /**
   * Unique hook name for identification
   */
  abstract readonly name: string;

  /**
   * Hook priority (higher = runs first)
   * Default: 0
   */
  readonly priority: number = 0;

  /**
   * Hook execution before phase starts
   * Can modify context or validate inputs
   *
   * @param context Hook context
   * @returns Modified context or void
   */
  async preExecution?(context: HookContext): Promise<HookContext | void> {
    // Default: no-op
  }

  /**
   * Hook execution after phase succeeds
   * Can validate outputs or perform cleanup
   *
   * @param context Hook context with phase output
   * @param result Phase execution result
   * @returns Modified result or void
   */
  async postExecution?(context: HookContext, result: any): Promise<any | void> {
    // Default: no-op
  }

  /**
   * Hook execution when phase fails
   * Decides how to handle the error
   *
   * @param context Hook context with error
   * @param error The error that occurred
   * @returns Error handling action
   */
  async onError?(context: HookContext, error: Error): Promise<ErrorAction> {
    // Default: retry
    return 'retry';
  }

  /**
   * Hook execution before retry attempt
   * Can provide feedback or modify retry behavior
   *
   * @param context Hook context with attempt number
   * @param attempt Current retry attempt (1-indexed)
   */
  async onRetry?(context: HookContext, attempt: number): Promise<void> {
    // Default: no-op
  }

  /**
   * Check if this hook should run for the given context
   * Useful for conditional hooks
   *
   * @param context Hook context
   * @returns true if hook should run
   */
  shouldRun(context: HookContext): boolean {
    // Default: always run
    return true;
  }
}

/**
 * Utility type for hook lifecycle method names
 */
export type HookLifecycle = 'preExecution' | 'postExecution' | 'onError' | 'onRetry';

/**
 * Hook execution result
 */
export interface HookExecutionResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  hookName: string;
  lifecycle: HookLifecycle;
}
