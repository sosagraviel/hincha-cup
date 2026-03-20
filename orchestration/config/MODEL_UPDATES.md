# Model Configuration Updates - March 2026

This document summarizes the model configuration updates made to ensure we're using the latest available models from each provider.

## Updated Model Aliases

### Anthropic Claude Models

| Alias | Previous Model | Updated Model | Release Date | Key Improvements |
|-------|---------------|---------------|--------------|------------------|
| `sonnet-latest` | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-6` | Feb 17, 2026 | 1M context, adaptive thinking, 79.6% SWE-bench |
| `haiku-latest` | `claude-haiku-4-20250514` | `claude-haiku-4-5-20251001` | Oct 15, 2025 | Near-frontier performance, cost-efficient |
| `opus-latest` | `claude-opus-4-5-20251101` | `claude-opus-4-6` | Feb 2026 | 1M context, 128K output, best for agents |

**Key Changes:**
- Sonnet 4.6: Now uses latest February 2026 release with adaptive thinking
- Haiku 4.5: Updated to October 2025 release (with date code)
- Opus 4.6: Latest flagship model for complex reasoning
- All models now support extended thinking
- Context windows increased to 1M tokens for Sonnet/Opus

### OpenAI GPT Models

| Alias | Previous Model | Updated Model | Release Date | Notes |
|-------|---------------|---------------|--------------|-------|
| `gpt4-latest` | `gpt-4o-2025-05-13` | `gpt-5.4-2026-03-05` | Mar 5, 2026 | GPT-5.4 flagship model |
| **NEW** `gpt5-mini` | N/A | `gpt-5.4-mini-2026-03-17` | Mar 17, 2026 | High-volume workloads |

**Key Changes:**
- Replaced GPT-4o with GPT-5.4 (GPT-4o deprecated Feb 2026)
- Added GPT-5.4 mini for cost-efficient high-volume tasks
- GPT Codex models deprecated (use GPT-5.x instead)

### Google Gemini Models

| Alias | Previous Model | Updated Model | Release Date | Notes |
|-------|---------------|---------------|--------------|-------|
| `gemini-latest` | `gemini-2.0-flash-exp` | `gemini-3.1-pro-preview` | Feb 19, 2026 | Most advanced reasoning |
| **NEW** `gemini-flash` | N/A | `gemini-2.5-flash` | 2026 | Best price-performance |

**Key Changes:**
- Upgraded to Gemini 3.1 Pro (latest generation)
- Added Gemini 2.5 Flash for cost-efficient tasks
- Gemini 2.0 models being retired June 1, 2026
- 1M token context window on both models

## Agent Model Mappings

Added new agent mappings for the 6-phase Initialize Project workflow:

```json
"structure-architecture-analyzer": "sonnet-latest",
"tech-stack-dependencies-analyzer": "sonnet-latest",
"code-patterns-testing-analyzer": "sonnet-latest",
"data-flows-integrations-analyzer": "sonnet-latest",
"architect-synthesizer": "opus-latest",
"question-consolidator": "sonnet-latest"
```

## Phase Model Mappings

Updated to match the 6-phase workflow:

```json
"phase1_analysis": "sonnet-latest",        // 4 parallel analyzers
"phase2_consolidation": "sonnet-latest",   // Consolidation
"phase3_synthesis": "opus-latest",         // Synthesis (most powerful)
"phase4_context": "sonnet-latest",         // Context generation
"phase5_resources": "haiku-latest",        // Resource copying (simple)
"phase6_validation": "haiku-latest"        // Validation (simple)
```

## Environment-Specific Overrides

### Development
Uses Haiku (fastest/cheapest) for all Phase 1 analyzers to speed up development iterations.

### Staging
Uses Sonnet for analysis and consolidation phases.

### Production
Uses Opus for synthesis phase (most critical for quality).

## Capability Enhancements

### New Capabilities Added

**Anthropic Models:**
- `extended-thinking`: All Claude 4.5+ models
- `adaptive-thinking`: Sonnet 4.6 and Opus 4.6

**Context Windows:**
- Sonnet 4.6: 1M tokens (up from 200K)
- Opus 4.6: 1M tokens (up from 200K)
- Haiku 4.5: 200K tokens (unchanged)

**Max Output Tokens:**
- Opus 4.6: 128K tokens (up from 64K)
- Sonnet 4.6: 64K tokens (unchanged)
- Haiku 4.5: 64K tokens (unchanged)

## Migration Notes

1. **Claude 3 Haiku Deprecation**: `claude-3-haiku-20240307` will be retired April 19, 2026. Already migrated to Haiku 4.5.

2. **GPT-4o Retirement**: GPT-4o was retired from ChatGPT on February 13, 2026. API access continues but migrated to GPT-5.4.

3. **Gemini 2.0 Retirement**: Gemini 2.0 Flash models retiring June 1, 2026. Already migrated to Gemini 2.5/3.1.

## Performance Benchmarks

### SWE-bench Verified (Coding)
- Claude Opus 4.6: Leading performance
- Claude Sonnet 4.6: 79.6%
- Claude Sonnet 4.5: Baseline

### OSWorld (Computer Tasks)
- Claude Sonnet 4.6: 72.5%
- Claude Sonnet 4.5: 61.4%

## Cost Optimization

**Development Environment:**
- Uses Haiku for all simple tasks → ~80% cost savings
- Uses Haiku for Phase 1 analyzers → Faster iteration

**Production Environment:**
- Uses Opus only for Phase 3 synthesis (most critical)
- Uses Sonnet for most phases (best balance)
- Uses Haiku for simple tasks (Phase 5, 6)

## References

- [Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [What's New in Claude 4.6](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-6)
- [Claude Sonnet 4.6 Announcement](https://www.anthropic.com/news/claude-sonnet-4-6)
- [Gemini Models Documentation](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 3.1 Pro Announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/)
- [OpenAI GPT-5.4 Models](https://developers.openai.com/api/docs/models/gpt-5.4)

---

**Last Updated**: March 19, 2026
**Configuration Version**: 1.0.0
