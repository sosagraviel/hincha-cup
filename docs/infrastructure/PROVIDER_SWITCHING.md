# Provider Switching Guide

This guide explains how to switch between AI providers (Anthropic, OpenAI, Google) using the LLM Factory's environment-based configuration.

## Quick Start

### Switch to OpenAI for Development

```bash
export NODE_ENV=development-openai
npm run orchestrate:init -- --project-path /path/to/project
```

### Switch to Google Gemini for Production

```bash
export NODE_ENV=production-gemini
npm run orchestrate:implement -- --ticket-id PROJ-123
```

### Use Anthropic (Default)

```bash
export NODE_ENV=production
npm run orchestrate:implement -- --ticket-id PROJ-123
```

## Available Environments

### Development Environments

| Environment | Provider | Fast Tier | Standard Tier | Advanced Tier |
|------------|----------|-----------|---------------|---------------|
| `development` | Anthropic | haiku-latest | sonnet-latest | opus-latest |
| `development-openai` | OpenAI | gpt5-mini | gpt5-latest | gpt5-latest |
| `development-gemini` | Google | gemini-flash | gemini-latest | gemini-latest |

**Cost Optimization**: Development uses "fast" tier for most agents to reduce costs during iteration.

### Staging Environments

| Environment | Provider | Fast Tier | Standard Tier | Advanced Tier |
|------------|----------|-----------|---------------|---------------|
| `staging` | Anthropic | haiku-latest | sonnet-latest | opus-latest |
| `staging-openai` | OpenAI | gpt5-mini | gpt5-latest | gpt5-latest |

**Balance**: Staging uses "standard" tier for realistic testing without production costs.

### Production Environments

| Environment | Provider | Fast Tier | Standard Tier | Advanced Tier |
|------------|----------|-----------|---------------|---------------|
| `production` | Anthropic | haiku-latest | sonnet-latest | opus-latest |
| `production-openai` | OpenAI | gpt5-mini | gpt5-latest | gpt5-latest |
| `production-gemini` | Google | gemini-flash | gemini-latest | gemini-latest |

**Quality**: Production uses "advanced" tier for critical phases (synthesis, review).

## Tier-Based Agent Mapping

Different agent types use different tiers based on their complexity:

### Development Environment

```typescript
{
  "agentOverrides": {
    "planner": "fast",                           // haiku / gpt5-mini / gemini-flash
    "implementer": "fast",                       // haiku / gpt5-mini / gemini-flash
    "structure-architecture-analyzer": "fast",   // haiku / gpt5-mini / gemini-flash
    "tech-stack-dependencies-analyzer": "fast",  // haiku / gpt5-mini / gemini-flash
    "code-patterns-testing-analyzer": "fast",    // haiku / gpt5-mini / gemini-flash
    "data-flows-integrations-analyzer": "fast"   // haiku / gpt5-mini / gemini-flash
  }
}
```

**Why**: Fast iteration with lowest-cost models.

### Production Environment

```typescript
{
  "agentOverrides": {
    "planner": "standard",      // sonnet / gpt5-latest / gemini-latest
    "implementer": "standard",  // sonnet / gpt5-latest / gemini-latest
    "reviewer": "advanced"      // opus / gpt5-latest / gemini-latest
  }
}
```

**Why**: Balance cost and quality, using best models only where needed.

## Phase-Based Tier Mapping

Workflow phases also use different tiers:

### Production Phase Mapping

```typescript
{
  "phaseOverrides": {
    "phase1_analysis": "standard",      // 4 parallel analyzers
    "phase2_consolidation": "standard", // Merge findings
    "phase3_synthesis": "advanced",     // Most critical - use opus/gpt5/gemini
    "phase4_context": "standard",       // Context generation
    "phase5_resources": "fast",         // Simple resource copying
    "phase6_validation": "fast"         // Final validation
  }
}
```

**Strategy**: Use "advanced" tier only for Phase 3 synthesis (most complex reasoning).

## CLI Override Support

Override specific models on the fly:

```bash
# Force opus for all planner invocations
export MODEL_PLANNER=opus-latest
npm run orchestrate:implement -- --ticket-id PROJ-123

# Force GPT-5 for implementers while using Anthropic for everything else
export NODE_ENV=production
export MODEL_IMPLEMENTER=gpt5-latest
npm run orchestrate:implement -- --ticket-id PROJ-123
```

## Provider-Specific Configuration

### Anthropic Claude

**Required Environment Variable**:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Latest Models** (as of March 2026):
- `claude-sonnet-4-6`: 1M context, adaptive thinking, 79.6% SWE-bench
- `claude-opus-4-6`: 1M context, 128K output, best for agents
- `claude-haiku-4-5-20251001`: Near-frontier performance, cost-efficient

**Capabilities**:
- Extended thinking (all models)
- Adaptive thinking (Sonnet 4.6, Opus 4.6)
- Best for coding tasks (highest SWE-bench scores)

### OpenAI GPT

**Required Environment Variable**:
```bash
export OPENAI_API_KEY=sk-...
```

**Latest Models** (as of March 2026):
- `gpt-5.4-2026-03-05`: Flagship model for complex reasoning
- `gpt-5.4-mini-2026-03-17`: High-volume workloads, cost-efficient

