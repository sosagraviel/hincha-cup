/**
 * Hook System for Implement-Ticket Workflow
 *
 * Provides lifecycle hooks for all phases with:
 * - Pre/post execution hooks
 * - Error handling hooks
 * - Retry hooks
 * - Priority-based execution
 * - Hook composition
 */

export {
  BaseHook,
  HookContext,
  ErrorAction,
  HookLifecycle,
  HookExecutionResult
} from './base-hook.js';

export {
  HookRegistry,
  globalHookRegistry
} from './hook-registry.js';
