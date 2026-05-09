import { AuthMode } from '../../../auth/auth-detector.js';
import type { ValidationResult } from '../../validator.js';
import type { PhaseSlot } from '../../../services/framework/debug-store/index.js';
import type { BudgetKey } from '../../../services/framework/budgets.js';

export interface AgentConfig {
  agentName: string;
  agentFilePath: string; // Absolute path to agent .md file
  projectPath: string;
  frameworkPath: string;
  timeout?: number;
  resumeSessionId?: string; // Session ID to resume (for context-preserving retry)
  settingsPath?: string; // Optional path to settings.json file passed via --settings flag
  // Optional unique identifier for the concurrent-agent tracker. Defaults to
  // `agentName` when omitted. Set this when running the SAME agent (same model
  // config, same settings) in parallel — e.g. the wiki-generator fan-out — so
  // the spinner tracker does not collide on a single shared id.
  trackerId?: string;
  // Optional display label for the tracker UI. Defaults to `agentName`.
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
   * When provided, this list (instead of `getExcludedDirectories()`) drives
   *   - the PreToolUse path-restriction hook's deny list (env var
   *     `FRAMEWORK_EXCLUDED_DIRS`),
   *   - the resolved settings.json `permissions.deny` rules built by
   *     `buildClaudeDenyRules()`.
   *
   * Use sparingly — Phase 3's synthesizer is the only current caller, and
   * passes a list that drops `.claude-temp` / `.codex-temp` so it can read
   * its composer views. Every other agent uses the framework default.
   *
   * Plan v4 Phase A.1 (2026-05-09): introduced to fix the deny-shadowing
   * bug surfaced in archive/v3-iteration-100 (run 2026-05-08T23-30-20),
   * where the broader deny rule shadowed a more-specific allow rule and
   * the synthesizer could not read its inputs.
   */
  excludedDirsOverride?: ReadonlyArray<string>;
}

export interface AgentInvokeInput {
  inputPrompt: string; // Full input prompt (built by caller/node)
  attemptNumber?: number; // 1-based attempt number for per-attempt diagnostics
}

export interface AgentInvokeResult {
  output: string;
  mode: AuthMode;
  executionTimeMs: number;
  sessionId: string; // Session ID for context-preserving retry with --resume
}

export interface Agent {
  invoke(input: AgentInvokeInput): Promise<AgentInvokeResult>;
  getInfo(): {
    agentName: string;
    mode: AuthMode;
  };
}
