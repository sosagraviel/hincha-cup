# Codex (OpenAI) Integration Plan

## Executive Summary

This plan details the integration of OpenAI Codex CLI as a first-class provider in the AI Agentic Framework, alongside the existing Claude Code CLI support. The goal is to allow the 6000+ developers with ChatGPT subscriptions to use the framework with Codex CLI (OAuth-based, subscription-included) or OpenAI API keys.

## Research Findings

### Authentication Decision: CLI (OAuth) vs API Key

**Recommendation: Codex CLI with ChatGPT OAuth (subscription mode) as primary, API key as fallback.**

**Why:**
1. **ChatGPT subscriptions do NOT include API access.** API keys require a separate OpenAI Platform organization with separate billing. Your 6000+ developers have ChatGPT subscriptions, not API Platform accounts.
2. **Codex CLI with OAuth is free with subscription.** Usage counts against the subscription's message limits (rolling 5-hour windows), not per-token billing.
3. **API key mode is dramatically more expensive** for the same work. A complex task might cost $2-15 per run with API tokens vs. $0 additional cost with subscription.
4. **Both modes should be supported** because some CI/CD pipelines need API keys, and some teams may have Platform accounts.

### Codex CLI Feature Mapping

| Claude Code | Codex CLI | Notes |
|------------|-----------|-------|
| `CLAUDE.md` | `AGENTS.md` | Same concept, different name |
| `.claude/` directory | `.codex/` directory | Provider-specific config dir |
| `claude --agent <file>` | `codex exec "<prompt>"` | Codex uses exec subcommand for non-interactive |
| `--dangerously-skip-permissions` | `--yolo` | Same effect: bypass all approvals/sandbox |
| `--model sonnet` | `--model gpt-5.4` | Different model names |
| `--session-id <id>` | Session auto-managed | Codex manages sessions internally |
| `--resume <id>` | `codex resume <id>` | Separate subcommand |
| `--settings <file>` | `--config key=value` or config.toml | Different config mechanism |
| `--tools <list>` | No equivalent | Codex manages tools internally |
| `settings.json` hooks | `hooks.json` hooks | Different format, similar events |
| `CLAUDE_SKIP_CONFIRMATIONS=1` | `--yolo` flag | Different mechanism |
| `claude auth status` | `codex login` | Different auth check |
| `~/.claude/.credentials.json` | `~/.codex/auth.json` | Different credential storage |

### Hook System Comparison

| Event | Claude Code | Codex CLI | Compatible? |
|-------|------------|-----------|-------------|
| Stop/validation | `Stop` hook | `Stop` hook | YES - same concept |
| Pre-tool | `pre-tool-use-hook` | `PreToolUse` | YES - same concept |
| Post-tool | `post-tool-use-hook` | `PostToolUse` | YES - same concept |
| User prompt | `user-prompt-submit-hook` | `UserPromptSubmit` | YES - same concept |
| Session start | N/A | `SessionStart` | Codex only |
| Assistant message | `assistant-message-hook` | N/A | Claude only |

Hook wire format is similar (JSON stdin/stdout) but event names and payload structures differ.

## Architecture Decision

### Provider Abstraction Layer

The framework needs a **Provider abstraction** that encapsulates all provider-specific behavior:

```
ProviderAdapter (interface)
  |
  +-- ClaudeProvider (existing behavior)
  |     - CLI: claude --agent <file> --model <model> ...
  |     - Config dir: .claude/
  |     - Instruction file: CLAUDE.md
  |     - Hooks format: Claude settings.json
  |
  +-- CodexProvider (new)
        - CLI: codex exec "<prompt>" --model <model> ...
        - Config dir: .codex/
        - Instruction file: AGENTS.md
        - Hooks format: Codex hooks.json
```

### What Changes and What Stays

**Stays the same:**
- LangGraph workflow orchestration (graph topology, phases)
- Phase 1-6 pipeline logic
- Schema registry and Zod validation
- DeepAgents integration (already multi-provider via LLMFactory)
- Model config JSON structure (already has OpenAI tier)
- Agent template system (Handlebars)
- Skill resolution and assignment

**Must change:**
- Auth detection (add Codex CLI detection)
- Agent factory (add Codex CLI implementation)
- CLI utils (add Codex CLI path detection, model mapping)
- Preflight checks (add Codex CLI validation)
- Sync script (provider-aware target directories)
- Phase 3 synthesis (generate AGENTS.md OR CLAUDE.md based on provider)
- Phase 4 context generation (write to correct provider directory)
- Phase 5 resources (sync to correct provider directory)
- Phase 6 validation (validate correct provider artifacts)
- Settings/hooks translation (Claude settings.json -> Codex hooks.json)
- Agent file frontmatter validation (different valid fields per provider)
- All hardcoded `.claude/` paths
- All hardcoded `CLAUDE.md` references

## Phase Overview

| Phase | Name | Scope | Dependencies |
|-------|------|-------|-------------|
| 1 | Provider Abstraction Layer | Core interfaces and types | None |
| 2 | Auth & Detection | Codex CLI detection, auth, preflight | Phase 1 |
| 3 | Codex CLI Agent Implementation | CLI spawning, process management | Phase 1, 2 |
| 4 | Provider-Aware File System | `.claude/` -> provider dir abstraction | Phase 1 |
| 5 | Instruction File Generation | AGENTS.md generation alongside CLAUDE.md | Phase 1, 4 |
| 6 | Hook & Settings Translation | Convert hooks between provider formats | Phase 1, 3 |
| 7 | Initialize-Project Integration | Multi-provider pipeline + prompts | Phase 1-6 |
| 8 | Implement-Ticket Integration | Multi-provider skill & workflow | Phase 1-6 |
| 9 | Sync & Resource Management | Provider-aware sync operations | Phase 4 |
| 10 | Testing & Validation | Unit tests, integration tests, E2E | Phase 1-9 |

## File Index

- [Phase 1: Provider Abstraction Layer](./phase-01-provider-abstraction.md)
- [Phase 2: Auth & Detection](./phase-02-auth-detection.md)
- [Phase 3: Codex CLI Agent Implementation](./phase-03-codex-cli-impl.md)
- [Phase 4: Provider-Aware File System](./phase-04-provider-filesystem.md)
- [Phase 5: Instruction File Generation](./phase-05-instruction-file-gen.md)
- [Phase 6: Hook & Settings Translation](./phase-06-hooks-translation.md)
- [Phase 7: Initialize-Project Integration](./phase-07-init-project.md)
- [Phase 8: Implement-Ticket Integration](./phase-08-implement-ticket.md)
- [Phase 9: Sync & Resource Management](./phase-09-sync-resources.md)
- [Phase 10: Testing & Validation](./phase-10-testing.md)
