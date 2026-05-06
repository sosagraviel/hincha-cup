# Plan 15 — Stack-agnostic command discovery for `Essential Commands`, wiki, and skills

**Status:** awaiting confirmation. Do not implement until approved.
**Author:** assistant, 2026-05-05
**Triggered by:** gira re-run produced a `.claude/CLAUDE.md` "Essential
Commands" table that lists ONLY `pnpm --filter ...` invocations and
ignores `make setup` / `make launch` / `make tests` — even though
gira's `Makefile` is the canonical entry point that boots the
Postgres + Redis + Keycloak + seed pipeline that the raw pnpm
commands silently depend on.

---

## 0. Architectural diagnosis (one paragraph, load-bearing)

The regression is **structural data loss between Phase 1 and Phase 3**,
not a missing-prompt bug. Phase 1's `structure-architecture-analyzer`
already discovers automation files into `findings.automation`
(Makefiles, justfiles, shell scripts) and `tech-stack-dependencies-analyzer`
captures `findings.build_tools.<service>` (package.json scripts,
pyproject `[tool.poetry.scripts]`, Maven/Gradle goals). Phase 2's
consolidator emits **gap questions only** — `findings.automation`
never enters the consolidation output. Phase 3's synthesizer
(`tools: none`, closed-book) receives a `trimSynthesisInput` payload
that includes `build_tools` but **not `automation` and not the
README "Getting Started" extract**. Result: the synthesizer renders
`Essential Commands` from raw package-manager scripts and is
structurally incapable of preferring a higher-level wrapper, no
matter how the prompt is worded.

Two parallel artefacts exist but are unwired:

- `orchestration/src/utils/command-extractor.ts` — comprehensive
  build-tool detection across 11 languages. Wired only into the
  Phase 5 implementer-agent renderer, not into Phase 3 synthesis.
- `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/agent.md`
  step 5 — instructs the analyzer to populate `findings.automation`,
  but no downstream consumer reads it.

The fix is to (a) lift the discovered automation surface into a
typed, deterministic "command catalog" persisted on the stack
profile, (b) feed it through the closed-book synthesizer and the
wiki generator, and (c) lock the preference order with a hard
validator so a future prompt rewrite cannot re-introduce the
regression.

---

## A. Failure analysis (gira run, 2026-05-05)

| # | Generated CLAUDE.md says | Reality |
|---|--------------------------|---------|
| 1 | `pnpm --filter backend start:dev` | Standalone NestJS process — no Postgres, no Redis, no Keycloak, no seed. Crashes at boot. |
| 2 | `pnpm install` (only) | Misses `make setup`: env file, docker-compose up, wait-for-Keycloak, realm init, wait-for-API, seed demo data. |
| 3 | `pnpm --filter backend test:e2e` | Skips bringing up the e2e Postgres + Keycloak stack. |
| 4 | No mention of `make logs`, `make sh`, `make recreate`, `make down-volumes` | The only viable way to introspect / reset the running stack. |
| 5 | No mention of `make launch` | The "destroy + reseed + restart" command an operator runs daily. |

The `Makefile` documents every target with `## @docker | @setup | @test`
comments — i.e. self-describing entry points. The structure-analyzer
is already supposed to read those (per its prompt step 5). Whether
or not it did, the data was discarded by Phase 2. Either way the
fix is the same: pipe the data through.

---

## B. Stack-agnosticism contract (load-bearing)

This plan must NOT hard-code:

