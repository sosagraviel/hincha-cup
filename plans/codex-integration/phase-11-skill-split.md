# Phase 11 — Skill & Command Provider Adaptation

## Goal

Make every skill and command the framework ships with work correctly after
`sync-framework-resources.sh` has run against either provider. Before this
phase, skills contained hardcoded `.claude/` and `CLAUDE.md` references that
leaked into Codex projects, and the `implement-ticket` skill encoded Claude's
subagent/task-tracking model in a way Codex cannot execute.

## Two Authoring Patterns

| Divergence       | Pattern                         | When to use                                    |
| ---------------- | ------------------------------- | ---------------------------------------------- |
| Light (paths)    | A — single `SKILL.md` + tokens  | Only paths, filenames, or provider names vary  |
| Heavy (semantics)| B — `SKILL.claude.md` + `.codex.md` | Tool availability or execution model differs |

### Pattern A — Placeholder Substitution

Tokens rewritten at sync time by `substitutePlaceholders()` in
`orchestration/src/utils/skill-placeholders.ts`:

| Token                 | Claude        | Codex          |
| --------------------- | ------------- | -------------- |
| `{{CONFIG_DIR}}`      | `.claude`     | `.codex`       |
| `{{INSTRUCTION_FILE}}`| `CLAUDE.md`   | `AGENTS.md`    |
| `{{TEMP_DIR}}`        | `.claude-temp`| `.codex-temp`  |
| `{{PROVIDER_NAME}}`   | `Claude Code` | `Codex CLI`    |

Unknown `{{TOKEN}}` → hard error (fail-closed). `.md` files get substitution;
other assets are byte-copied.

### Pattern B — Dual Source Files

`skill-copier.ts` picks `SKILL.<provider>.md` when both variants exist, copies
it to the target as `SKILL.md`, and runs Pattern A substitution on top. A plain
`SKILL.md` alongside variants throws an ambiguous-source error — intentional,
so authors pick one layout per skill.

## Touched Skills

### Pattern B — split into two files

- `020-development-workflow/implement-ticket/SKILL.claude.md`
  - Uses `TaskCreate` + `TaskUpdate` for 11-phase tracking (Ctrl+T visibility).
  - Each phase spawns the relevant subagent via the `Task` tool.
- `020-development-workflow/implement-ticket/SKILL.codex.md`
  - Tracks progress by appending JSONL events to
    `{{TEMP_DIR}}/tickets/<id>/progress.jsonl`.
  - Each phase reads the role prompt from `{{CONFIG_DIR}}/agents/` and swaps
    persona inline (no subagent spawning).

### Pattern A — templated in place

Path references replaced with placeholder tokens:

- `010-foundation/start-task`
- `020-development-workflow/create-sdd-ticket`
- `020-development-workflow/code-implementation`
- `020-development-workflow/analyze-requirements`
- `020-development-workflow/skill-creator`
- `020-development-workflow/architect-agent`
- `030-quality-assurance/pr-reviewer`
- `030-quality-assurance/security-review`
- `030-quality-assurance/code-quality-check`
- `030-quality-assurance/doc-updater`
- `040-integrations/fetch-ticket-context`
- `commands/task-management/start-task.md`

## Agent Frontmatter Rewrite

`agent-generator.ts#writeAgents()` now runs `rewriteAgentFrontmatter()` before
writing each agent. For Claude the content passes through; for Codex:

- `model: opus|sonnet` → `model: gpt-5.4`
- `model: haiku` → `model: gpt-5.4-mini-2026-03-17`
- `tools: …` line is stripped entirely (Codex has no analogue)

Default fallback for unknown aliases is `gpt-5.4`. Body and other frontmatter
fields (`name`, `description`, `skills`) are preserved verbatim.

## CLI / Script Wiring

- `scripts/initialize-project.sh` — already supported `--provider`.
- `scripts/implement-ticket.sh` — now accepts `--provider`, auto-detects from
  `framework-config.json` presence in `.claude/` vs `.codex/`, and refuses to
  proceed when both are initialized without explicit disambiguation.
- `scripts/sync-framework-resources.sh` — forwards `$@` to the TS script.
- `orchestration/src/scripts/sync-framework-resources.ts` — resolves provider
  from `--provider` flag, `$PROVIDER` env, or disk (`resolveProviderFromEnvOrDisk`),
  then calls `setActiveProvider()` before any path resolution.
- `syncSingleCommand` now applies placeholder substitution to `.md` command
  files; non-`.md` assets are byte-copied.

## Tests Added

- `test/unit/utils/skill-placeholders.test.ts` — 17 cases covering token
  substitution, unknown-token rejection, and mixed content.
- `test/unit/nodes/initialize-project/phase5/helpers/skill-copier.test.ts` —
  real-filesystem tests for the four source-layout cases (plain only,
  variant only, both → error, neither → noop).
- `test/unit/nodes/initialize-project/phase5/helpers/agent-frontmatter.test.ts`
  — 9 cases covering Claude identity pass-through, Codex model remap per
  alias, tools-line removal, body preservation.

## Invariants

1. Claude output is unchanged when `getActiveProvider() === CLAUDE`.
2. `sync-framework-resources.sh` run twice against the same provider produces
   no further changes (idempotency).
3. Running both providers in sequence against the same project is ambiguous
   and must be rejected — the user picks one.
4. A new skill added to `skills.config.json` that references
   `{{…}}` tokens not in the registered set fails the sync.
