# initialize-project Integration Fixtures

End-to-end fixtures that exercise the `initialize-project` workflow against three realistic project shapes without leaving the framework repo. Every fixture is a self-contained sample tree under `projects/<name>/` with a `qubika-agentic-framework` symlink pointing back to the framework root so the public `./qubika-agentic-framework/scripts/initialize-project.sh` entry point works exactly the way an external project would invoke it.

## Fixtures

| Fixture              | Shape                    | Stack                                         | Purpose                                                                                |
| -------------------- | ------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `mini-monorepo`      | Single-repo monorepo     | NestJS + React + Postgres + Keycloak          | Validates the canonical gira-style monorepo flow.                                      |
| `mini-microservices` | Polyglot services        | Go + .NET + Python + Node + protobuf          | Validates the structure analyzer's service-by-language discovery.                      |
| `mini-serverless`    | Cloud-functions monorepo | Firebase + GCP Cloud Functions + TS/JS/Python | Validates the serverless shape (no long-running services, runtime-specific manifests). |

Each fixture ships with:

- `.fixture-meta.json` — declarative expectations (service count, languages, required categories).
- `qubika-agentic-framework` — symlink to the framework root (`../../../../..`).
- `.gitignore` — ignores `.claude/`, `.claude-temp/`, `.code-review-graph/`, `docs/llm-wiki/` so a run never produces committed artefacts.
- `.code-review-graphignore` — keeps the code graph small and focused on the fixture's source.

## Scripts

All scripts live under `scripts/` and are stack-agnostic. They never hard-code fixture names; pass the fixture name as the first argument.

```bash
# Dry-run a fixture — prints cost projection + exits
scripts/run-fixture.sh mini-monorepo

# Execute (burns ~30 K Haiku tokens, ~5-10 min)
scripts/run-fixture.sh mini-monorepo --confirm

# Wipe a fixture's run artefacts (.claude, .claude-temp, .code-review-graph, docs/llm-wiki, .mcp.json)
scripts/clean-fixture.sh mini-monorepo

# Spawn a single Phase 1 analyzer (Claude or Codex) against pre-staged upstream outputs
scripts/run-agent.sh <agent-name> <fixture-name> [--provider claude|codex]

# Copy pre-recorded upstream outputs (Phase 0 graph + Phase 1 JSONs) into a fixture
scripts/stage-upstream.sh <fixture-name>
```

The integration runner sets `MODEL_TIER=fast` and `PROJECT_PATH=<fixture-dir>` so the framework treats the fixture directory as the target project root. Without `PROJECT_PATH`, the path-resolver in `scripts/lib/resolve-paths.sh` would walk up to the framework's parent and pick up unrelated files.

## Run a fixture end-to-end

```bash
# From the framework root
cd orchestration/test/integration/initialize-project

# 1. Dry-run for the cost projection
./scripts/run-fixture.sh mini-monorepo

# 2. Clean any prior artefacts
./scripts/clean-fixture.sh mini-monorepo

# 3. Burn tokens
./scripts/run-fixture.sh mini-monorepo --confirm
```

The runner prints a debug-bucket path at completion (e.g. `projects/mini-monorepo/.claude-temp/initialize-project/debug/runs/run-2026-05-13T...`). Open `index.html` in that bucket for the rendered HTML transcript.

## Inspect the run

```bash
cd projects/mini-monorepo

# Generated CLAUDE.md for the fixture
cat .claude/CLAUDE.md

# All generated skills + agents
ls -R .claude/skills .claude/agents

# Generated wiki
ls docs/llm-wiki/wiki
ls docs/llm-wiki/wiki/services/

# Stack profile + per-service config
cat .claude/framework-config.json | jq '.stack_profile, .services'

# Per-attempt debug artefacts
ls .claude-temp/initialize-project/debug/runs/
```

The expected file counts and required categories live in `.fixture-meta.json`. Use it as the contract when adding a new fixture or extending an existing one.

## Sanity guard against committed artefacts

A unit test (`test/unit/integration-fixtures/sanity.test.ts`) fails the suite if any fixture contains a committed `.claude/`, `.claude-temp/`, `.code-review-graph/`, or `docs/llm-wiki/` directory. Always run `clean-fixture.sh` before committing — `pnpm --filter orchestration test:unit` will surface a leaked artefact directory before it hits CI.

## Adding a new fixture

1. Create `projects/<name>/` with a realistic source tree (10-50 source files is plenty).
2. Add `.fixture-meta.json` describing the expected shape (see neighbours for the schema).
3. Add the `qubika-agentic-framework` symlink:
   ```bash
   ln -s ../../../../.. projects/<name>/qubika-agentic-framework
   ```
4. Add `.gitignore` excluding `.claude*`, `.code-review-graph`, `docs/llm-wiki`, `.mcp.json`.
5. Add `.code-review-graphignore` excluding the framework symlink and any test artefacts.
6. Dry-run: `scripts/run-fixture.sh <name>` should print the cost projection without errors.

The fixture must not contain plan/history references in its source files (READMEs, scripts, manifests). Treat each fixture as a real-looking project an external developer would clone — leaking framework history into the simulated project skews analyzer behaviour. The `test/unit/integration-fixtures/sanity.test.ts` guard checks for several of these markers.

## What the fixtures exercise

Each end-to-end run touches:

- **Phase 0** — code-graph build (via `code-review-graph`), project-inspection, MCP server bootstrap.
- **Phase 1** — four parallel Phase 1 analyzers (structure / tech-stack / code-patterns / data-flows) against a real graph + manifest tree.
- **Phase 2** — consolidation + composer-view derivation, including the deterministic fallback for missing per-service rollups.
- **Phase 3** — Opus-tier synthesis (driven by Haiku in fast tier, but the synthesis output schema is validated identically).
- **Phase 4** — context generation, framework-config emission, getting-started rendering, per-service wiki pages.
- **Phase 5** — skill copying, implementer-agent generation (one `implementer-<lang>` per detected first-class language), command-extractor output.
- **Phase 6** — portability + agent-coverage validation across the generated `.claude/` tree.

A green run means every stage of the workflow produced schema-valid output on a realistic-but-small project. Use the fixtures as the smoke test before any non-trivial framework change.
