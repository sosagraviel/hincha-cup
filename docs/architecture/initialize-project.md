# `/initialize-project` — Phase-by-Phase Architecture

`/initialize-project` is a six-phase pipeline that turns an unknown target project into a fully-configured QAF installation (`CLAUDE.md`, three skill bodies, an architectural narrative, an LLM wiki, agent prompts, validators). It is engineered so the LLM is a *composer*, not an investigator: every fact downstream phases ship is grounded in deterministic project signals — manifests, lock files, source files — with citation provenance.

```text
Phase 0          Phase 1                  Phase 2                       Phase 3       Phase 4       Phase 4b       Phase 5    Phase 6
inspection  →  4 parallel analyzers  →  consolidation + 4 views  →  synthesizer  →  context  →  wiki generator  →  agents  →  validators
                                              ▲                          ▲             ▲                                          │
                                              │ slice > analyzer >        │ closed-book │ deterministic                            │
                                              │ deterministic > absent    │ readers     │ post-fills                               │
                                              ▼                          ▼             ▼                                          ▼
                                              composer views               CLAUDE.md / skills / arch narrative                  Stop hooks
```

## Where the LLM lives — and does not

The LLM runs in exactly three places:

1. **Phase 1 analyzers (four in parallel)** — structure, tech-stack, code-patterns, data-flows. Each emits a Zod-validated JSON. Per-service judgment fields (`code_patterns[]`, `representative_examples[]`, `request_lifecycle[]`) carry mandatory `source_file` + `source_line` citations; Stop hooks reject un-cited entries and missing services.
2. **Phase 3 synthesizer (closed-book)** — reads the four pre-flattened composer views, never grep / glob / MCP. Composes `CLAUDE.md` + three skill bodies + an architectural narrative.
3. **Phase 4b wiki generator** — turns the architectural narrative into `docs/llm-wiki/` pages.

Phase 0, Phase 2, the Phase 4 section extractor, Phase 5 agent-template instantiation, and Phase 6 validators are 100% deterministic.

## Composer views and the fallback chain

Phase 2 builds four views — one per output section the synthesizer renders:

- `code-conventions.input.json` — feeds `code-conventions/SKILL.md`
- `multi-file-workflows.input.json` — feeds `multi-file-workflows/SKILL.md`
- `testing-conventions.input.json` — feeds `testing-conventions/SKILL.md`
- `architecture-narrative.input.json` — feeds the wiki-generator architectural narrative

Each view's `present.<sub>_source` tag records where each sub-section came from, following this fallback chain (highest priority first):

1. **slice** — per-service detail emitted by an analyzer
2. **analyzer** — project-level direct rollup from a Phase 1 analyzer
3. **deterministic** — registry × project-inspection (no LLM involved)
4. **absent** — the project genuinely lacks the evidence

Empty sections only appear when `_source = absent`. The synthesizer is instructed to treat deterministic baselines as ground truth and elaborate on them rather than ignore or contradict them.

## The language-config registry

Stack agnosticism is enforced by `orchestration/src/services/framework/language-config/`. One file per language declares:

- **manifests** — exact filenames or wildcard kinds. Drives both Phase 0 inspection AND the Phase 6 service-completeness validator.
- **lockFiles** — basename → package manager mapping.
- **runtimeVersionFiles** — extractors for `.nvmrc` / `.python-version` / `go.work`-style pins.
- **toolTokens** — linters, formatters, type-checkers, test runners, common frameworks, databases.
- **externalServiceSdks** — Stripe, Sentry, SendGrid, Twilio, Auth0, Datadog, AWS SDK, Anthropic, …
- **authLibraries** — Passport, NextAuth, Spring Security, Devise, IdentityServer, …
- **eventQueueLibraries** — BullMQ, KafkaJS, Asynq, Sidekiq, Spring Kafka, Hangfire, …

Adding a new vendor / library / manifest kind is one line in one file. Every downstream phase picks it up at the next run — composer views populate, the synthesizer composes, the wiki generator references, the service-completeness validator widens its discovery surface.

## Phase 5 — implementer-agent generation

Phase 5 is deterministic. It walks the stack profile and, for every distinct service language, decides whether to emit a dedicated `implementer-<lang>.md` agent or to let the work fall through to `implementer-generic.md`.

### Decision rule

A language gets its own implementer agent if and only if its registry entry sets `hasImplementerAgent: true`. Today that flag is set on **7 languages** — the ones with a corresponding mastering skill under `skills/050-language-frameworks/`:

