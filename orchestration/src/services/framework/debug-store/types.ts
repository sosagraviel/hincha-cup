/**
 * Types for the debug artifact store.
 *
 * A debug "run" wraps one end-to-end workflow invocation (e.g., one
 * `initialize-project` execution). Each run contains per-phase directories,
 * each of which contains per-agent directories, each containing one folder
 * per attempt, each containing one folder per agent session id.
 *
 *   .<provider>-temp/
 *     <workflow>/
 *       debug/
 *         runs/
 *           <run-folder>/
 *             run.json
 *             <phase>/
 *               <agent>/
 *                 attempt-<N>/
 *                   <session-id>/
 *                     meta.json prompt-input.txt output.json transcript.jsonl transcript.html ...
 */

export interface RunContext {
  /** Unique id + folder name for this run (see composeRunFolderName). */
  runId: string;
  /** Absolute path to the workflow debug root — e.g. `.../initialize-project/debug`. */
  debugRoot: string;
  /** Absolute path to this run's folder — e.g. `.../initialize-project/debug/runs/<runId>`. */
  runDir: string;
  /** Workflow name (segment under `.<provider>-temp/`). */
  workflow: string;
  /** Human-readable project path (for run.json metadata only). */
  projectPath: string;
  /** Provider for this run (for run.json metadata). */
  provider: 'claude' | 'codex';
  /** ISO timestamp this run was created. */
  startedAt: string;
}

export interface PhaseSlot {
  /** Folder name of the phase under the run (e.g. `phase-1-discovery`). */
  phaseId: string;
  /** Stable numeric phase index for sorting in the run index. */
  phaseNumber: number;
  /** Display label for humans (e.g. "Phase 1 — Discovery"). */
  phaseLabel: string;
}

export interface AgentSlot extends PhaseSlot {
  /** Logical agent name — used as directory segment. */
  agentName: string;
}

export interface AttemptCoords extends AgentSlot {
  /** 1-based attempt number within this agent invocation. */
  attemptNumber: number;
  /** Per-invocation session id — from CLI subprocess or synthesized for DeepAgents. */
  sessionId: string;
}

export interface AttemptMeta {
  agentName: string;
  sessionId: string;
  attemptNumber: number;
  phaseId: string;
  phaseNumber: number;
  phaseLabel: string;
  runId: string;
  workflow: string;
  outcome: 'success' | 'failure' | 'pending';
  provider: 'claude' | 'codex' | 'deepagent';
  cli?: 'claude' | 'codex' | 'deepagent';
  model?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  /** Exit code for CLI subprocesses; null for in-process agents. */
  code?: number | null;
  /** Codex-specific internal correction loop count. */
  internalIterations?: number;
  internalValidationExhausted?: boolean;
  /** Number of validation errors at the point of write (may change if failure is added later). */
  validationErrorCount?: number;
  /** Freeform tag set by callers. */
  failureReason?: string;
  rateLimit?: boolean;
  /** Whether a native transcript was captured and copied in. */
  transcriptCaptured?: boolean;
  /** Whether HTML was rendered. */
  htmlRendered?: boolean;
  /** Where the native transcript originated (home dir, synthesized, etc.). */
  transcriptSource?: 'claude-home' | 'codex-home' | 'deepagent-synth' | 'none';
}

export interface RunManifest {
  runId: string;
  workflow: string;
  projectPath: string;
  frameworkPath?: string;
  provider: 'claude' | 'codex';
  cliVersion?: string;
  model?: string;
  modelTier?: string;
  debug: boolean;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  gitBranch?: string;
  gitSha?: string;
  /** Summary written at finalize time. */
  attempts?: Array<{
    phaseId: string;
    phaseNumber: number;
    agentName: string;
    attemptNumber: number;
    sessionId: string;
    outcome: 'success' | 'failure' | 'pending';
    durationMs?: number;
  }>;
}

export interface ValidationFailureEntry {
  message: string;
  path?: string;
}

export interface ValidationErrorsFile {
  attemptNumber: number;
  agentName: string;
  sessionId: string;
  capturedAt: string;
  errors: ValidationFailureEntry[];
  /** Free-form raw text for backwards-compat with older tooling. */
  rawText?: string;
}
