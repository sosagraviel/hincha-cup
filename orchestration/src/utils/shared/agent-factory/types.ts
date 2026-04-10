import { AuthMode } from '../../../auth/auth-detector.js';

export interface AgentConfig {
  agentName: string;
  agentFilePath: string; // Absolute path to agent .md file
  projectPath: string;
  frameworkPath: string;
  timeout?: number;
  resumeSessionId?: string; // Session ID to resume (for context-preserving retry)
  settingsPath?: string; // Optional path to settings.json file passed via --settings flag
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
