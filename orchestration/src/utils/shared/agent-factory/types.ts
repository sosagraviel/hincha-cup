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
