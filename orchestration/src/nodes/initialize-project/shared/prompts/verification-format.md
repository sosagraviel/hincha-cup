# Verification Items Guide

<verification_guidelines>

## Goal

**Aim for ZERO needs_verification items.** The framework has high
tolerance for items that genuinely cannot be resolved by reading the
repo, but emitting items that turn out to be code-derivable is a
regression that wastes the operator's time. If you have ANY
uncertainty about whether the item is code-derivable, drop it —
operator review of an empty list is cheaper than operator dismissal
of three speculative items.

The hard cap is 3 items per agent. Three is the absolute ceiling,
not a target.

## When to Use needs_verification

Each `needs_verification` item MUST be:

1. **Real (not inferable from code).** Run AT LEAST 2 concrete tool
   calls (`Read` / `Grep` / `Glob` / `Bash` / `mcp__code_graph__*`)
   trying to answer the question yourself BEFORE surfacing it. Items
   without ≥2 search attempts are blocked at the validator.

2. **Specific.** Cite the missing field, the missing config, the
   missing decision — NOT a broad concept. "What's the deployment
   strategy?" is broad. "Is the `DEPLOY_TARGET` env var set in
   `.env.example`?" is specific.

3. **NOT derivable** from data the analyzers already surface. If the
   answer can be deduced from `package.json` / `pyproject.toml` /
   `pom.xml` / `Cargo.toml` / `composer.json` / `Gemfile` /
   `*.csproj` / `mix.exs` / `go.mod` / `build.sbt` (or any other
   manifest the analyzer consumes), do not surface it as
   needs_verification — read the manifest and answer it directly.

4. **Really relevant to get conclusions.** The answer must change a
   CONCRETE downstream artefact — a wiki page body, a skill body,
   an architectural finding, a config-default decision. Items that
   are "nice to know" but don't change any output are noise. Drop
   them.

## What NOT to surface as needs_verification

Items in any of these categories are silently dropping framework
budget on a question the human reviewer also cannot answer from the
repo:

- **Production credentials** (DSNs, API keys, secrets, instance URLs) — always external by design; the repo intentionally does not contain them.
- **Anything outside this repository** — CI/CD pipelines managed by another team, infrastructure-as-code in a separate repo, vendor configurations in a vendor portal, deployment scripts on operator machines, "infrastructure repository" / "separate repository" / "external system" all evade the rule by phrasing but are the same shape.
- **Anything verifiable from a manifest** — runtime versions, dependency versions, monorepo workspace layout, declared scripts, declared frameworks, declared databases. Read the manifest and answer.
- **Anything verifiable by `Read` / `Grep` / `Glob`** — if the question is "does file X exist?" or "is package Y imported anywhere?" or "does class Z use pattern W?", run the tool. Don't ask.
- **Speculative "is X implemented?"** when a `grep` for the dependency's import sites would answer it. The presence/absence of import statements IS the answer.
- **Build-environment reachability questions** — "Is host X reachable from production CI?" is a network-state question, not a repo question.

## Banned in question / reason text

These leak framework internals. The user does NOT know what the
graph is — the graph is internal tooling, like a database query
plan. Express questions in terms of project state, never in terms
of how the framework looked.

- "graph traversal", "graph parsing", "graph data", "graph
  community", "graph nodes", "graph search", "graph index", "graph
  result", "graph returned", "graph data alone", "during graph
  traversal", "may have been missed during graph parsing"
- "Class search returned", "Function search returned", "File search
  returned" — these are MCP tool internals leaking out
- "semantic search returned", `mcp__code_graph__*` substrings
- "community size", "community member analysis", "community
  payload"

## Banned: fabricated numbers

Do NOT ask the human to confirm a number you guessed. Either
compute the number deterministically or omit it.

- `~123` (tilde-prefix), `≈123`, `approximately 123 files`
- `roughly 123 functions`, `around 123 modules`, `about 123 classes`
- Multi-number guess blocks (`backend ~180, web-frontend ~120,
shared ~25`) — almost always invented. The human has no way to
  confirm them.

## Maximum Limit

