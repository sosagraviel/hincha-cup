---
sidebar_position: 2
title: Provider Switching
description: Switch between Anthropic, OpenAI, and Google AI providers
---

# Provider Switching

Switch between AI providers (Anthropic, OpenAI, Google) using model tiers and environment variables.

## Quick Start

### Switch to OpenAI

```bash
export MODEL_TIER=openai
pnpm implement -- -p /path/to/project --ticket-id PROJ-123
```

### Switch to Google Gemini

```bash
export MODEL_TIER=gemini
pnpm implement -- -p /path/to/project --ticket-id PROJ-123
```

### Use Anthropic (Default)

```bash
export MODEL_TIER=standard  # or fast, advanced
pnpm implement -- -p /path/to/project --ticket-id PROJ-123
```

## Available Model Tiers

### Standard Tier (Default)

**Provider**: Anthropic  
**Cost**: Balanced performance and cost

| Agent Type | Model |
|-----------|-------|
| Planner | Sonnet 4.6 |
| Implementer | Sonnet 4.6 |
| Reviewer | Sonnet 4.6 |
| Analyzers | Sonnet 4.6 |

**Use Cases**: General-purpose development, feature implementation, bug fixes

### Fast Tier

**Provider**: Anthropic  
**Cost**: Optimized for speed and cost

| Agent Type | Model |
|-----------|-------|
| Planner | Sonnet 4.6 |
| Implementer | Sonnet 4.6 |
| Reviewer | Sonnet 4.6 |
| Analyzers | Haiku 4.5 |

**Use Cases**: Rapid iteration, testing, experimentation

### Advanced Tier

**Provider**: Anthropic  
**Cost**: Maximum capability

| Agent Type | Model |
|-----------|-------|
| Planner | Opus 4.6 |
| Implementer | Opus 4.6 |
| Reviewer | Opus 4.6 |
| Analyzers | Opus 4.6 |

**Use Cases**: Complex features, critical code reviews, architectural planning

### OpenAI Tier

**Provider**: OpenAI  
**Cost**: GPT-5.4 pricing

| Agent Type | Model |
|-----------|-------|
| Planner | GPT-5.4 |
| Implementer | GPT-5.4 |
| Reviewer | GPT-5.4 |
| Analyzers | GPT-5.4 Mini |

**Use Cases**: Testing GPT-5.4 capabilities, OpenAI-specific workflows

### Gemini Tier

**Provider**: Google  
**Cost**: Gemini pricing

| Agent Type | Model |
|-----------|-------|
| Planner | Gemini 3.1 Pro |
| Implementer | Gemini 3.1 Pro |
| Reviewer | Gemini 3.1 Pro |
| Analyzers | Gemini 2.5 Flash |

**Use Cases**: Testing Gemini capabilities, cost optimization

## Provider-Specific Features

### Anthropic Claude

**Latest Models** (March 2026):
- `claude-sonnet-4-6`: 1M context, adaptive thinking, 79.6% SWE-bench
- `claude-opus-4-6`: 1M context, 128K output, best for agents
- `claude-haiku-4-5`: Near-frontier performance, cost-efficient

**Capabilities**:
- Extended thinking (all models)
- Adaptive thinking (Sonnet 4.6, Opus 4.6)
- Best for coding tasks (highest SWE-bench scores)

**Required**:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

### OpenAI GPT

**Latest Models** (March 2026):
- `gpt-5.4-2026-03-05`: Flagship model for complex reasoning
- `gpt-5.4-mini-2026-03-17`: High-volume workloads, cost-efficient

**Capabilities**:
- Strong general reasoning
- Lower context window (200K vs 1M for Claude/Gemini)
- Competitive pricing on mini variant

**Required**:
```bash
export OPENAI_API_KEY=sk-...
```

### Google Gemini

**Latest Models** (February 2026):
- `gemini-3.1-pro-preview`: Most advanced reasoning model
- `gemini-2.5-flash`: Best price-performance for low-latency

**Capabilities**:
- 1M context window (matching Claude)
- Strong multimodal capabilities
- Competitive pricing

**Required**:
```bash
export GOOGLE_API_KEY=...
```

## Cost Optimization Strategies

### Strategy 1: Use Fast Tier for Development

```bash
# Development iteration
export MODEL_TIER=fast
# ~50% cost savings vs standard tier

# Production runs
export MODEL_TIER=advanced
```

### Strategy 2: Mix Providers by Phase

```bash
# Use Haiku for analyzers, Opus for synthesis
export MODEL_TIER=fast  # Uses Haiku for Phase 1 analyzers
# Synthesis automatically uses Sonnet (configured in model-config.json)
```

### Strategy 3: Provider Competition

Test same workflow with different providers:

```bash
# Test with Anthropic
export MODEL_TIER=standard
pnpm implement -- --ticket-id PROJ-123

# Test with OpenAI
export MODEL_TIER=openai
pnpm implement -- --ticket-id PROJ-124

# Compare quality and cost
```

## Model Configuration

All model mappings are defined in `orchestration/config/model-config.json`:

```json
{
  "tiers": {
    "standard": {
      "provider": "anthropic",
      "agents": {
        "planner": "sonnet-latest",
        "implementer": "sonnet-latest"
      }
    },
    "openai": {
      "provider": "openai",
      "agents": {
        "planner": "gpt5-latest",
        "implementer": "gpt5-latest"
      }
    }
  }
}
```

## Troubleshooting

### Error: "API key not found"

**Solution**: Set the required environment variable for your provider:

```bash
# Check which tier you're using
echo $MODEL_TIER

# Set the appropriate API key
export ANTHROPIC_API_KEY=sk-ant-...  # for standard/fast/advanced
export OPENAI_API_KEY=sk-...         # for openai
export GOOGLE_API_KEY=...            # for gemini
```

### Error: "Unknown tier"

**Solution**: Use a valid tier name:

```bash
# Valid tiers
export MODEL_TIER=standard
export MODEL_TIER=fast
export MODEL_TIER=advanced
export MODEL_TIER=openai
export MODEL_TIER=gemini

# Invalid (will error)
export MODEL_TIER=sonnet  # ❌ Use "standard" instead
export MODEL_TIER=opus    # ❌ Use "advanced" instead
```

### Wrong Model Being Used

**Solution**: Check your tier configuration:

```bash
# Verify current tier
echo $MODEL_TIER

# Check effective models
cat orchestration/config/model-config.json | jq ".tiers.$MODEL_TIER"
```

## Best Practices

1. **Use Standard Tier by Default**: Good balance of cost and quality
2. **Use Fast Tier for Iteration**: Save costs during development
3. **Use Advanced Tier for Critical Work**: Complex features, production code
4. **Test Multiple Providers**: Different models excel at different tasks
5. **Monitor Costs**: Track API usage across providers

## See Also

- [Authentication](./authentication.md) - Configure API keys for providers
- [Environment Variables](./environment-variables.md) - Complete environment variable reference
- [Skills Reference](/docs/reference/skills-catalog.md) - Invokable skills (commands) and options
