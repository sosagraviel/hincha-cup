# AI Agentic Framework - TypeScript Orchestration

TypeScript-based orchestration layer using [DeepAgents.js](https://github.com/langchain-ai/deepagentsjs) and [LangGraph](https://langchain-ai.github.io/langgraphjs/).

## Overview

This module provides a type-safe, provider-agnostic orchestration layer for the AI Agentic Framework workflows. It replaces complex bash scripts with TypeScript state machines while preserving backward compatibility.

## Features

- ✅ **Type-safe orchestration** with Zod schemas
- ✅ **Multi-provider LLM support** (Anthropic, OpenAI, Google)
- ✅ **Model alias system** - no hardcoded versions
- ✅ **State machine architecture** with LangGraph
- ✅ **Checkpointing & resumption** with SQLite/PostgreSQL
- ✅ **Incremental migration** - bash fallback support
- ✅ **CLI overrides** for models and configuration

## Installation

```bash
cd orchestration
npm install
```

## Usage

### Via Bash Wrapper (Recommended)

The existing bash scripts automatically call TypeScript implementations:

```bash
# Uses TypeScript orchestration by default
./scripts/initialize-project.sh

# Force bash orchestration
ORCHESTRATION_MODE=bash ./scripts/initialize-project.sh
```

### Direct CLI Usage

```bash
# Initialize project
node orchestration/src/cli/initialize.ts \
  --project-path /path/to/project \
  --framework-path /path/to/framework

# List available model aliases
node orchestration/src/cli/initialize.ts --list-models

# Override planner model
node orchestration/src/cli/initialize.ts \
  --project-path /path/to/project \
  --model-planner opus-latest
```

### NPM Scripts

```bash
# Run TypeScript directly (from orchestration directory)
npm run initialize -- --project-path /path/to/project

# Build TypeScript
npm run build

# Run tests
npm test
npm run test:unit
npm run test:integration
```

## Configuration

### Model Configuration

Models are configured via `config/model-config.json`:

```json
{
  "modelAliases": {
    "sonnet-latest": {
      "provider": "anthropic",
      "modelId": "claude-sonnet-4-6-20250514",
      "description": "Latest Sonnet model for production use"
    },
    "gpt4-latest": {
      "provider": "openai",
      "modelId": "gpt-4o-2025-05-13",
      "description": "Latest GPT-4o model"
    }
  },
  "agentModelMapping": {
    "planner": "sonnet-latest",
    "implementer": "sonnet-latest"
  }
}
```

### Environment Variables

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Model Overrides
MODEL_PLANNER=opus-latest
MODEL_IMPLEMENTER=haiku-latest

# Execution Mode
NODE_ENV=development  # Uses cheaper models
ORCHESTRATION_MODE=typescript  # typescript or bash
```

## Architecture

### State Machine Flow (Initialize Project)

```
┌─────────────┐
│ Start       │
└──────┬──────┘
       │
       v
┌─────────────┐
│ Detect      │  Analyzes project stack (languages, frameworks)
│ Stack       │  Output: stack_profile
└──────┬──────┘
       │
       v
┌─────────────┐
│ Resolve     │  Maps stack to required skills
│ Skills      │  Output: skills[]
└──────┬──────┘
       │
       v
┌─────────────┐
│ Generate    │  Creates agents from templates
│ Agents      │  Output: agents_generated[]
└──────┬──────┘
       │
       v
┌─────────────┐
│ Create      │  Writes framework-config.json
│ Config      │  Output: config_path
└──────┬──────┘
       │
       v
┌─────────────┐
│ Complete    │
└─────────────┘
```

### Directory Structure

```
orchestration/
├── src/
│   ├── graphs/          # LangGraph state machines
│   │   └── initialize-project.graph.ts
│   ├── nodes/           # Individual workflow nodes
│   │   ├── detect-stack.node.ts
│   │   ├── resolve-skills.node.ts
│   │   ├── generate-agents.node.ts
│   │   └── create-config.node.ts
│   ├── state/           # State schemas and checkpointers
│   │   ├── schemas/
│   │   │   └── initialize-project.schema.ts
│   │   └── checkpointers/
│   │       └── sqlite.checkpointer.ts
│   ├── llm/             # LLM factory (multi-provider)
│   │   └── llm-factory.ts
│   └── cli/             # CLI entry points
│       └── initialize.ts
├── config/              # Configuration files
│   ├── model-config.json
│   └── model-config.schema.json
├── test/                # Tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── package.json
```

## Multi-Provider Support

The LLM factory supports multiple providers through model aliases:

```typescript
import { getLLMFactory } from './llm/llm-factory';

const factory = getLLMFactory();

// Create Anthropic model
const sonnet = await factory.createModel('sonnet-latest', {
  agent: 'planner',
  phase: 'planning'
});

// Create OpenAI model
const gpt4 = await factory.createModel('gpt4-latest', {
  agent: 'implementer',
  phase: 'implementation'
});

// Create Google model
const gemini = await factory.createModel('gemini-latest');
```

### Priority Resolution

Model aliases resolve with the following priority:

1. **CLI override**: `--model-planner opus-latest`
2. **Environment variable**: `MODEL_PLANNER=opus-latest`
3. **Phase mapping**: `phaseModelMapping.planning`
4. **Agent mapping**: `agentModelMapping.planner`
5. **Default alias**: `sonnet-latest`

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires project setup)
npm test -- orchestration/test/e2e/
```

## Migration Status

### ✅ Phase 1: Initialize Project (COMPLETE)
- [x] LLM factory with multi-provider support
- [x] State schemas with Zod validation
- [x] Graph implementation with 4 nodes
- [x] CLI entry point
- [x] Bash wrapper with fallback
- [ ] End-to-end testing

### 🚧 Phase 2: Create SDD Ticket (PLANNED)
- [ ] MCP integration (Jira, Confluence)
- [ ] SDD generation workflow
- [ ] Human-in-the-loop approval

### 🚧 Phase 3: Implement Ticket (PLANNED)
- [ ] 10-phase implementation workflow
- [ ] Parallel implementers
- [ ] 4-tier resilience testing
- [ ] PR creation and review

## Development

### Adding a New Node

```typescript
// src/nodes/my-node.node.ts
import { InitializeProjectState } from '../state/schemas/initialize-project.schema';

export async function myNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  // Node logic here
  return {
    current_phase: 'next_phase',
    // ... state updates
  };
}
```

### Adding to Graph

```typescript
// src/graphs/initialize-project.graph.ts
import { myNode } from '../nodes/my-node.node';

export const initializeProjectGraph = new StateGraph(InitializeProjectStateSchema)
  .addNode("my_node", myNode)
  .addEdge("previous_node", "my_node")
  .addEdge("my_node", "next_node");
```

## Troubleshooting

### TypeScript Orchestration Fails

If you see "Falling back to bash implementation":

1. **Check dependencies**:
   ```bash
   cd orchestration
   npm install
   ```

2. **Verify CLI exists**:
   ```bash
   ls -la orchestration/src/cli/initialize.ts
   ```

3. **Test directly**:
   ```bash
   node orchestration/src/cli/initialize.ts --list-models
   ```

4. **Force bash mode**:
   ```bash
   ORCHESTRATION_MODE=bash ./scripts/initialize-project.sh
   ```

### Missing API Keys

Ensure you have the required API keys set:

```bash
# Anthropic (required for default configuration)
export ANTHROPIC_API_KEY=sk-ant-...

# Optional: OpenAI
export OPENAI_API_KEY=sk-...

# Optional: Google
export GOOGLE_API_KEY=...
```

### Checkpointer Database Locked

If SQLite database is locked:

```bash
rm orchestration/.checkpoints/orchestration.db
```

## Contributing

See the main migration plan at `.claude/plans/idempotent-drifting-moth.md` for architecture details and future phases.

## References

- [DeepAgents.js Documentation](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [LangGraph.js Documentation](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [Zod Schema Validation](https://zod.dev/)