Maximum **3** verification items per agent. **Target 0.** The
framework hard-rejects outputs with more than 3 items.

## Format

```typescript
{
  id: string,
  question: string,        // What you couldn't resolve from code
  reason: string,          // Why search didn't answer it
  attempted_resolution: string[],  // REQUIRED, MIN 2 entries
  impact: string,          // REQUIRED, ≥40 chars, names a concrete artefact
}
```

Each `attempted_resolution` entry MUST be either:

- A concrete tool invocation (preferred). Examples across stacks:
  - `Read services/backend/package.json`
  - `Glob "**/passport-google*.ts"`
  - `Grep "@aws-sdk" services/`
  - `mcp__code_graph__semantic_search_nodes_tool({ query: "Sentry", limit: 20 })`
  - `Bash: find services -name "*Controller*"`
- A `human:`-prefixed entry (allowed only WHEN paired with at least one
  tool entry). Format: `human: <≥20-char explanation of why no tool
path resolves this>`. Example:
  `human: requires operator knowledge of Sentry instance accessibility from CI runners`.

Reject prose entries like "I tried to find it" or "couldn't locate
the file" — they don't say WHAT was tried. Use the tool name.

The `impact` field must NAME the concrete downstream artefact the
answer changes:

- ✅ `"Determines whether the testing-conventions skill body lists
'enforced 80% line coverage' or 'no enforced threshold'."`
- ✅ `"Decides whether ARCHITECTURE.md describes the queue topology
as fan-out or single-consumer."`
- ❌ `"Important for documentation."`
- ❌ `"Useful to know for context."`
- ❌ `"Helpful for the analysis."`
- ❌ `"Nice to have."`

</verification_guidelines>

<self_validation>

## Pre-emit self-check (run BEFORE writing the final JSON)

For every item you intend to put in `needs_verification`, walk
through this checklist. Drop any item that fails ANY check:

1. **Tried to resolve it?** I ran AT LEAST 2 concrete tool calls
   (`Read` / `Grep` / `Glob` / `Bash` / `mcp__code_graph__*`)
   against this exact question. If not, drop the item.
2. **No graph internals?** Question and reason mention only project
   state ("Does X integrate with Y?" / "What is the auth strategy?"),
   never tool internals ("graph traversal", "Class search returned 0",
   `mcp__code_graph__*`). If they leak, drop.
3. **No fabricated numbers?** I am NOT asking the human to confirm
   a count I guessed (`~180 files`, `roughly 12 classes`). If yes,
   either compute the number or omit it.
4. **Concrete impact?** The `impact` field names a SPECIFIC
   artefact (wiki page / skill / finding) the answer changes. If
   the answer doesn't change any concrete output, the item is
   noise — drop it.
5. **Manifest-declared with no import search?** I searched
   `package.json` / `pyproject.toml` / `Cargo.toml` / etc., but did
   I also `Grep` for `import` / `require` / `use` statements
   referencing the package? If not, do that search now and either
   resolve the item or surface "declared but not imported" as a
   finding instead.

This self-check is psychological priming, not enforcement. The Stop
hook applies the same rules deterministically and rejects items
that fail any of them with retry feedback. Catching the item HERE,
before emit, is cheaper than the retry round-trip.

</self_validation>

<examples>

<example type="good">
```json
{
  "id": "v1",
  "question": "Is the Redis instance shared across services or per-service?",
  "reason": "Both services connect to Redis but connection configs don't specify instance isolation",
  "attempted_resolution": [
    "Read services/backend/src/redis/redis.module.ts",
    "Grep \"createClient\" services/",
    "Read services/web-frontend/src/lib/redis.ts"
  ],
  "impact": "Determines whether the architectural narrative describes Redis topology as 'shared instance' or 'per-service instance', and changes the deployment-target section of ARCHITECTURE.md."
}
```
Good: Genuinely ambiguous; agent searched relevant files; impact names two specific artefacts.
</example>

