import { AuthMode } from '../../../auth/auth-detector.js';

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
}

export interface AgentInvokeInput {
  inputPrompt: string; // Full input prompt (built by caller/node)
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
