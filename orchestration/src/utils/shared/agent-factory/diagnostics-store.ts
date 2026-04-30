/**
 * Legacy shim. The real implementation moved to
 * `services/framework/debug-store/` under a new, structured API. This file
 * preserves a couple of symbols older code may still import.
 *
 * New code MUST NOT import from this module — use the debug-store package via
 * `services/framework/debug-store/index.ts`, or
 * `agent-factory/attempt-recorder.ts` for per-attempt writes.
 */

export {
  isDebugEnabled,
  summarizeCliError,
} from '../../../services/framework/debug-store/index.js';