<example type="good">
```json
{
  "id": "v2",
  "question": "Should the legacy /api/v1 endpoints be included in documentation?",
  "reason": "Found deprecated endpoints still in codebase but unclear if they're still supported in production",
  "attempted_resolution": [
    "Grep \"v1\" services/backend/src/routes/",
    "Read services/backend/src/routes/v1/index.ts",
    "human: requires product-owner decision on v1 deprecation timeline"
  ],
  "impact": "Decides whether the SERVICES.md catalog mentions v1 endpoints as supported or deprecated, and whether ARCHITECTURE.md keeps the v1 routing section."
}
```
Good: Business decision; agent searched the routes directory; human-prefixed entry explains why no tool path resolves the support question.
</example>

<example type="bad">
```json
{
  "id": "v1",
  "question": "What testing framework is used?",
  "reason": "Couldn't find test files",
  "attempted_resolution": []
}
```
Bad: Empty attempted_resolution — the agent never searched. `Grep` for jest/vitest/pytest in `package.json` answers this in one tool call.
</example>

<example type="bad">
```json
{
  "id": "v2",
  "question": "Are the per-service file counts approximately backend ~180, web-frontend ~120, shared ~25?",
  "reason": "Graph community sizes represent node counts, not file counts.",
  "attempted_resolution": ["mcp__code_graph__list_communities_tool({ ... })"],
  "impact": "Useful for documentation."
}
```
Bad: Three failures: fabricated numbers, graph-internals leakage in the reason, generic impact. All hard-rejected.
</example>

<example type="bad">
```json
{
  "id": "v3",
  "question": "Do NestJS REST controllers exist beyond what the graph indexed?",
  "reason": "Class search returned 0 Controller nodes; may have been missed during graph parsing.",
  "attempted_resolution": ["mcp__code_graph__semantic_search_nodes_tool({ query: \"Controller\" })"],
  "impact": "Important for the architecture page."
}
```
Bad: Graph internals leak into question + reason; agent never tried `Grep "@Controller"` or `Glob "**/*.controller.ts"`; impact is generic.
</example>

</examples>

## Final self-check before emitting (Plan 17 §C — load-bearing)

Two anti-patterns the Stop hook will reject. Walk every
`needs_verification` item through this checklist:

### 1. Self-contradicting question (`found_no_evidence_yesno`)

If your `attempted_resolution` already proves the answer is "no"
(tokens like `zero matches`, `no X found`, `not installed`, `not
declared`, `does not exist`), and the question is a yes/no
presence question (`Is X installed?`, `Are there Y?`, `Does the
project have Z?`, `Is there a W?`), the answer is already
established. **Do NOT ask the operator** — record the absence as
a finding instead.

<example type="bad">
```json
{
  "question": "Is an AWS SDK installed?",
  "attempted_resolution": [
    "Grep \"aws-sdk\" services/backend/package.json — zero matches; no AWS SDK declared",
    "Grep \"aws-sdk\" services/web-frontend/package.json — zero matches"
  ]
}
```
Bad: the evidence proves no AWS SDK is installed. Report this as a finding (e.g. `findings.dependencies.aws_sdk: not_installed`, or simply omit AWS-related dependencies from the list). Do not ask the operator to confirm.
</example>

### 2. Confessed incomplete search (`confessed_incomplete_search`)

If your `attempted_resolution` admits the search was skipped
(`file contents were not read`, `did not inspect`, `was not
searched`, `unknown because we did not …`), **finish the search
first.** Read / Grep / Glob the file you skipped. The framework
cannot ask the operator to substitute for work the agent could
have done in one more tool call.

<example type="bad">
```json
{
  "question": "What commands do the husky git hooks execute?",
  "attempted_resolution": [
    "Glob .husky/* — found commit-msg, pre-push, pre-commit but file contents were not read",
    "Read services/backend/package.json — scripts define lint:check, type:check, test:unit"
  ]
}
```
Bad: the agent admits the .husky files were not read. Run `Read .husky/pre-commit` (then `pre-push`, `commit-msg`). After reading, the answer is usually direct (e.g. "pre-commit runs `pnpm lint && pnpm test:unit`") and no question is needed.
</example>
