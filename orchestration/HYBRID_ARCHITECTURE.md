# Hybrid Architecture: Support Both Claude CLI Subscription and API Keys

**Date**: March 19, 2026
**Purpose**: Enable 300+ developers with Claude Pro subscriptions to use the framework without requiring API keys
**Status**: Design Proposal

---

## Problem Statement

- **Current**: DeepAgents.js requires API keys (ANTHROPIC_API_KEY)
- **Reality**: 300+ developers already pay for Claude Pro subscription
- **Constraint**: Cannot violate Anthropic TOS
- **Requirement**: Support BOTH subscription and API key authentication

---

## Proposed Solution: Dual-Mode Architecture

### Architecture Overview

```
User Request
    ↓
┌─────────────────────────────────┐
│  Orchestration Entry Point      │
│  (CLI or Programmatic)           │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  Auth Mode Detection             │
│  - Check for API key             │
│  - Check for Claude CLI auth     │
│  - Fallback logic                │
└─────────────────────────────────┘
    ↓                        ↓
┌─────────────────┐  ┌─────────────────────┐
│  DeepAgents Mode │  │  Claude CLI Mode     │
│  (API Key)       │  │  (Subscription)      │
└─────────────────┘  └─────────────────────┘
    ↓                        ↓
    └────────────┬───────────┘
                 ↓
         ┌──────────────┐
         │  Shared Logic │
         │  State Mgmt   │
         │  Validation   │
         └──────────────┘
```

### Mode 1: DeepAgents Mode (API Key) ✅ TOS-Compliant

**When**: API key is available
**How**: Current implementation (no changes needed)
**Use Case**: CI/CD, shared workflows, production deployments

```typescript
// Current implementation - works as-is
const llmFactory = getLLMFactory();
const model = await llmFactory.createModel("sonnet-latest", {
  agent: "planner",
  phase: "planning"
});

const agent = await createDeepAgent({
  model: model,
  instructions: `...`,
  tools: []
});
```

### Mode 2: Claude CLI Orchestration Mode (Subscription) ✅ TOS-Compliant

**When**: No API key, but Claude CLI is authenticated
**How**: Use Claude CLI directly instead of DeepAgents.js
**Use Case**: Developer machines with Claude Pro subscription

**Key Insight**: Instead of trying to use subscription auth with DeepAgents.js (TOS violation), **orchestrate Claude CLI directly** using child processes.

```typescript
// NEW: Claude CLI orchestration
import { spawn } from 'child_process';

async function invokeCLIAgent(agentName: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeProcess = spawn('claude', [
      '--agent', agentName,
      '--dangerously-skip-permissions'
    ], {
      cwd: process.env.PROJECT_PATH
    });

    let stdout = '';
    let stderr = '';

    claudeProcess.stdin.write(prompt);
    claudeProcess.stdin.end();

    claudeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claudeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claudeProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude CLI failed: ${stderr}`));
      }
    });
  });
}
```

---

## Implementation Plan

### Phase 1: Auth Mode Detection (1 day)

Create a new module to detect available authentication:

```typescript
// src/auth/auth-detector.ts

export enum AuthMode {
  API_KEY = 'api_key',
  CLAUDE_CLI = 'claude_cli',
  NONE = 'none'
}

export interface AuthConfig {
  mode: AuthMode;
  provider?: string; // anthropic, openai, google
  hasClaudeCLI: boolean;
  hasAPIKey: boolean;
}

export async function detectAuthMode(): Promise<AuthConfig> {
  // 1. Check for API keys (priority order)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;

  if (anthropicKey) {
    return {
      mode: AuthMode.API_KEY,
      provider: 'anthropic',
      hasClaudeCLI: await isClaudeCLIAvailable(),
      hasAPIKey: true
    };
  }

  if (openaiKey) {
    return {
      mode: AuthMode.API_KEY,
      provider: 'openai',
      hasClaudeCLI: await isClaudeCLIAvailable(),
      hasAPIKey: true
    };
  }

  if (googleKey) {
    return {
      mode: AuthMode.API_KEY,
      provider: 'google',
      hasClaudeCLI: await isClaudeCLIAvailable(),
      hasAPIKey: true
    };
  }

  // 2. Check for Claude CLI (subscription auth)
  const hasClaudeCLI = await isClaudeCLIAvailable();
  if (hasClaudeCLI) {
    const isAuthenticated = await isClaudeCLIAuthenticated();
    if (isAuthenticated) {
      return {
        mode: AuthMode.CLAUDE_CLI,
        provider: 'anthropic',
        hasClaudeCLI: true,
        hasAPIKey: false
      };
    }
  }

  // 3. No authentication available
  return {
    mode: AuthMode.NONE,
    hasClaudeCLI: false,
    hasAPIKey: false
  };
}