- `docker-compose` as a concept (gira uses it; many targets don't).
- `make` as the preferred wrapper (just/task/mage/invoke/scripts/
  bin/setup are all equally valid).
- Any specific language, framework, or build tool.
- Any directory layout (monorepo, multi-repo with sibling clones,
  per-service repos, serverless function repos, mixed-modern-and-
  legacy trees).

The detection surface is the **union** of common automation
primitives (§D.1). The preference order is a **policy** (§D.2)
applied uniformly: high-level wrapper first, package-manager
fallback second, README "Getting Started" verbatim if present.

For multi-repo (sibling-clone) targets the policy applies
**per repository** with no implicit cross-repo wrapper. For
single-service single-repo targets the wrapper layer may be empty;
the package-manager commands stand alone (no regression).

---

## C. The desired contract

Every artefact that documents "how to run X" — `CLAUDE.md`,
`docs/llm-wiki/wiki/getting-started.md`, per-service wiki pages'
"Local development" subsection, and any `skills/**/SKILL.md` that
spawns build/test/dev commands — must follow this preference
order:

### C.1. The four-tier command preference

1. **Tier 1 — Wrapper entry points** (if discovered):
   - Make targets (`make <target>`) with the comment annotation
     extracted from the Makefile (`## description` / `## @group`).
   - Just recipes (`just <recipe>`) with their leading comment.
   - Task targets (`task <target>`) from `Taskfile.yml` `desc`.
   - Mage targets (`mage <target>`).
   - Setup / bootstrap shell scripts at conventional paths
     (`scripts/setup`, `scripts/bootstrap`, `bin/setup`,
     `bin/dev`, `setup.sh`, `bootstrap.sh`, `dev.sh`).
   - Devcontainer `postCreateCommand` / `postStartCommand`.

2. **Tier 2 — README-prescribed commands**:
   Verbatim code blocks from the README sections matching the
   regex `^##\s*(Getting Started|Setup|Installation|Quickstart|
   Quick Start|Running Locally|Local Development|Development|
   How to Run)` (case-insensitive). Quoted as-is, attributed to
   `README.md#getting-started`. README often documents the
   author's intended ordering, including non-obvious env-var
   prep and `.env` copying.

3. **Tier 3 — Per-stack package-manager commands** (per service):
   The list `command-extractor.ts` already produces. These appear
   under a "Per-service commands (low-level)" subsection with a
   one-line warning: *"Prefer the wrapper above when present;
   these run a single service in isolation and may not start
   dependent services."*

4. **Tier 4 — CI-derived hints**:
   Commands extracted from `.github/workflows/*.yml`,
   `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`,
   etc. — last-resort discovery for projects with neither a
   wrapper nor a README setup section, used to seed Tier 1 if
   nothing else exists. Never overrides Tiers 1–3.

### C.2. What every generated artefact must show

- `Essential Commands` table (CLAUDE.md): wrapper entry points
  first, with descriptions; package-manager commands collapsed
  into a "Per-service commands" sub-table OR a footnote pointer
  to `wiki/getting-started.md` if there are >10 of them.
- `wiki/getting-started.md`: full four-tier rendering with
  attribution, the README extract reproduced verbatim under a
  blockquote, and a "Why this ordering" sentence linking to
  the wrapper's descriptions.
- Per-service wiki pages: `## Local development` subsection that
  defers to the project-level wrapper if it covers the service,
  else lists the service's own package-manager commands.
- `skills/**/SKILL.md` that runs commands during phases (test,
  lint, dev-server, e2e): consult `framework-config.json`
  `command_catalog` for the preferred command for the operation
  (`run_tests`, `start_dev`, `run_e2e`, `run_lint`,
  `run_migrations`, `run_setup`) instead of hard-coding
  `npm test`-style guesses.

### C.3. Stack-agnostic copy

The phrasing in synthesised artefacts must NOT say
"docker-compose", "Keycloak", "Postgres", "the auth service",
or any other stack-specific term unless the wrapper's own
comment said so. The framework only knows: *"`make setup`
described as 'Full dev environment setup (install, docker,
keycloak, seed)'"* — it surfaces the description verbatim
without paraphrasing.

---

## D. Concrete fixes (commit-by-commit)

### D.1. Schema: stack profile gains `automation` + `command_catalog`

`orchestration/src/schemas/stack-profile.schema.ts` — add two
top-level fields:

```ts
automation: z.object({
  makefiles: z.array(z.object({
    path: z.string(),
    targets: z.array(z.object({
      name: z.string(),
      group: z.string().optional(), // from `## @group` comments
      description: z.string().optional(),
    })),
  })),
  justfiles: z.array(/* analogous */),
  taskfiles: z.array(/* analogous */),
  shell_scripts: z.array(z.object({
    path: z.string(),
    purpose: z.enum(['setup', 'bootstrap', 'dev', 'test', 'unknown']),
    shebang: z.string().optional(),
  })),
  devcontainer: z.object({
    postCreateCommand: z.string().optional(),
    postStartCommand: z.string().optional(),
  }).optional(),
  ci_hints: z.array(z.object({
    file: z.string(),
    commands: z.array(z.string()),
  })).optional(),
}),

readme_run_section: z.object({
  path: z.string(),                 // e.g. "README.md"
  heading: z.string(),              // verbatim heading matched
  body: z.string(),                 // raw markdown of the section
  fenced_blocks: z.array(z.string()),
}).optional(),

