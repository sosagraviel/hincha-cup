# Getting Started with TypeScript Orchestration

## Overview

The AI Agentic Framework now uses **TypeScript orchestration** by default, powered by LangGraph and DeepAgents.js. This provides better type safety, error handling, and maintainability compared to the legacy bash implementation.

## Quick Start

### 1. Run Initialize Project

From your project root:

```bash
cd /path/to/your/project
./ai-agentic-framework/scripts/initialize-project.sh
```

The script will automatically:
1. ✅ Check for Node.js
2. ✅ Install npm dependencies if missing
3. ✅ Run TypeScript orchestration (6-phase workflow)
4. ✅ Generate project context and configuration

### 2. View Available Models

```bash
cd ai-agentic-framework/orchestration
npm run initialize -- --list-models
```

Output:
```
🔍 Available model aliases:
  sonnet-latest   → claude-sonnet-4-6              (anthropic)
  haiku-latest    → claude-haiku-4-5-20251001      (anthropic)
  opus-latest     → claude-opus-4-6                (anthropic)
  gpt5-latest     → gpt-5.4-2026-03-05             (openai)
  gpt5-mini       → gpt-5.4-mini-2026-03-17        (openai)
  gemini-latest   → gemini-3.1-pro-preview         (google)
  gemini-flash    → gemini-2.5-flash               (google)
```

### 3. View Available Environments

```bash
npm run initialize -- --list-environments
```

Output:
```
🌍 Available environment configurations:
  development
  development-openai
  development-gemini
  staging
  staging-openai
  production
  production-openai
  production-gemini
```

## Configuration

### Environment Variables

#### Authentication (Required)
Set at least ONE of these:

```bash
# Option 1: Anthropic (Claude) - Default
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: OpenAI (GPT)
export OPENAI_API_KEY=sk-...

# Option 3: Google (Gemini)
export GOOGLE_API_KEY=...

# Option 4: Use Claude CLI (subscription-based)
# No API key needed, just authenticate: claude setup-token
```

#### Environment Configuration

```bash
# Development (uses cheaper models)
export NODE_ENV=development

# Production (uses best models)
export NODE_ENV=production

# Production with specific provider
export NODE_ENV=production-openai
export NODE_ENV=production-gemini
```

### Model Overrides

Override specific agent models:

```bash
# Use Opus for planner instead of Sonnet
npm run initialize -- --model-planner opus-latest

# Use Opus for synthesis phase
npm run initialize -- --model-synthesis opus-latest
```

## Execution Modes

### TypeScript Mode (Default)

Uses the new TypeScript orchestration with LangGraph:

```bash
./scripts/initialize-project.sh
# OR explicitly:
ORCHESTRATION_MODE=typescript ./scripts/initialize-project.sh
```

**Features**:
- ✅ Provider-agnostic (Anthropic, OpenAI, Google)
- ✅ Tier-based cost optimization
- ✅ Retry logic with exponential backoff
- ✅ Checkpoint/resume functionality
- ✅ Real-time progress streaming
- ✅ Better error messages

### Bash Mode (Legacy)

Use the legacy bash implementation:

```bash
ORCHESTRATION_MODE=bash ./scripts/initialize-project.sh
```

**When to use**:
- Debugging TypeScript issues
- Comparing outputs
- Temporary fallback

## Troubleshooting

### Error: Node.js not installed

```bash
# macOS
brew install node

# Ubuntu/Debian
sudo apt install nodejs npm

# Windows
# Download from: https://nodejs.org/
```

### Error: Dependencies not found

The script auto-installs dependencies, but you can manually install:

```bash
cd ai-agentic-framework/orchestration
npm install
```

### Error: Authentication failed

Check your API keys:

```bash
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY
echo $GOOGLE_API_KEY

# Or check Claude CLI
claude --version
```

### Error: TypeScript orchestration failed

1. **Check error output** for specific details
2. **Verify authentication** is configured
3. **Check logs** in `.claude-temp/`
4. **Try running directly**:
   ```bash
   cd orchestration
   npm run initialize -- --project-path /path/to/project
   ```
5. **Use bash mode temporarily**:
   ```bash
   ORCHESTRATION_MODE=bash ./scripts/initialize-project.sh
   ```

## Architecture

### 6-Phase Workflow

1. **Phase 1: Parallel Analysis** (4 agents run concurrently)
   - structure-architecture-analyzer
   - tech-stack-dependencies-analyzer
   - code-patterns-testing-analyzer
   - data-flows-integrations-analyzer

2. **Phase 2: Consolidation** - Merge findings and identify gaps

3. **Phase 3: Synthesis** - Comprehensive project understanding (Opus)

4. **Phase 4: Context Generation** - Generate CLAUDE.md, project-context

5. **Phase 5: Resources** - Copy skills and commands

6. **Phase 6: Validation** - Final validation

### Hybrid Authentication

The system automatically detects and uses the best available authentication:

**Priority Order**:
1. API Keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)
2. Claude CLI (subscription-based)
3. Error (no authentication available)

See [HYBRID_AUTHENTICATION.md](docs/HYBRID_AUTHENTICATION.md) for details.

## Advanced Usage

### Resume from Checkpoint

If a workflow fails, resume from where it left off:

```bash
npm run initialize -- --resume init-myproject-1234567890
```

### Stream Real-Time Progress

Watch execution in real-time:

```bash
npm run initialize -- --stream --project-path /path/to/project
```

### Use Specific Provider

Force a specific provider regardless of API keys:

```bash
NODE_ENV=production-openai npm run initialize -- --project-path /path/to/project
```

## Next Steps

After initialization completes:

1. **Review CLAUDE.md** for quick project reference
2. **Check framework-config.json** for configuration
3. **Explore project-context/SKILL.md** for project-specific guidance
4. **Start working** with Claude CLI:
   ```bash
   claude
   /project-context  # Load project knowledge
   /start-task       # Begin working
   ```

## Documentation

- [Provider Switching Guide](docs/PROVIDER_SWITCHING.md)
- [Hybrid Authentication](docs/HYBRID_AUTHENTICATION.md)
- [Model Updates](config/MODEL_UPDATES.md)
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md)

## Support

For issues or questions:
- Check troubleshooting section above
- Review error logs in `.claude-temp/`
- See full documentation in `docs/`
