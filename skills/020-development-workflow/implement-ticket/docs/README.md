# implement-ticket

End-to-end ticket implementation through an 11-phase SDLC workflow — from context gathering through planning, implementation, testing, documentation, PR creation, review, and cleanup.


## Invocation

The skill is `user-invokable` — invoke it directly in Claude Code using slash syntax:

```
/implement-ticket --from-jira PROJ-123
/implement-ticket --from-jira https://your.atlassian.net/browse/PROJ-123
/implement-ticket --from-markdown ./specs/PROJ-123.md
/implement-ticket --from-input "Fix login validation bug where empty password bypasses auth"
```

With skip flags:

```
/implement-ticket --from-jira PROJ-123 --skip-pr
/implement-ticket --from-jira PROJ-123 --skip-tests --skip-visual
/implement-ticket --from-markdown ./spec.md --branch custom-branch-name
```

## Flags

| Flag | Description | Example |
|---|---|---|
| `--from-input "<desc>"` | Plain-text ticket description | `--from-input "Add rate limiting to /api/login"` |
| `--from-jira <KEY-OR-URL>` | Fetch from Jira via MCP | `--from-jira QAF-42` or `--from-jira https://company.atlassian.net/browse/QAF-42` |
| `--from-markdown <PATH>` | Read SDD ticket from markdown file | `--from-markdown ./specs/QAF-42.md` |
| `--skip-tests` | Mark Phase 5 as Skipped (dev/experimental only) | — |
| `--skip-visual` | Mark Phase 6 as Skipped (when no frontend changes exist) | — |
| `--skip-pr` | Commit changes locally but don't push or create a PR | — |
| `--branch <NAME>` | Use custom branch name instead of auto-generated | `--branch hotfix/qaf-42` |

Flags are space-separated in a single argument string.

## What happens when you invoke it

The skill ships as two provider-specific files — `SKILL.claude.md` and
`SKILL.codex.md` — because the execution model differs materially between
providers. The sync pipeline picks the right one and writes it to the target
project as `SKILL.md`:

- **Claude Code**: `TaskCreate` tracks the 11 phases (Ctrl+T visibility) and
  each phase spawns the relevant subagent via the `Task` tool.
- **Codex CLI**: no programmatic subagent spawning — progress is tracked by
  appending JSONL events to `.codex-temp/tickets/<id>/progress.jsonl`, and the
  agent switches personas by reading the corresponding role prompt from
  `.codex/agents/` inline.

See the provider-specific SKILL file for the authoritative phase definitions.
Summary (identical in both):

| Phase | Work | Key agents/skills |
|---|---|---|
| 0 | Preflight validation (git clean, tests pass, build succeeds) | — |
| 1 | Context gathering | `/fetch-ticket-context` (Jira only) |
| 2 | Planning | `/analyze-requirements`, `planner` agent |
| 3 | Environment setup (branch, ports, seed data, BEFORE screenshots) | — |
| 4 | Implementation | `implementer-{lang}` agent |
| 5 | Testing (unit, integration, E2E with up to 3 fix iterations) | `implementer-{lang}` on failure |
| 6 | Visual verification (skipped if no frontend changes) | `visual-verifier` agent |
| 7 | Documentation updates | `/doc-updater` |
| 8 | PR creation (skipped via `--skip-pr`) | — |
| 9 | Review loop (up to 3 iterations) | `/pr-reviewer`, `/security-review`, `implementer-{lang}` |
| 10 | Cleanup (teardown env, archive artifacts) | — |

On Claude, each phase creates a `TaskCreate` entry for Ctrl+T progress
visibility. On Codex, each phase appends an `in_progress` / `completed`
/ `failed` JSONL record to `progress.jsonl` under the temp directory.

## Prerequisites

- Project initialized with `/initialize-project`
- Git repository with remote configured
- Tests passing in current state
- For `--from-jira`: Jira MCP server configured and `cloudId` accessible
- For Phase 8 PR creation: GitHub MCP or `gh` CLI authenticated

## Artifacts

All artifacts for a ticket live under the provider's temp dir
(`.claude-temp/` for Claude, `.codex-temp/` for Codex):

```
<TEMP_DIR>/tickets/<TICKET_ID>/artifacts/
├── checkpoints/          # phase{0-10}-*.json — disk-first idempotency markers
├── context/              # ticket context gathered in Phase 1
├── plans/                # Phase 2 implementation plan + test plan
├── implementations/      # Phase 4 implementer output + changed-files manifest
├── tests/                # Phase 5 test-results.json
├── screenshots/          # Phase 6 (before/after/diffs)
├── decisions/            # autonomous decisions log (when run in --no-stop mode)
└── QAF-<N>-artifacts-<TIMESTAMP>.tar.gz  # Phase 10 archive
```

This directory is git-ignored — artifacts never pollute PRs.

## Companion agent

[`agents/config-updater.md`](../agents/config-updater.md) — a companion agent that Phase 7 uses to detect stack changes (new languages, new frameworks) and update `framework-config.json` accordingly. Spawned only when Phase 4 added new tech to the stack.