**Capabilities**:
- Strong general reasoning
- Lower context window (200K vs 1M for Claude/Gemini)
- Competitive pricing on mini variant

### Google Gemini

**Required Environment Variable**:
```bash
export GOOGLE_API_KEY=...
```

**Latest Models** (as of February 2026):
- `gemini-3.1-pro-preview`: Most advanced reasoning model
- `gemini-2.5-flash`: Best price-performance for low-latency

**Capabilities**:
- 1M context window (matching Claude)
- Strong multimodal capabilities
- Competitive pricing

## Cost Optimization Strategies

### Strategy 1: Environment-Based Tiers

Use cheap models in development, expensive in production:

```bash
# Development - all fast tier
export NODE_ENV=development
# ~80% cost savings vs production

# Production - tiered approach
export NODE_ENV=production
# Uses opus only for phase3_synthesis
```

### Strategy 2: Mixed Provider Approach

Use different providers for different phases:

```bash
# Use OpenAI mini for fast phases, Anthropic Opus for synthesis
export NODE_ENV=production
export MODEL_PHASE5_RESOURCES=gpt5-mini
export MODEL_PHASE6_VALIDATION=gpt5-mini
export MODEL_PHASE3_SYNTHESIS=opus-latest
```

### Strategy 3: Agent-Specific Providers

Use best model for each agent type:

```bash
export NODE_ENV=production
export MODEL_PLANNER=sonnet-latest      # Claude for planning
export MODEL_IMPLEMENTER=gpt5-latest    # GPT-5 for implementation
export MODEL_REVIEWER=opus-latest       # Opus for review
```

## Programmatic Usage

### Get Current Provider

```typescript
import { getLLMFactory } from './llm/llm-factory.js';

const factory = getLLMFactory();
const provider = factory.getEffectiveProvider();
console.log(`Using provider: ${provider}`); // "anthropic" | "openai" | "google"
```

### List Available Environments

```typescript
const environments = factory.listEnvironments();
// ['development', 'development-openai', 'development-gemini', ...]
```

### Get Tier Mapping for Current Environment

```typescript
const tierMapping = factory.getTierMapping();
// { fast: "haiku-latest", standard: "sonnet-latest", advanced: "opus-latest" }
```

### Create Model with Provider Override

```typescript
// Set environment to use OpenAI
process.env.NODE_ENV = 'development-openai';

const model = await factory.createModel('sonnet-latest', {
  agent: 'planner'
});

// Model will actually be gpt5-mini (fast tier in development-openai)
```

## Model Resolution Priority

The LLM factory resolves models in this order:

1. **CLI Override** (highest priority)
   - `export MODEL_PLANNER=opus-latest`

2. **Environment Variable**
   - `export MODEL_SONNET_LATEST=opus-latest`

3. **Environment-Specific Agent Tier Override**
   - `development.agentOverrides.planner = "fast"`

4. **Environment-Specific Phase Tier Override**
   - `production.phaseOverrides.phase3_synthesis = "advanced"`

5. **Base Agent Mapping**
   - `agentModelMapping.planner = "sonnet-latest"`

6. **Base Phase Mapping**
   - `phaseModelMapping.phase3_synthesis = "opus-latest"`

7. **Provided Alias** (lowest priority)
   - Default to the alias passed to `createModel()`

## Migration from Hardcoded Models

### Old Approach (Hardcoded)

```typescript
// ❌ Brittle - breaks when model is deprecated
const agent = await createDeepAgent({
  model: "anthropic:claude-sonnet-4-5-20250929",
  instructions: "..."
});
```

### New Approach (Alias-Based)

```typescript
// ✅ Flexible - works with any provider
const factory = getLLMFactory();
const model = await factory.createModel("sonnet-latest", {
  agent: "planner"
});

const agent = await createDeepAgent({
  model: model,
  instructions: "..."
});
```

## Troubleshooting

### Issue: "API key not found"

**Solution**: Set the required environment variable for your provider:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
```

### Issue: "Unknown model alias"

**Solution**: List available aliases and check your configuration:
```typescript
const factory = getLLMFactory();
console.log(factory.listAliases());
// ['sonnet-latest', 'haiku-latest', 'opus-latest', 'gpt5-latest', 'gpt5-mini', ...]
```

### Issue: Wrong provider being used

**Solution**: Check your `NODE_ENV`:
```bash
echo $NODE_ENV
# Should be: development, development-openai, production-gemini, etc.

# Verify effective provider
node -e "import('./llm/llm-factory.js').then(m => console.log(m.getLLMFactory().getEffectiveProvider()))"
```

## Best Practices

1. **Use Environment Variables**: Never hardcode model IDs in your code
2. **Leverage Tiers**: Use fast/standard/advanced tiers for flexibility
3. **Test with Multiple Providers**: Verify your workflow works with all three providers
4. **Monitor Costs**: Use development environments for iteration, production for final runs
5. **Document Overrides**: If you override models via CLI, document why in your workflow

## References

- [Model Configuration Schema](../config/model-config.json)
- [Model Updates Documentation](../config/MODEL_UPDATES.md)
- [LLM Factory Implementation](../src/llm/llm-factory.ts)
- [LLM Factory Tests](../src/llm/llm-factory.test.ts)

---

**Last Updated**: March 19, 2026
**Configuration Version**: 1.0.0
