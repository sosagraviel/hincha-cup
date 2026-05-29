# Agent templates

Handlebars templates Phase 5 of `/initialize-project` instantiates into the per-project `.claude/agents/*.md` files. Four templates ship with the framework:

| Template | Renders to | When |
|---|---|---|
| `implementer.template.md` | `implementer-<lang>.md` (one per dedicated language) | A service language has `hasImplementerAgent: true` in the language-config registry. |
| `implementer-generic.template.md` | `implementer-generic.md` | Always. Handles every language that isn't dedicated, plus devops / configs / infra. |
| `planner.template.md` | `planner.md` | Always. Strategic planning agent. |
| `visual-verifier.template.md` | `visual-verifier.md` | Only when the stack profile contains a frontend service. |

## Implementer generation logic

Phase 5 produces dedicated `implementer-<lang>.md` agents only for languages that already have a `mastering-<lang>(-skill)/SKILL.md` under `skills/050-language-frameworks/`. As of this writing the eligible set is:

- `typescript` (← `mastering-typescript/SKILL.md`)
- `python` (← `mastering-python-skill/SKILL.md`)
- `go` (← `mastering-go-skill/SKILL.md`)
- `rust` (← `mastering-rust-skill/SKILL.md`)
- `java` (← `mastering-java-skill/SKILL.md`)
- `scala` (← `mastering-scala-skill/SKILL.md`)
- `ruby` (← `mastering-ruby-skill/SKILL.md`)

Every other language — JavaScript, C#, PHP, Kotlin, Swift, Dart, Elixir, Erlang, Haskell, Shell, SQL, HTML, CSS, etc. — falls through to `implementer-generic.md`. The fall-through is the design, not a gap.

The gating happens in two places:

1. **`languages/<key>.ts::hasImplementerAgent: true`** — set in the language-config registry. Currently only on the 7 languages above.
2. **Phase 6 validator** (`agent-coverage-validator.ts`) — checks that every `hasImplementerAgent: true` language present in a service produced a matching `implementer-<lang>.md` file, and never warns about languages outside that set.

A unit test (`test/unit/services/framework/language-config/language-config.test.ts`) refuses to merge any `hasImplementerAgent: true` entry that doesn't have a matching mastering skill on disk — the flag and the skill must move together.

## Why one shared `implementer.template.md`?

Every dedicated implementer renders the same body. The differentiation between, say, `implementer-typescript.md` and `implementer-python.md` is:

1. **Filename + agent name** — Claude Code's sub-agent dispatcher matches on the name; the planner can request `implementer-typescript` specifically.
2. **Rendered commands** — the `{{lint_command}}`, `{{format_command}}`, `{{type_check_command}}`, `{{unit_test_command}}`, `{{build_command}}` placeholders are filled from the project's manifest scripts when available, otherwise from the language registry's `commandDefaults`.
3. **Bound skills** — `skill-assigner.ts` chooses a per-language subset (e.g. `implementer-typescript` gets `mastering-typescript`, `react-frontend`, `mastering-vitest`; `implementer-generic` gets the cross-stack ones).
4. **Frontmatter description** — `"Implement <language> code following team conventions"` vs `"Expert full-stack and DevOps specialist implementing any file type"`.

The per-language hook stays open: dropping `implementer-typescript.template.md` here would make Phase 5 pick it up automatically (the lookup is "language-specific template first, fall back to the generic one").

## Promoting a new language to a dedicated implementer

When you want, e.g. `php` to get its own `implementer-php.md`:

1. Add `skills/050-language-frameworks/mastering-php-skill/SKILL.md` with PHP-specific conventions.
2. In `orchestration/src/services/framework/language-config/languages/php.ts` add `hasImplementerAgent: true` and confirm `commandDefaults` is populated.
3. Run `pnpm --filter orchestration test:unit` — the registry test will assert the mastering skill exists. If it doesn't, the test fails with an actionable message pointing back at the skill path it expects.
4. (Optional) Drop `implementer-php.template.md` here if PHP-specific body text is needed; otherwise Phase 5 reuses `implementer.template.md`.
5. Done. The next `/initialize-project` run on a PHP project emits `implementer-php.md` automatically.

## Handlebars context exposed to templates

| Placeholder | Source |
|---|---|
| `{{stack}}` | The language name |
| `{{skills}}` | `string[]` of skill IDs bound to this agent |
| `{{lint_command}}` | Project manifest script → registry `commandDefaults.lint` |
| `{{format_command}}` | Project manifest script → registry `commandDefaults.format` |
| `{{type_check_command}}` / `{{typecheck_command}}` | Project manifest → registry `commandDefaults.typecheck` |
| `{{unit_test_command}}` / `{{test_command}}` | Project manifest → registry `commandDefaults.test` |
| `{{build_command}}` | Project manifest → registry `commandDefaults.build` |

`{{type_check_command}}` and `{{typecheck_command}}` (and the matching `{{unit_test_command}}` / `{{test_command}}`) are kept as aliases so templates written in either convention render correctly.

Unrendered placeholders are a hard build failure — `validateRenderedAgent()` in `agent-generators.ts` scans the output for surviving `{{...}}` pairs and aborts the run. The 2026-04-30 audit traced a previous shipping bug to silent placeholder failures; never reintroduce silent rendering.

## See also

- `orchestration/src/nodes/initialize-project/phase5/helpers/agent-generators.ts` — the generation entry points
- `orchestration/src/nodes/initialize-project/phase5/helpers/command-extractor.ts` — manifest-script extraction
- `orchestration/src/nodes/initialize-project/phase5/helpers/skill-assigner.ts` — skill → agent binding
- `orchestration/src/services/framework/language-config/languages/<key>.ts` — per-language registry entries
- `docs/architecture/initialize-project.md#phase-5--implementer-agent-generation` — phase-level architecture
- `docs/guides/ADDING_LANGUAGES.md` — adding a new language to the registry
