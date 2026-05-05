# Verification Items Guide

<verification_guidelines>

## When to Use needs_verification

Each `needs_verification` item MUST be:

1. **Answerable** from this repo's code, configs, or manifests by a human reviewer with VS Code access. Items that are unanswerable by a human reading the same files are not verification items — they are dead-end questions.
2. **Specific** — cite the missing field, the missing config, the missing decision, NOT a broad concept. "What's the deployment strategy?" is broad. "Is the `DEPLOY_TARGET` env var set in `.env.example`?" is specific.
3. **NOT derivable** from data the analyzers already surface. If the answer can be deduced from `package.json` / `pyproject.toml` / `pom.xml` / `Cargo.toml` / `composer.json` / `Gemfile` / `*.csproj` / `mix.exs` / `go.mod` / `build.sbt` (or any other manifest format the analyzer consumes), do not surface it as needs_verification — read the manifest and answer it directly.

## What NOT to surface as needs_verification

Items in any of these categories are silently dropping framework
budget on a question the human reviewer also cannot answer from the
repo:

- **Production credentials** (DSNs, API keys, secrets, instance URLs) — always external by design; the repo intentionally does not contain them.
- **Anything outside this repository** — CI/CD pipelines managed by another team, infrastructure-as-code in a separate repo, vendor configurations in a vendor portal, deployment scripts on operator machines.
- **Anything verifiable from a manifest** — runtime versions, dependency versions, monorepo workspace layout, declared scripts, declared frameworks, declared databases. Read the manifest and answer.
- **Anything verifiable from a graph community payload** — service membership, cross-service edges, hub/bridge topology. Use `mcp__code_graph__*` tools.
- **Speculative "is X implemented?"** when the absence of the dependency in every manifest already answers "no."

## Maximum Limit

Maximum **3** verification items per agent. Prioritize the most
critical unknowns — questions whose answers a human reviewer with
VS Code access could reasonably resolve in a few minutes by reading
the repo. The framework hard-rejects outputs with more than 3 items;
this is intentional pressure to drop speculative entries before
emitting the JSON.

## Format

```typescript
{
  id: string,        // Unique identifier (e.g., "v1", "v2")
  question: string,  // Clear, specific question
  reason: string     // Why this cannot be determined from code
}
```

</verification_guidelines>

<examples>

<example type="good">
```json
{
  "id": "v1",
  "question": "Is the Redis instance shared across services or per-service?",
  "reason": "Both services connect to Redis but connection configs don't specify instance isolation"
}
```
Good: Genuinely ambiguous deployment architecture question.
</example>

<example type="good">
```json
{
  "id": "v2",
  "question": "Should the legacy /api/v1 endpoints be included in documentation?",
  "reason": "Found deprecated endpoints still in codebase but unclear if they're still supported"
}
```
Good: Business decision that cannot be inferred from code.
</example>

<example type="bad">
```json
{
  "id": "v1",
  "question": "What testing framework is used?",
  "reason": "Couldn't find test files"
}
```
Bad: Should search more thoroughly first (check manifest dependencies, look for test configs).
</example>

<example type="bad">
```json
{
  "id": "v2",
  "question": "What database is used?",
  "reason": "Not sure which database"
}
```
Bad: Can be determined from dependencies (pg = PostgreSQL, mongodb = MongoDB, etc.).
</example>

</examples>