command_catalog: z.record(           // keyed by operation name
  z.enum([
    'setup', 'start_dev', 'run_tests', 'run_unit_tests',
    'run_integration_tests', 'run_e2e', 'run_lint', 'run_format',
    'run_typecheck', 'run_build', 'run_migrations',
    'generate_migration', 'revert_migration', 'seed', 'reset',
  ]),
  z.object({
    tier: z.enum(['wrapper', 'readme', 'package_manager', 'ci']),
    command: z.string(),
    description: z.string().optional(),
    source: z.string(),              // file path the command came from
    per_service: z.string().optional(), // service id when tier=package_manager
  }),
),
```

The `command_catalog` is **deterministic**: assembled by a new
TypeScript function from the raw `automation` + `build_tools` +
`readme_run_section` data. The closed-book synthesizer never has
to choose tiers — the catalog already encodes the preference.

### D.2. New service: `command-catalog-builder.ts`

Location: `orchestration/src/services/framework/command-catalog/`.

- Input: `automation`, `readme_run_section`, `build_tools`,
  `services` (from stack profile).
- Output: the `command_catalog` map.
- Logic: for each operation in the enum, walk Tiers 1→4 and emit
  the FIRST tier that has a candidate command, falling back if
  none.
- Per-service operations (build/test/lint/dev-server) emit one
  entry per service when the wrapper does NOT cover them.
- Pure function, fully unit-testable, no LLM, no I/O.
- Idempotent and stable: a stable sort on service id + tier ensures
  byte-identical output across runs given identical input.

### D.3. Phase 1 prompt hardening (analyzer side)

`structure-architecture-analyzer/prompts/agent.md` step 5 expands
to discover the full Tier 1 surface (§C.1.1) plus the README run
section. Add explicit examples per language/family for clarity:

- Make-family: `Makefile`, `GNUmakefile`, `makefile`.
- Just: `Justfile`, `justfile`, `.justfile`.
- Task: `Taskfile.yml`, `Taskfile.yaml`, `Taskfile.dist.yml`.
- Mage: `magefile.go`.
- Setup convention: `scripts/setup`, `scripts/bootstrap`,
  `bin/setup`, `bin/dev`, `setup.sh`, `bootstrap.sh`, `dev.sh`.
- Rails: `bin/setup`, `bin/dev`, `bin/rails`.
- Django: `manage.py` (runserver, migrate, test).
- Maven: `mvnw`, `pom.xml`.
- Gradle: `gradlew`, `build.gradle(.kts)`.
- Cargo: `Cargo.toml` (`cargo run`, `cargo test`).
- Go: `go.mod`, `magefile.go`.
- Mix: `mix.exs`.
- Composer: `composer.json` `scripts`.
- Pipenv / Poetry / Hatch / PDM / UV: `Pipfile` `[scripts]`,
  `pyproject.toml` task tools.
- Devcontainer: `.devcontainer/devcontainer.json`.
- VS Code tasks: `.vscode/tasks.json`.

For each found Makefile/Justfile/Taskfile, **read the file** and
extract targets + their `## @group description` comments. For
README, run a regex match on headings AND capture the section
body (verbatim) until the next `^## ` heading. Output to
`findings.automation` and `findings.readme_run_section`.

`tech-stack-dependencies-analyzer` step 11 is left intact (it
already populates `findings.build_tools`); the catalog builder
consumes it as Tier 3.

### D.4. Phase 2 → Phase 3 plumbing

Two pieces:

1. **Pass the data through.** The consolidator already emits
   `consolidated_findings`; we extend `trimSynthesisInput` to
   also include `automation`, `readme_run_section`, and the
   already-built `command_catalog`. Closed-book synthesizer rule
   intact (no new tools).

2. **Catalog is built BEFORE Phase 3.** The catalog builder runs
   at the Phase 2 → Phase 3 boundary as a deterministic step. The
   synthesizer receives a pre-built catalog and is instructed to
   render it verbatim into the `Essential Commands` table — no
   tier-choosing logic in the LLM.

### D.5. Phase 3 synthesis prompt rewrite

`phase3/prompts/synthesis-instructions.md` — the `Essential
Commands` rendering rule becomes:

> Render the `command_catalog` as an ordered table. Group rows
> by `tier`: all `wrapper` rows first, then `readme`, then
> `package_manager`, then `ci`. Preserve the catalog's `source`
> attribution as a footnote per row when `tier !== package_manager`.
> Quote the `description` field verbatim — do not paraphrase or
> translate stack-specific terms (the catalog quoted them from
> the source file's own comment).

Banned phrases (added to the existing closed-book hygiene test):

- A `package_manager`-tier command listed before any
  `wrapper`-tier command for the same operation when both exist
  in the catalog. (Hard error.)
- Mention of `docker-compose`, `Keycloak`, or any service name
  that doesn't appear verbatim in the catalog. (Soft warning;
  catches paraphrase-and-leak.)