| Language | Mastering skill |
|---|---|
| `typescript` | `mastering-typescript/SKILL.md` |
| `python` | `mastering-python-skill/SKILL.md` |
| `go` | `mastering-go-skill/SKILL.md` |
| `rust` | `mastering-rust-skill/SKILL.md` |
| `java` | `mastering-java-skill/SKILL.md` |
| `scala` | `mastering-scala-skill/SKILL.md` |
| `ruby` | `mastering-ruby-skill/SKILL.md` |

Every other language (JavaScript, C#, PHP, Kotlin, Swift, Dart, Elixir, Haskell, Shell, SQL, HTML, CSS, …) falls through to `implementer-generic.md`. A unit test (`language-config.test.ts`) refuses to merge any new `hasImplementerAgent: true` entry that doesn't have a matching mastering skill on disk — the flag and the skill must move together.

### Generation flow

```text
phase5/agent-generator.ts
        │
        ├─ getLanguagesFromStackProfile(stackProfile)        → ['typescript', 'shell']
        │
        ├─ for each language:
        │     ├─ isLanguageSupported(lang)?                  → consults languagesWithImplementerAgent()
        │     │     ├─ true  → generateImplementerAgent()    → implementer-<lang>.md
        │     │     └─ false → skip (work routes to implementer-generic)
        │
        ├─ generateGenericImplementerAgent()                 → implementer-generic.md  (always)
        ├─ generatePlannerAgent()                            → planner.md              (always)
        └─ generateVisualVerifierAgent()                     → visual-verifier.md      (only if a frontend service exists)
```

### Template lookup

`generateImplementerAgent()` looks for `agents/templates/implementer-<lang>.template.md` first and falls back to `agents/templates/implementer.template.md` when no per-language template exists. The fallback is the current state for every supported language — the framework reuses one body for all dedicated implementers; only the rendered commands and assigned skills differ. The per-language hook stays open: dropping `implementer-typescript.template.md` into `agents/templates/` would make Phase 5 pick it up automatically.

### What actually differs across implementers

The shared body is rendered with these per-language inputs:

1. **Commands** — `{{lint_command}}`, `{{format_command}}`, `{{type_check_command}}`, `{{unit_test_command}}`, `{{build_command}}` come from the project's manifest scripts when present, otherwise from the registry's `commandDefaults` for that language.
2. **Skills** — `skill-assigner.ts` decides which skill bodies bind to each implementer (e.g. `implementer-typescript` gets `mastering-typescript`, `react-frontend`, `mastering-vitest`; `implementer-generic` gets cross-stack skills like `mastering-git-cli`, `developing-with-docker`).
3. **Frontmatter description** — `"Implement <language> code following team conventions"` for dedicated implementers vs `"Expert full-stack and DevOps specialist implementing any file type"` for the generic one. This is what the planner and Claude Code's sub-agent dispatcher match on.

### Phase 6 cross-check

`agent-coverage-validator.ts` walks the generated agents and the stack profile. For every service whose language has `hasImplementerAgent: true`, it asserts a matching `implementer-<lang>.md` file exists. Utility / non-eligible languages are never checked — they're expected to flow through the generic implementer, so a missing `implementer-shell.md` is not an error.

## Stop-hook validators (Phase 1)

Every Phase 1 analyzer runs through a Stop hook (`validate-analyzer-json.hook.ts`) that emits a stable `VALIDATION_E<NNN>` code on failure. The agent's retry handler dispatches on the code prefix without parsing prose.

| Code | Validator |
|---|---|
| `E007_graph_use_fabricated` | agent claimed graph use but transcript shows no `mcp__code_graph__*` calls |
| `E008_schema_validation_failed` | Zod rejection |
| `E010_automation_discovery_gap` | analyzer missed Makefile / Justfile / Taskfile / setup scripts |
| `E011_port_discovery_gap` | per-service port missing AND no opt-out |
| `E012_infrastructure_port_gap` | infra-service port missing AND no SaaS opt-out |
| `E013_unknown_service_id` | downstream analyzer used an id absent from the authoritative list |
| `E016_missing_service_paths` | structure analyzer omitted a manifest-bearing directory |
| `E06x_*` | `needs_verification` prose-quality sub-codes |
| `E068_missing_judgment_field_for_service` | backend/frontend/serverless/worker service emitted empty per-service patterns / tests / request_lifecycle |

Together these enforce a single contract: **complete output, with citations, or an explicit reason for absence**.

## Further reading

- `orchestration/src/nodes/initialize-project/phase2/composer-views/README.md` — the composer-view contract in depth
- `orchestration/src/services/framework/language-config/types.ts` — the LanguageConfig shape
- `orchestration/src/nodes/initialize-project/shared/validation-codes/codes.ts` — the full validator-code table