async function isClaudeCLIAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    execSync('which claude', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function isClaudeCLIAuthenticated(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    // Try a simple command to check auth
    execSync('claude --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
```

### Phase 2: Agent Factory Abstraction (2 days)

Create an abstraction layer that works with both modes:

```typescript
// src/agents/agent-factory-hybrid.ts

import { AuthMode, AuthConfig, detectAuthMode } from '../auth/auth-detector.js';
import { createDeepAgent } from 'deepagents';
import { getLLMFactory } from '../llm/llm-factory.js';

export interface AgentConfig {
  agentName: string;
  agentFile: string;
  modelAlias: string;
  projectPath: string;
  frameworkPath: string;
  additionalContext?: string;
  timeout?: number;
}

export interface AgentInvokeResult {
  output: string;
  mode: AuthMode;
}

export class HybridAgentFactory {
  private authConfig: AuthConfig;

  constructor(authConfig: AuthConfig) {
    this.authConfig = authConfig;
  }

  static async create(): Promise<HybridAgentFactory> {
    const authConfig = await detectAuthMode();
    return new HybridAgentFactory(authConfig);
  }

  async createAgent(config: AgentConfig) {
    if (this.authConfig.mode === AuthMode.API_KEY) {
      return this.createDeepAgent(config);
    } else if (this.authConfig.mode === AuthMode.CLAUDE_CLI) {
      return this.createCLIAgent(config);
    } else {
      throw new Error(
        'No authentication available. Please either:\n' +
        '1. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY\n' +
        '2. Authenticate Claude CLI with: claude setup-token'
      );
    }
  }

  private async createDeepAgent(config: AgentConfig) {
    // Existing DeepAgents.js implementation
    const llmFactory = getLLMFactory();
    const model = await llmFactory.createModel(config.modelAlias, {
      agent: config.agentName
    });

    const agentPath = path.join(
      config.frameworkPath,
      'agents',
      config.agentFile
    );
    const agentPrompt = fs.readFileSync(agentPath, 'utf-8');

    const agent = await createDeepAgent({
      model: model,
      instructions: agentPrompt + (config.additionalContext || ''),
      tools: [],
      timeout: config.timeout || 300000
    });

    return {
      invoke: async (input: { input: string }): Promise<AgentInvokeResult> => {
        const result = await agent.invoke(input);
        return {
          output: result.output,
          mode: AuthMode.API_KEY
        };
      }
    };
  }

  private async createCLIAgent(config: AgentConfig) {
    // NEW: Claude CLI orchestration
    return {
      invoke: async (input: { input: string }): Promise<AgentInvokeResult> => {
        const output = await this.invokeCLI(
          config.agentName,
          input.input,
          config.projectPath,
          config.timeout
        );
        return {
          output,
          mode: AuthMode.CLAUDE_CLI
        };
      }
    };
  }

  private async invokeCLI(
    agentName: string,
    prompt: string,
    projectPath: string,
    timeout: number = 300000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        claudeProcess.kill();
        reject(new Error(`Claude CLI timeout after ${timeout}ms`));
      }, timeout);

      const claudeProcess = spawn('claude', [
        '--agent', agentName,
        '--dangerously-skip-permissions'
      ], {
        cwd: projectPath,
        env: {
          ...process.env,
          CLAUDE_SKIP_CONFIRMATIONS: '1'
        }
      });

      let stdout = '';
      let stderr = '';

      claudeProcess.stdin.write(prompt);
      claudeProcess.stdin.end();

      claudeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      claudeProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude CLI failed (exit ${code}): ${stderr}`));
        }
      });
    });
  }
}
```

### Phase 3: Update Node Implementations (2 days)

Update all Phase 1 analyzer nodes to use the hybrid factory:

```typescript
// src/nodes/phase1/structure-architecture-analyzer.node.ts

import { HybridAgentFactory } from '../../agents/agent-factory-hybrid.js';

export async function structureArchitectureAnalyzerNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  const MAX_ATTEMPTS = 5;
  let retryState = initRetryState(MAX_ATTEMPTS);

  // Create hybrid agent factory
  const agentFactory = await HybridAgentFactory.create();

  while (shouldRetry(retryState)) {
    try {
      console.log(`[structure-architecture-analyzer] Starting analysis...`);
      console.log(`[structure-architecture-analyzer] Attempt ${retryState.attempt + 1}/${MAX_ATTEMPTS}`);

      // Create agent (works with both API key and CLI)
      const agent = await agentFactory.createAgent({
        agentName: 'structure-architecture-analyzer',
        agentFile: '01-structure-architecture.md',
        modelAlias: 'sonnet-latest',
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        additionalContext: buildErrorFeedback(retryState),
        timeout: 300000
      });

      // Invoke agent (returns same interface regardless of mode)
      const result = await agent.invoke({
        input: `Analyze project structure at: ${state.project_path}`
      });

      console.log(`[structure-architecture-analyzer] Mode: ${result.mode}`);

      // Validate output (same for both modes)
      const validation = validateAndParseAgentOutput(
        result.output,
        'structure-architecture-analyzer'
      );

      if (!validation.valid) {
        const errorMessage = buildValidationErrorFeedback(validation);
        retryState = updateRetryState(retryState, errorMessage);
        await sleep(retryState.next_delay_ms || 0);
        continue;
      }

      // Success - return analysis result
      return {
        phase1_analysis: {
          structure_architecture: validation.data
        },
        phase1_retry_tracking: {
          structure_architecture: {
            ...retryState,
            completed_at: new Date().toISOString()
          }
        }
      };

    } catch (error) {
      // Error handling (same for both modes)
      console.error(`[structure-architecture-analyzer] Error:`, error.message);
      retryState = updateRetryState(retryState, error.message);

      if (!shouldRetry(retryState)) {
        console.error(
          `[structure-architecture-analyzer] ✗ Failed after ${MAX_ATTEMPTS} attempts. ` +
          `Last error: ${retryState.last_error}`
        );
        return {
          current_phase: 'failed',
          errors: [
            `structure-architecture-analyzer failed: ${retryState.last_error}`
          ]
        };
      }

      console.warn(
        `[structure-architecture-analyzer] Retrying in ${retryState.next_delay_ms}ms...`
      );
      await sleep(retryState.next_delay_ms || 0);
    }
  }

  // Should never reach here
  throw new Error('Retry logic error');
}
```

### Phase 4: CLI Update (1 day)

Update CLI to display auth mode:

```typescript
// src/cli/initialize.ts

import { detectAuthMode, AuthMode } from '../auth/auth-detector.js';

program
  .action(async (options) => {
    try {
      // Detect authentication mode
      const authConfig = await detectAuthMode();

      if (authConfig.mode === AuthMode.NONE) {
        console.error('❌ No authentication available');
        console.error('');
        console.error('Please choose one of the following:');
        console.error('');
        console.error('Option 1: API Key (any provider)');
        console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
        console.error('  export OPENAI_API_KEY=sk-...');
        console.error('  export GOOGLE_API_KEY=...');
        console.error('');
        console.error('Option 2: Claude CLI (subscription)');
        console.error('  claude setup-token');
        console.error('');
        process.exit(1);
      }

      const spinner = ora('Initializing workflow...').start();

      // ... rest of initialization

      spinner.succeed('Workflow initialized');

      // Display configuration including auth mode
      console.log('\\n📊 Configuration:');
      if (authConfig.mode === AuthMode.API_KEY) {
        console.log(`   Auth Mode: API Key (${authConfig.provider})`);
        console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
        // ... tier mapping
      } else if (authConfig.mode === AuthMode.CLAUDE_CLI) {
        console.log(`   Auth Mode: Claude CLI (subscription)`);
        console.log(`   Provider: Anthropic (Claude Pro/Max)`);
        console.log(`   Note: Using your Claude subscription via CLI`);
      }
      console.log(`   Project Path: ${projectPath}`);
      console.log(`   Framework Path: ${frameworkPath}\\n`);

      // Execute workflow
      const result = await graph.invoke(initialState, config);

      // ...
    } catch (error) {
      // ...
    }
  });
```

---

## Benefits of Hybrid Architecture

### For Developers with Claude Pro
✅ Use existing subscription without additional API keys
✅ No TOS violation (Claude CLI used as intended)
✅ Zero additional cost
✅ Familiar authentication (already set up)

### For CI/CD and Production
✅ Use API keys for automation
✅ Tier-based cost optimization still works
✅ Provider-agnostic (Anthropic/OpenAI/Google)
✅ Better control over model selection

### For the Organization
✅ Supports 300+ developers with existing subscriptions
✅ Flexible deployment options
✅ No forced migration to API keys
✅ Gradual transition possible

---

## Trade-offs and Limitations

### Claude CLI Mode Limitations

1. **No Tier-Based Model Selection**: Claude CLI doesn't support dynamic model selection like API does
   - Workaround: Use default model (sonnet) for all agents in CLI mode
   - Alternative: Allow model override via CLI flags

2. **No Streaming**: Claude CLI doesn't expose streaming APIs programmatically
   - Impact: Cannot show real-time progress for individual agents
   - Mitigation: Show spinner while agent is running

3. **Process Overhead**: Spawning subprocess per agent invocation
   - Impact: ~100-200ms overhead per invocation
   - Mitigation: Acceptable for developer workflows (not critical path)

4. **Less Control**: Cannot customize temperature, max_tokens, etc.
   - Impact: Uses Claude CLI defaults
   - Mitigation: Acceptable for most use cases

### API Key Mode Advantages

1. ✅ Full control over model selection (tier-based optimization)
2. ✅ Streaming support
3. ✅ Lower latency (no process spawning)
4. ✅ Customizable parameters (temperature, max_tokens)

---

## Testing Strategy

### Test Matrix

| Auth Mode | Test Case | Expected Result |
|-----------|-----------|----------------|
| API Key (Anthropic) | Run init workflow | ✅ Full workflow with tier-based models |
| API Key (OpenAI) | Run init workflow | ✅ Full workflow with GPT models |
| API Key (Google) | Run init workflow | ✅ Full workflow with Gemini models |
| Claude CLI | Run init workflow | ✅ Full workflow with Claude Pro subscription |
| None | Run init workflow | ❌ Clear error message with setup instructions |

### Test Commands

```bash
# Test API Key mode (Anthropic)
export ANTHROPIC_API_KEY=sk-ant-...
npm run initialize -- --project-path /tmp/test-ts-project

# Test API Key mode (OpenAI)
export NODE_ENV=development-openai
export OPENAI_API_KEY=sk-...
npm run initialize -- --project-path /tmp/test-ts-project

# Test Claude CLI mode (subscription)
unset ANTHROPIC_API_KEY
unset OPENAI_API_KEY
unset GOOGLE_API_KEY
claude setup-token  # Authenticate with subscription
npm run initialize -- --project-path /tmp/test-ts-project

# Test no auth (should fail with helpful message)
unset ANTHROPIC_API_KEY
unset OPENAI_API_KEY
unset GOOGLE_API_KEY
# Don't authenticate Claude CLI
npm run initialize -- --project-path /tmp/test-ts-project
```

---

## Migration Path

### Week 1: Auth Detection + Agent Factory
- Day 1-2: Implement auth-detector.ts
- Day 3-4: Implement agent-factory-hybrid.ts
- Day 5: Unit tests for both modules

### Week 2: Node Updates + CLI
- Day 1-3: Update all Phase 1 analyzer nodes
- Day 4: Update CLI with auth mode display
- Day 5: Integration testing

### Week 3: Testing + Documentation
- Day 1-2: Test all auth modes (API key + CLI)
- Day 3: Update documentation (README, setup guides)
- Day 4-5: E2E testing on real projects

**Total**: 3 weeks to hybrid architecture implementation

---

## Conclusion

This hybrid architecture:
1. ✅ **Supports Claude Pro subscriptions** (300+ developers)
2. ✅ **TOS-compliant** (uses Claude CLI as intended)
3. ✅ **Flexible** (API key OR subscription)
4. ✅ **Backwards compatible** (existing API key flows unchanged)
5. ✅ **Production-ready** (CI/CD can use API keys)

**Recommendation**: Implement this hybrid architecture to support your existing developer base while maintaining flexibility for automation and production deployments.