### D.6. Wiki: new `getting-started.md` page spec

`orchestration/src/services/graph-wiki/document-specs.ts` gains
a `getting-started` core spec. Same source-of-truth as Essential
Commands (the catalog), but the wiki page renders the README
section verbatim under a blockquote, lists wrapper targets as a
table with descriptions, and ends with a per-service "low-level
fallback" subtable. Wired into the wiki router so it's
discoverable from `docs/llm-wiki/CLAUDE.md`.

Per-service wiki pages gain a `## Local development` subsection
that consults the catalog: if a wrapper target's description
mentions the service id, link there; else list the service's
own package-manager commands.

### D.7. Skills + agent templates: catalog-aware

The `implement-ticket` skill already runs tests/lint at multiple
phases. Today it improvises commands. Update both `SKILL.claude.md`
and `SKILL.codex.md` so that whenever the skill needs to run
setup / tests / dev-server / e2e / migrations, it:

1. Reads `framework-config.json` `command_catalog`.
2. Uses the catalog's command for the operation.
3. Falls back to a sane default ONLY when the catalog has no
   entry for the operation — and emits a visible warning when
   it does.

Same treatment for any other skill that runs project commands
(`pr-reviewer`, `playwright-e2e-automation`, etc.). The skill
text itself stays generic — the project-specific commands live
in `framework-config.json`.

### D.8. Hard validators

Two new validators, both deterministic and run in CI:

1. **`validateCommandCatalogConsistency`** (Phase 1 Stop hook,
   soft): if `findings.automation.makefiles[]` is non-empty AND
   the catalog ends up with no `wrapper`-tier entries, emit a
   warning. Catches "you saw the Makefile but didn't extract
   any targets."

2. **`validateEssentialCommandsOrdering`** (Phase 3 Stop hook,
   hard): parse the synthesised CLAUDE.md `Essential Commands`
   table. For every operation that has both a `wrapper` and a
   `package_manager` catalog entry, the wrapper row MUST appear
   before the package-manager row. Reject otherwise.

3. **Anti-regression test (always-on):** the closed-book prompt
   hygiene test gains an assertion that the synthesis-instructions
   prompt mentions `command_catalog` and forbids tier-reordering.

---

## E. Tests

### E.1. Unit tests

- `command-catalog-builder.test.ts`:
  - Makefile + package.json scripts → wrapper entries first,
    package-manager fallbacks scoped per service.
  - Bare repo (just package.json) → only package-manager tier;
    no wrapper rows; no regression on simple stacks.
  - Multi-language polyglot (Makefile + Python service with
    poetry + Go service with go.mod) → wrapper first, then
    per-service fallbacks under operation buckets.
  - Multi-repo (sibling-clone fixture) → catalog built per repo
    independently; no cross-repo wrapper assumed.
  - Serverless (functions in Node + Python, no shared wrapper) →
    per-function-runtime fallbacks; no false wrapper.
  - README-only project (no Makefile, no package.json scripts) →
    Tier 2 entries assembled from README fenced blocks with
    attribution to README headings.

- `automation-extractor.test.ts`: parses Makefile / Justfile /
  Taskfile / shell-script families correctly; extracts
  `## @group description` comments verbatim.

### E.2. Schema tests

- New `automation`, `readme_run_section`, `command_catalog`
  fields validated.

### E.3. Integration tests

- `gira-fixture.integration.test.ts`: a sanitised gira-shape
  fixture (Makefile + pnpm workspace + README "Getting Started")
  → assert generated CLAUDE.md surfaces `make setup`,
  `make launch`, `make tests` BEFORE pnpm fallbacks; assert
  README "Getting Started" appears verbatim in
  `wiki/getting-started.md`.
- `bare-pnpm.integration.test.ts`: a workspace with no Makefile
  → assert pnpm commands appear, no regression.
- `python-poetry-no-wrapper.integration.test.ts`: a Python repo
  with `pyproject.toml` only → assert poetry commands appear.
- `multi-repo-sibling-clones.integration.test.ts`: two sibling
  repos, framework run from the parent → assert each repo's
  CLAUDE.md is independent and references its own automation.

### E.4. Stop-hook tests

- `validate-essential-commands-ordering.test.ts`: feed a
  synthesised CLAUDE.md that lists `pnpm test` before `make tests`
  → expect rejection with retry feedback.

---

## F. Rollout

