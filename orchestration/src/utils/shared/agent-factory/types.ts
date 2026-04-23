import { AuthMode } from '../../../auth/auth-detector.js';
import type { ValidationResult } from '../../validator.js';

export interface AgentConfig {
  agentName: string;
  agentFilePath: string; // Absolute path to agent .md file
  projectPath: string;
  frameworkPath: string;
  timeout?: number;
  resumeSessionId?: string; // Session ID to resume (for context-preserving retry)
  settingsPath?: string; // Optional path to settings.json file passed via --settings flag
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
