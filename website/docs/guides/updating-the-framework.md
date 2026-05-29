---
sidebar_position: 6
title: Updating the Framework
description: Pull the latest skills, agents, and scripts into your project with one command — no re-initialization needed.
---

# Updating the Framework

When a new framework version ships, you usually **don't** need to re-initialize your project.
Re-running `initialize-project.sh` re-analyzes your entire codebase with AI agents — slow and
costly. To simply pick up the latest skills, agents, and scripts, run the sync instead:

```bash
# 1. Pull the latest framework
cd qubika-agentic-framework && git pull && cd ..

# 2. Sync the new resources into your project
./qubika-agentic-framework/scripts/sync-framework-resources.sh
```

That's it. The sync is **idempotent** — safe to run any number of times; it only touches what
actually changed.

---

## What gets synced

- **Skills** — new and updated skills copied into `.claude/skills/` (or `.codex/skills/`).
- **Agents** — regenerated from the framework's templates when those templates change.
- **Preflight scripts** — runtime helper scripts that skills depend on, shipped into
  `.claude/scripts/` so your project stays self-sufficient.
- **MCP config** — the `code_graph` MCP server entry in `.mcp.json` (Claude) or `config.toml` (Codex).
- **Legacy cleanup** — obsolete folders from older framework versions (e.g. `.claude/commands/`)
  are removed automatically.

> **Restart your CLI** after a sync that changes MCP config so `/mcp` picks up `code_graph`.

---

## What survives a sync — and what doesn't

- **Hand-added skills with new names are always safe.** The sync only manages skills the framework
  shipped, so a skill you created yourself is never touched.
- **A timestamped backup** of your skills and agents is written **before any change**, to
  `.claude-temp/backups/<timestamp>/` — so nothing is ever lost irrecoverably.

:::warning

If you edit a **framework-managed** skill in place (e.g. tweaking `implement-ticket`), your change
survives only as long as the framework doesn't update that same skill. When a later release **does**
change it, the sync overwrites your edit (the backup above is your safety net). The sync logs
"user modifications detected", but it does not currently skip them automatically.

To make a custom version stick, either keep your customization in a **separate, new skill**, or set
`"managed_by_framework": false` for that skill in `framework-config.json` — which makes the sync skip
it, at the cost of no longer receiving framework updates for it.
:::

---

## Provider

The provider is **auto-detected** from your existing config directory (`.claude/` or `.codex/`).
Pass `--provider claude|codex` explicitly only when both directories exist or neither does yet:

```bash
./qubika-agentic-framework/scripts/sync-framework-resources.sh --provider codex
```

---

## Sync vs. re-initialize

| Your situation | Run |
| --- | --- |
| Just want the latest skills/agents (default) | `sync-framework-resources.sh` |
| Switching provider (Claude ↔ Codex) | `initialize-project.sh --provider codex` |
| Want re-analyzed project context / regenerated `CLAUDE.md` | `initialize-project.sh` (re-init) |
| Project structure changed dramatically | `initialize-project.sh` (re-init) |

For the full bootstrap process, see [Initialize Project](/docs/workflows/initialize-project).

---

## Troubleshooting

If the sync fails with `ERR_MODULE_NOT_FOUND` (a stale `orchestration/node_modules/` after a
framework upgrade), see
[Troubleshooting → Syncing Framework Resources](/docs/getting-started/troubleshooting#syncing-framework-resources).