| Step | Description | Layer | Risk |
|------|-------------|-------|------|
| 1 | Add schema fields (`automation`, `readme_run_section`, `command_catalog`). Forward-compatible: optional fields, no analyzer required to populate yet. | schema | low |
| 2 | Implement `command-catalog-builder.ts` + automation extractor + README run-section extractor. Pure functions, full unit coverage. | services | low |
| 3 | Update Phase 1 analyzer prompts (§D.3) to populate the new fields. Stop hook tolerates absence (soft warning). | phase1 prompts + soft hook | medium |
| 4 | Wire catalog builder at the Phase 2 → Phase 3 boundary; extend `trimSynthesisInput` to include catalog + automation + readme. | orchestration | medium |
| 5 | Rewrite Phase 3 synthesis-instructions for `Essential Commands` (§D.5). Add hard validator (§D.8.2) and anti-regression hygiene test. | phase3 prompts + hard hook | medium |
| 6 | Add `getting-started.md` wiki spec; update per-service wiki spec with `## Local development`. | phase4 wiki | low |
| 7 | Update `implement-ticket` SKILL.{claude,codex}.md and other command-running skills to consult the catalog. | skills | low |
| 8 | Add integration fixtures (gira-shape, bare, python-poetry, multi-repo). | tests | low |

Steps 1–2 ship in one commit (schema + pure builder).
Steps 3 ships in a second commit (analyzer prompts).
Steps 4–5 ship in a third commit (synthesizer wiring + hard hook).
Steps 6–7 ship in a fourth commit (wiki + skills).
Step 8 ships in a fifth commit (integration fixtures + final
acceptance run).

Each commit passes typecheck + lint + format + the relevant
test gate before landing.

---

## G. Acceptance criteria

After this lands, a fresh `/initialize-project` run on gira (or
any wrapper-driven project) must produce:

**`Essential Commands` (CLAUDE.md):**

- [ ] First rows are `make setup`, `make launch`, `make tests`,
      `make up`, `make down`, etc., each with the description
      from the Makefile's `## @group description` comment.
- [ ] Per-service pnpm commands appear in a "Per-service
      commands (low-level)" subtable WITH the warning sentence.
- [ ] No mention of `docker-compose` / `Keycloak` / other
      stack-specific service names that don't appear verbatim
      in the wrapper's own comments.

**`wiki/getting-started.md`:**

- [ ] README "Getting Started" section reproduced verbatim under
      a blockquote with attribution.
- [ ] Wrapper-target table with descriptions.
- [ ] Per-service fallback subtable.
- [ ] Linked from `docs/llm-wiki/CLAUDE.md` router.

**Per-service wiki pages:**

- [ ] `## Local development` subsection present, deferring to
      the wrapper when applicable.

**Stack-agnostic regression suite:**

- [ ] Bare-pnpm fixture still produces working CLAUDE.md (no
      wrapper rows; no false-positive warnings).
- [ ] Python-poetry fixture produces poetry-tier rows correctly.
- [ ] Multi-repo sibling-clone fixture builds independent
      catalogs per repo with no cross-repo wrapper assumed.

**Skills:**

- [ ] `implement-ticket` reads `command_catalog` for `run_tests`
      / `run_e2e` / `run_setup` / `start_dev` / `run_lint`
      operations. When the catalog has a wrapper command, the
      skill uses it; when only package-manager fallbacks exist,
      the skill uses those.

**Validators:**

- [ ] `validateEssentialCommandsOrdering` rejects a synthesised
      CLAUDE.md that lists `pnpm test` before `make tests`.
- [ ] Closed-book hygiene test asserts synthesis-instructions
      mentions `command_catalog`.

---

## H. Open questions for confirmation

1. **README extraction depth.** Should we capture *only* the
   first matched heading's body, or every match (e.g. both
   "Getting Started" and "Development")? My proposal: every
   match, deduped on heading-text-after-normalisation, ordered
   by document position. Confirm before implementation.

2. **Multi-repo "parent-folder" mode.** When the framework runs
   from a parent directory that contains N sibling-clone repos,
   should the parent folder get its own root `CLAUDE.md` that
   indexes the per-repo CLAUDE.md files? Today the framework
   doesn't recognise this layout explicitly. My proposal: out
   of scope for this plan — file as a follow-up; this plan
   guarantees per-repo correctness when the framework is run
   inside a single repo.

3. **CI-tier extraction (Tier 4).** Worth implementing now, or
   defer? My proposal: implement the extractor (cheap, pure
   function) but leave it disabled-by-default in the catalog
   builder. Turn it on once we have a project that needs it.

4. **`framework-config.json` exposure.** Should the catalog be
   the public surface, or do we keep it internal and expose
   only the rendered tables? My proposal: expose the catalog —
   it's the contract skills depend on.

---

**Awaiting your confirmation or change requests before I touch
any code.**
