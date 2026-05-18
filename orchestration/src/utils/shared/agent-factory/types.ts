import { AuthMode } from '../../../auth/auth-detector.js';
import type { ValidationResult } from '../../validator.js';
import type { PhaseSlot } from '../../../services/framework/debug-store/index.js';
import type { BudgetKey } from '../../../services/framework/budgets.js';

export interface AgentConfig {
  agentName: string;
  agentFilePath: string;
  projectPath: string;
  frameworkPath: string;
  timeout?: number;
  resumeSessionId?: string;
  settingsPath?: string;
  trackerId?: string;
  trackerDisplayName?: string;
  /**
   * Phase context used by the debug store to place per-attempt artifacts under
   * `debug/runs/<runId>/<phaseId>/<agentName>/attempt-<N>/<sessionId>/`.
   * Optional for backwards-compat — code paths that don't set it will fall back
   * to a phase-less slot (`phase-unknown`).
   */
  phase?: PhaseSlot;
  /**
   * Optional budget key used by the token-usage emitter to tag this agent call
   * with a known SLA budget for aggregation and breach detection.
   */
  budgetKey?: BudgetKey;
  /**
   * Internal validator invoked after each Codex CLI exec completes successfully.
   *
   * Mirrors Claude's stop-hook behavior: when validation fails the Codex CLI is
   * resumed with the feedback appended as a new turn, so the model can self-correct
   * inside the same session — before the failure propagates to the external retry
   * layer. No-op for Claude (stop hooks already enforce validation there).
   */
  validator?: (output: string) => ValidationResult;
  /** Max in-session self-correction attempts for Codex when validator is set. Defaults to 5. */
  maxInternalIterations?: number;
  /**
   * Optional override of the framework's standard excluded-directories list.
   * When provided, drives the PreToolUse hook's deny list and the resolved
   * `permissions.deny` rules. Use sparingly — Phase 3's synthesizer is the
   * only current caller.
   */
  excludedDirsOverride?: ReadonlyArray<string>;
  /**
   * Optional list of absolute file paths the agent is allowed to read even
   * if their directory is otherwise denied. Rendered into the resolved
   * `permissions.allow` array AND forwarded to the PreToolUse path-restriction
   * hook via `FRAMEWORK_ALLOW_READ_PATHS` (JSON array of absolute paths).
   *
   * Glob characters are rejected by `buildClaudeAllowReadRules` — pass exact
   * absolute file paths only. Use sparingly: each entry is a hole in the
   * deny boundary.
   */
  allowReadPaths?: ReadonlyArray<string>;
  /**
   * Optional per-agent thinking-token cap. `0` disables extended thinking
   * entirely (best for mechanical-extraction agents); a positive integer
   * caps the budget for reasoning agents (e.g. synthesizer); `undefined`
   * inherits the provider default.
   *
   * Translated by each agent-factory impl into whichever surface the active
   * CLI supports (CLI flag, env var, settings entry). When no surface is
   * available, the factory logs once and continues at the provider default.
   *
   * Stack-agnostic: keyed by the agent's role, not by the target project's
   * stack or topology.
   */
  thinkingBudgetTokens?: number;
  /**
   * Optional per-spawn environment variables forwarded into the spawned CLI process.
   * Framework-controlled vars (FRAMEWORK_PATH, etc.) always win on a key collision.
   */
  extraEnv?: Record<string, string>;
}

export interface AgentInvokeInput {
  inputPrompt: string;
  attemptNumber?: number;
}

export interface AgentInvokeResult {
  output: string;
  mode: AuthMode;
  executionTimeMs: number;
  sessionId: string;
}

export interface Agent {
  invoke(input: AgentInvokeInput): Promise<AgentInvokeResult>;
  getInfo(): {
    agentName: string;
    mode: AuthMode;
  };
}
