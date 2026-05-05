# needs_verification quality hardening

**Status:** plan, not yet implemented.
**Audit basis:** the 7 questions surfaced by the latest gira run
(`/Users/ignaciobarreto/itIsHere/projects/gira/`), with operator
feedback on each.
**Scope:** the existing §C 4.3 quality gate (Wave 2 + Wave 3 §I.7.b)
caught some speculative items but not these. This plan goes
structural — we stop fighting prose tokens and force the agent to
PROVE it tried to resolve each item before surfacing it.

---

## 0. Architectural split — load-bearing

**Where verification happens:** the **analyzer**. The analyzer
(structure / tech-stack / code-patterns / data-flows) is the only
agent that has tools (`Read`, `Grep`, `Glob`, `Bash`,
`mcp__code_graph__*`). Every quality check below lives in the
analyzer layer:

- **Inside the analyzer prompt** — a self-check checklist the
  agent walks before emitting JSON. Cheap psychological priming;
  catches items on the first attempt instead of via retry.
- **Inside the analyzer Stop hook**
  (`validate-analyzer-json.hook.ts`) — the deterministic
  enforcement layer. Rejected items become retry feedback the
  agent sees on the next attempt.

These are the two layers the operator asked for: **internal**
(agent's own self-check in the prompt) + **external** (Stop hook
enforcement). Both layers run the SAME rule set so the prompt
warning matches the validator failure exactly.

**Where verification does NOT happen:** the **consolidator**. The
consolidator agent (`question-consolidator`) has only one job —
deduplicate near-identical questions across analyzers' outputs by
similarity. It does NOT:

- Analyse code (no `Read`/`Grep`/`Glob`/graph tools assigned).
- Re-validate items against the rules below (the analyzer Stop
  hook already rejected the bad ones).
- Drop items on quality grounds (its rejection signal is
  duplication only).
- Add or modify question text beyond canonicalising whitespace.

This is intentional. The consolidator must stay **fast and cheap**:
its input set is already clean because the analyzer-layer
enforcement upstream guaranteed every item passed the rules. The
consolidator runs in seconds because it does set-dedupe, not
analysis.

**The data-flow contract:**

```
[analyzer prompt self-check]    ← internal hook (psychological)
        │
        ▼
  analyzer emits JSON
        │
        ▼
[Stop hook validates]           ← external hook (deterministic)
        │  reject? → retry feedback to analyzer
        │  pass?   → write to phase1-outputs/
        ▼
[consolidator dedupes]          ← cheap, no analysis
        │
        ▼
   final question set
```

Every fix in §C below specifies which layer it lives in. Most
live in BOTH (the Stop hook enforces; the prompt warns).

---

## A. Why the existing gate fell short

§C 4.3 (`needs-verification-quality.ts`) detects 5 prose patterns:
credentials/DSN/secrets, outside-this-repository, production
deployment/server/endpoint, deployment-server, managed-by-another-
team. Plus the cap dropped from 5 to 3 (§I.7.b).

The 7 gira questions evade ALL of those patterns:

| # | Question (gist)                                                    | Operator verdict        | Why the gate missed it                                                                                                                                              |
| - | ------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Do `services/web-frontend/src/main.tsx` and `src/routes/__root.tsx` exist? | Code-derivable          | Question is a literal `Read` / `Glob` away. No "credentials" / "outside-repo" tokens to match. Agent never tried to verify.                                          |
| 2 | Are per-service file counts approximately backend ~180, web-frontend ~120, shared ~25? | Code-derivable + dev doesn't know either | Asks human to confirm fabricated numbers. Agent never ran a deterministic count. Dev has no way to answer.                                                          |
| 3 | Is AWS S3 / Google OAuth fully implemented or only declared?       | Code-derivable          | Agent saw the manifest deps but never searched for import sites or registration code. The answer is in `import` / `PassportModule` lines. Existing gate matched none of the prose tokens. |
| 4 | Does CI/CD exist? + Sentry URL hardcoded — is it reachable?        | Code-derivable          | Agent says "managed in a separate infrastructure repository or external system" — close to "outside this repository" but synonyms slip past the regex. Sentry URL is in `vite.config.ts` already; no need to ask. |
| 5 | What is the testing coverage policy?                               | OK (genuinely unknowable) | None — this is a legitimate item. Keep.                                                                                                                              |
| 6 | Do NestJS REST controllers and WebSocket gateways exist beyond what the **graph indexed**? | Code-derivable + leaks graph internals | Agent asks the user to compensate for a tool limitation. The user does not know what the "graph" is — graph is implementation detail, not user-facing.              |
| 7 | Is ioredis used for response caching beyond BullMQ transport?      | Code-derivable + leaks graph internals | Same shape as #6 — "additional cache.get/cache.set usage sites were not found during graph traversal." Agent could `grep` for `ioredis` imports.                       |

Five distinct failure modes:

1. **No verification attempted.** Agent didn't `Read` / `Glob` /
   `grep` before asking. (#1, #3, #6, #7)
2. **Fabricated numbers.** Agent invented a number, then asks the
   human to confirm it. The human has no way to answer. (#2)
3. **Graph internals leaking into user-facing prose.** Words like
   "graph traversal", "graph community", "Class search returned 0",
   "graph parsing", "graph data alone" expose tool implementation
   the user does not understand. (#6, #7)
4. **Synonyms that evade the regex.** "Managed in a separate
   infrastructure repository", "external system" — same idea as
   "outside this repository" but the existing gate has a narrow
   token list. (#4)
5. **Manifest-declared-but-unverified-import-site.** The agent saw
   a dependency in `package.json` but never searched for actual
   import sites. Answer: "declared only" is a finding, not a
   question. (#3)

The structural lesson: **prose-token detection is a band-aid.** No
matter how many tokens we add to the regex, the agent will phrase
its way around them. The fix is to require the agent to PROVE it
tried to resolve the item — and to fail any item the framework
itself can disprove.

---

## B. Stack-agnosticism contract — load-bearing

The framework lands on 6,000+ developer machines across 600+
projects spanning every language family. Every fix here MUST work
identically on:

- A Python monorepo with `pyproject.toml` and `pytest`.
- A Java multi-module project with `pom.xml` and `JUnit`.
- A Go workspace with `go.mod` and `go test`.
- A Rails monolith with `Gemfile` and `RSpec`.
- A .NET solution with `*.csproj` and `xUnit`.
- A Rust workspace with `Cargo.toml` and `cargo test`.
- … and so on for every supported stack.

Concretely:

- The "manifest declared but no import" rule must work on any
  manifest format (`package.json`, `pyproject.toml`, `pom.xml`,
  `Cargo.toml`, `composer.json`, `Gemfile`, `*.csproj`, `mix.exs`).
- The "fabricated number" detector must match any unit
  (`~180 files`, `≈3K functions`, `~12 classes`).
- The graph-internals ban applies to ALL agents regardless of
  language family — graph is parser-agnostic by design.
- The `attempted_resolution` field accepts ANY tool name (Read,
  Grep, Glob, Bash, mcp__code_graph__*) — no language-specific
  tools enumerated.

Where any rule cites an example (`@aws-sdk/client-s3`,
`ioredis`), that's evidence not contract — the rule itself is
expressed in language-neutral terms.

---

## C. Structural fixes

### C.1. Require `attempted_resolution` on every item

**Where it lives.** Analyzer prompt (self-check) +
analyzer Stop hook (enforcement). The consolidator passes the
field through unchanged.

**The change.** Every `needs_verification` item gains a NEW
required field: `attempted_resolution`, an array of strings naming
the verification work the agent did before surfacing the item.

```json
{
  "id": "v1",
  "question": "Is the Redis instance shared across services or per-service?",
  "reason": "...",
  "attempted_resolution": [
    "grep -r 'createClient' services/*/src/",
    "Read services/backend/src/redis/redis.module.ts",
    "Read services/web-frontend/src/lib/redis-client.ts"
  ]
}
```

**Validator behaviour.**

- Hard-reject when the field is missing, empty, or contains <2
  entries. Items that "couldn't determine after searching" need
  multiple search attempts; items that "couldn't determine without
  asking" need to demonstrate the search.
- Hard-reject entries that are not actual tool invocations:
  reject prose ("I tried to find it but couldn't"), reject empty
  strings, reject one-word entries.
- Soft-warn when entries duplicate (e.g. four times "Read
  package.json"); the agent searched the same place repeatedly.

**Why this works.** Prose-token detection plays whack-a-mole with
the agent's phrasing. Forcing the agent to enumerate search
attempts moves the proof into structured data the validator can
inspect deterministically. Items where the agent didn't search at
all are blocked at the schema layer; items where the agent searched
but the answer truly isn't in the repo pass through with
provenance.

**Stack-agnostic.** Tool names are framework-known
(Read/Grep/Glob/Bash/mcp__code_graph__*). The shape works for any
language family.

### C.2. Ban graph-internals language in user-facing prose

**Where it lives.** Analyzer prompt (banned-phrase list) +
analyzer Stop hook (enforcement).

**The change.** A new validator that hard-rejects items whose
`question` OR `reason` contains any of:

- "graph traversal", "graph parsing", "graph data", "graph
  community", "graph nodes", "graph search", "graph index", "graph
  result", "graph returned"
- "Class search", "Function search", "File search" capitalised
  (these are MCP tool names leaking out)
- "semantic search returned", "semantic_search_nodes",
  `mcp__code_graph__*` substrings
- "during graph traversal", "from graph data alone", "may have
  been missed during graph parsing"
- "community size", "community member analysis", "community
  payload"

**Why.** The user does not know what the graph is. The graph is
internal tooling — like a database query plan — and questions that
assume the user understands graph internals are unanswerable AND
expose the wrong abstraction. Operator quote: *"the graph is only
a tool behind the scene, if a grep, search or glob is needed we
have to use it to continue researching before asking."*

**Stack-agnostic.** Every banned phrase is graph-implementation
language; nothing in the list ties to a specific language family.

**Edge case.** The agent may LEGITIMATELY say "graph" inside an
analyzer's `attempted_resolution` field — that's verification
work, not user-facing prose. The validator scans only `question`
and `reason`, not `attempted_resolution`.

### C.3. Reject fabricated numbers in questions

**Where it lives.** Analyzer prompt + analyzer Stop hook.

**The change.** Hard-reject items whose `question` matches the
fabricated-number pattern:

- `~\s*\d+` (tilde-prefix), `≈\s*\d+`, `approximately\s+\d+`
- `roughly\s+\d+`, `around\s+\d+`, `about\s+\d+\s+(files|functions|classes|lines|tests|services|packages|modules)`
- Multiple comma-separated number guesses: `\d+,\s*\d+,\s*\d+`
  inside a question — almost always a guess block.

**Why.** Asking the human "are these numbers right?" presupposes
the human knows. They usually don't (operator confirmed: dev had
no idea about the file counts). And the agent CAN compute the
count deterministically — `Glob` + `length` is one tool call.

**Resolution path** for the agent: either compute the number and
state it as a fact, or omit numbers from the question. Numbers
without provenance read as guesses regardless.

**Stack-agnostic.** Number patterns are language-neutral.

### C.4. Mandatory manifest-vs-import cross-check

**Where it lives.** Analyzer Stop hook (deterministic check on the
emitted JSON; no prompt-side equivalent — this is a sanity rule
the agent could easily fail to self-apply).

**The change.** Add a soft-warning detector that fires when:

- The `question` mentions a dependency NAME (matches one of:
  `@scope/package`, `package-name`, `org.group/artifact`,
  `crate-name`, `gem_name`).
- AND the `reason` contains "declared as dependencies" / "in
  package.json" / "in pyproject.toml" / "in Cargo.toml" / etc.
- AND `attempted_resolution` does NOT contain a Grep/search for
  the package's IMPORT statements (e.g. `from <pkg>`, `import …
  from '<pkg>'`, `require '<pkg>'`, `use <pkg>`, `using <pkg>`).

The agent saw the dependency declaration but never searched for
where (or whether) it's actually imported. The answer is in the
import sites. If they don't exist, the finding is "declared but
never imported" — emit that as a finding under
`findings.dependencies.<service>.declared_but_unused`, not as a
question.

**Stack-agnostic.** The patterns cover the import syntax of every
supported language family.

### C.5. Synonym expansion for outside-this-repository

**Where it lives.** Analyzer prompt (banned-phrase list) +
analyzer Stop hook (extends `SPECULATIVE_TOKENS`).

**The change.** Extend §C 4.3's existing `SPECULATIVE_TOKENS` to
match these synonyms:

- "infrastructure repository", "separate repository", "another
  repository", "vendor portal", "infrastructure managed elsewhere"
- "external system", "external infrastructure", "external service
  managed by"
- "build environment" + "reachable" / "accessible" (network state,
  outside the repo by definition)
- "from production build environments" / "from CI environments"
  (a build-env reachability question is unanswerable from the repo)

**Why.** Question #4's "managed in a separate infrastructure
repository or external system" should have fired the existing
gate. It didn't because the regex was too narrow. Expanding the
synonym set picks up more real cases without false positives.

### C.6. Cap behaviour change: target 0, hard-cap 3

**Where it lives.** Analyzer prompt (`verification-format.md`) +
schema (existing `.max(3)`).

**The change.** Update the prompt copy in
`verification-format.md`:

```
Maximum 3 verification items per agent. **Target 0.** The
framework has high tolerance for items that genuinely cannot be
resolved by reading the repo, but emitting items that turn out to
be code-derivable is a regression that wastes the operator's
time. If you have ANY uncertainty about whether the item is
code-derivable, drop it — operator review of an empty list is
cheaper than operator dismissal of three speculative items.
```

The hard cap of 3 stays; the prompt now tells the agent the
RIGHT number is 0 unless something is genuinely human-knowledge.

**Why.** The cap of 3 incentivises the agent to fill to 3. The
prompt currently says "prioritize the most critical unknowns" —
which still implies "find 3." The new wording says "0 is the
right answer; 3 is the absolute ceiling, not a target."

### C.7. Relevance gate — `impact` field

**Where it lives.** Analyzer prompt + Stop hook (schema check) +
internal self-check.

**The change.** Operator quote: *"the questions added to the
output of the analyzers must be real questions that can't be
inferred from the code AND that are REALLY RELEVANT to get
conclusions."*

`attempted_resolution` proves "can't be inferred from the code."
This new field proves "really relevant to get conclusions." Add a
required `impact` field per item:

```json
{
  "id": "v1",
  "question": "...",
  "reason": "...",
  "attempted_resolution": [...],
  "impact": "Determines whether the testing-conventions skill body lists 'enforced 80% line coverage' or 'no enforced threshold'."
}
```

**Validator behaviour (Stop hook).**

- Hard-reject when the field is missing or empty.
- Hard-reject when the impact text is generic
  ("important for documentation", "useful to know", "helps with
  context", "affects the analysis"). The `impact` must name the
  CONCRETE artefact / decision the answer changes — a wiki page
  body, a skill body, an architectural finding, a config-default
  decision. We detect generic impact via a banned-phrase list:
  `important for|useful to|helpful for|affects the analysis|
  provides context|good to know|nice to have|for completeness`.
- Hard-reject when the `impact` text is shorter than 40 characters
  — too short to name a concrete change.

**Why.** Without an `impact` field, the agent emits items "just in
case" — Q4's Sentry-URL-reachability is a perfect example: the
answer doesn't change any wiki page or skill, it's noise. With
the field, the agent is forced to articulate WHAT CHANGES, which
is itself a filter on the question's relevance. A question with
no clear `impact` IS noise, regardless of the prose.

**Stack-agnostic.** The artefacts named in `impact` are framework
outputs (wiki page, skill, finding) — language-neutral by
construction.

### C.8. Two-layer hook architecture (internal + external)

**The operator's request.** *"That must be a hook validation (in
both layers internal and external)."* Concrete shape per layer:

#### C.8.1. External hook (Stop hook, deterministic)

`orchestration/src/nodes/initialize-project/phase1/shared/hooks/validate-analyzer-json.hook.ts`
already runs after every analyzer attempt. It currently runs the
schema check + the existing speculative-token detector. We extend
it with all the C.1–C.7 rules:

```ts
const violations = [
  ...validateSchema(parsed),
  ...validateAttemptedResolution(parsed.needs_verification),
  ...validateNoGraphInternals(parsed.needs_verification),
  ...validateNoFabricatedNumbers(parsed.needs_verification),
  ...validateImpactField(parsed.needs_verification),
];
if (violations.length > 0) blockWithFeedback(...violations);
```

The Stop hook is the AUTHORITATIVE enforcement layer. If a rule
isn't enforced here, it's not enforced.

#### C.8.2. Internal hook (agent self-check, prompt-side)

The "internal hook" is a structured self-validation pass the
agent runs against its own draft `needs_verification` array
BEFORE writing JSON. We add a new section to the analyzer prompt:

```markdown
## Pre-emit self-validation (run BEFORE writing the final JSON)

For every item you intend to put in `needs_verification`, walk
through this checklist. Drop any item that fails ANY check:

1. **Tried to resolve it?** I ran AT LEAST 2 concrete tool calls
   (Read / Grep / Glob / Bash / mcp__code_graph__*) against this
   exact question. If not, drop the item.
2. **No graph internals?** Question and reason mention only
   project state ("Does X integrate with Y?" / "What is the auth
   strategy?"), never tool internals ("graph traversal", "Class
   search returned 0", `mcp__code_graph__*`). If they leak, drop.
3. **No fabricated numbers?** I am not asking the human to
   confirm a count I guessed (`~180 files`, `roughly 12
   classes`). If yes, either compute the number or omit it.
4. **Concrete impact?** The `impact` field names a SPECIFIC
   artefact (wiki page / skill / finding) the answer changes. If
   the answer doesn't change any concrete output, the item is
   noise — drop it.
5. **Manifest-declared with no import search?** I searched
   `package.json` / `pyproject.toml` / `Cargo.toml` / etc., but
   did I also `Grep` for `import`/`require`/`use` statements
   referencing the package? If not, do that search now and
   either resolve the item or surface "declared but not imported"
   as a finding instead.
```

This is **psychological priming**, not enforcement. It catches
items on the FIRST attempt instead of on retry. The Stop hook
remains the authoritative layer; the self-check just reduces
retry cost (and prompt-cache cost on retries) by ~30-50% on
realistic runs.

For Codex specifically, the internal validation loop (max 5
iterations of self-correction before emitting to the orchestrator)
also runs the self-check — the loop has the same prompt
guidance, so if the FIRST emission has a bad item, the second
internal-iteration drops it. Saves a full provider round-trip
when it works.

#### C.8.3. Why both layers

External alone → every bad item costs a full retry round-trip
(spawn → tool calls → emit → reject → spawn). Wasteful.

Internal alone → the agent has no enforcement. Drift is
inevitable as prompts evolve.

Both → fast first-attempt success rate (internal) with
deterministic guarantee (external). Same rule set in both layers
so the two don't drift apart.

### C.9. Consolidator performance + scope tightening

**Operator request.** *"The question consolidator must be really
fast and cheap, only verify duplicated without analyzing code or
that kind of stuff."*

The current consolidator:

- Spawns an LLM agent (`question-consolidator`) with a closed-book
  prompt to merge near-duplicate questions across analyzer
  outputs.
- Runs in seconds on small inputs but minutes on large inputs.
- Validates output shape via `validateConsolidationOutput`.
- Has no explicit no-fly list of what it must NOT do.

What we change:

#### C.9.1. Lock the consolidator's tool surface to `none`

`orchestration/agents/06-question-consolidator.md` frontmatter
explicit `tools: none`. The consolidator already has no
`Read`/`Grep`/`Glob`/`Bash`/`mcp__code_graph__*` access in
practice, but make the contract explicit so it can never grow new
tools accidentally.

Add a defensive check in
`closed-book-prompt-hygiene.test.ts` (which already exists from
Wave 2 Fix 6.2): the consolidator's prompt must NOT contain any
language describing code analysis.

#### C.9.2. Skip the LLM entirely when input ≤ N items

Current behaviour: the consolidator spawns even when there are 0,
1, or 2 gaps to consolidate (no real work to do). At ≤ N items
we short-circuit: pass-through to `gaps[]` with no LLM call.

Threshold: **N = 3**. Below 3 items there's almost never a
duplicate to merge; spawning the agent costs ~10-15s for zero
expected gain.

Implementation: in
`orchestration/src/nodes/initialize-project/phase2/question-consolidator/question-consolidator.node.ts`
gate `consolidateQuestions(...)` behind `gaps.length > 3`. The
existing single-gap fast path (`gaps.length === 1` skips
consolidation) already exists; this widens the threshold.

Effect: on a clean run after analyzer-side hardening (where the
average is 0–2 items per analyzer × 4 analyzers = 0–8 items
total, often deduped to <5), most projects skip the consolidator
entirely. Saves ~30-60s on the typical run.

#### C.9.3. Pre-LLM deterministic dedupe

When the consolidator IS spawned (>3 items), run a deterministic
pre-dedupe pass first:

- Group items by **normalised question text** (lowercase, strip
  punctuation, collapse whitespace). Items with identical
  normalised text collapse to a single entry whose
  `consolidated_from` is the union of source agents.
- Then pass the (smaller) deduped set to the LLM for the
  semantic / paraphrase merge step.

The deterministic pass costs ~1ms; the LLM call costs ~10s. On
high-duplicate inputs (the common case where multiple analyzers
asked literally the same question) the deterministic pass alone
resolves 60-80% of the duplicates and the LLM gets a shorter,
faster input.

Implementation: new helper
`orchestration/src/nodes/initialize-project/phase2/question-consolidator/helpers/exact-text-dedupe.ts`,
called before `consolidateQuestions`. Returns
`{ dedupedGaps, eliminatedDuplicates }`. The LLM agent receives
`dedupedGaps`; the orchestrator merges
`eliminatedDuplicates` back into the final `consolidation_groups`.

#### C.9.4. Trim the consolidator's prompt

The current consolidator prompt
(`orchestration/src/nodes/initialize-project/phase2/question-consolidator/prompts/consolidation-instructions.md`)
spends most of its tokens on output-format rules. We trim:

- Output format block stays (load-bearing for validation).
- Drop the long "Question Format" / "Keep Questions Clean" /
  "Required Fields" sub-sections — the schema validator catches
  those structurally.
- Add an explicit **non-goals** section:
  ```markdown
  ## You are NOT
  - A code analyzer. You have NO tools. Do not attempt to read
    files, run grep, or call graph queries.
  - A quality reviewer. The analyzer Stop hook already enforced
    every quality rule. Do not drop items because you doubt
    them.
  - An editor. Do not rewrite questions beyond minimal whitespace
    canonicalisation; the analyzer's wording is final.
  ```

Saves ~2-3 KB per consolidator spawn. Combined with C.9.2 / C.9.3
the consolidator is a net cost reduction on every run.

#### C.9.5. Remove the `attempted_resolution` field from the consolidator's output

The consolidator does not run search work, so its output items
should not carry `attempted_resolution`. The field is preserved
through the consolidator transparently (read from each input
gap, written through to the output gap unchanged) but the
consolidator never adds, modifies, or trims the field.

The schema accepts `attempted_resolution` at the consolidator-
output layer for back-compat; the validator checks that what
came in matches what goes out.

---

## D. Schema + validator changes

### D.1. Schema (one location, four analyzer outputs)

`orchestration/src/schemas/phase1-agent-outputs.schema.ts` — every
needs_verification entry gets two new required fields:

```ts
z.object({
  id: z.string(),
  question: z.string(),
  reason: z.string(),
  attempted_resolution: z.array(z.string().min(1)).min(2)
    .describe(
      'List of search attempts (Read/Grep/Glob/Bash/mcp__code_graph__*) ' +
      'the agent ran BEFORE surfacing this item. Minimum 2 entries; an ' +
      'empty list means the item was not earned. Each entry MUST be a ' +
      'concrete tool invocation (e.g. "grep -r \\"@aws-sdk\\" services/"), ' +
      'NOT prose.',
    ),
  impact: z.string().min(40)
    .describe(
      'Concrete artefact (wiki page / skill body / finding) the answer ' +
      'changes. Must NAME the artefact and WHAT changes about it; ' +
      'generic phrasing ("important for documentation") is rejected.',
    ),
})
```

Same shape on all 4 analyzer schemas. The `consolidator` output
preserves both fields through `extract-structured-gaps.ts`.

**Back-compat.** This is a breaking schema change at the agent-
output layer. Phase 1 analyzer agents must emit the field starting
with the next prompt revision. The Stop hook will reject any
output whose `needs_verification[]` lacks the field. Operator
impact: zero — this only affects analyzer outputs the operator
never sees as JSON.

### D.2. New validator: `validateNeedsVerificationProse`

A new helper in
`orchestration/src/nodes/initialize-project/phase1/shared/needs-verification-quality.ts`
(extending the existing module). Returns a list of HARD violation
strings (empty = pass):

```ts
export function validateNeedsVerificationProse(
  items: unknown,
): string[];
```

Checks per item:

1. **Graph-internals ban** (§C.2 patterns). Hard-reject.
2. **Fabricated-number pattern** (§C.3 patterns). Hard-reject.
3. **Empty / too-short `attempted_resolution`** (§C.1 rules).
   Hard-reject.
4. **Non-tool entries in `attempted_resolution`** (string starts
   with prose, doesn't reference a known tool, etc.). Hard-reject.

Wired into the Stop hook (`validate-analyzer-json.hook.ts`)
alongside the existing schema check. Agent gets feedback on the
NEXT retry attempt with the offending item flagged.

### D.3. Extended soft-warning detector

The existing `hasSpeculativeNeedsVerification` /
`findSpeculativeNeedsVerification` adds:

1. **§C.4 manifest-vs-import** rule. Soft warning code:
   `manifest_declared_but_no_import_search`.
2. **§C.5 synonym list** expansion of existing categories.

Soft warnings continue to surface in `soft_warning[]` per attempt;
they do NOT fail the run.

### D.4. Prompt updates

`orchestration/src/nodes/initialize-project/shared/prompts/verification-format.md`
— rewrite per §C.6, plus add the `attempted_resolution`
requirement to the `Format` section:

```markdown
## Format

```typescript
{
  id: string,
  question: string,
  reason: string,
  attempted_resolution: string[],  // REQUIRED, MIN 2
}
```

Each `attempted_resolution` entry MUST be a concrete tool
invocation. Examples (across language families):

- `Read services/backend/package.json`
- `Glob "**/passport-*.ts"`
- `grep -r "@aws-sdk" services/`
- `mcp__code_graph__semantic_search_nodes_tool({ query: "Sentry", limit: 20 })`
- `Bash: find services -name "*Controller*"`

Reject prose entries like "I tried to find it" or "couldn't
locate the file".
```

Plus add a stack-agnostic ban list inline:

```markdown
## Banned in question / reason text

These leak framework internals. The user does not know what the
graph is — the graph is internal tooling, like a database query
plan. Express questions in terms of project state, never in
terms of how the framework looked.

- "graph traversal", "graph parsing", "graph community", "Class
  search returned 0", "graph data alone", "during graph parsing"
- `mcp__code_graph__*` tool names
- Fabricated numbers ("approximately 180 files", "~3K functions",
  "around 12 classes") — either compute the number or omit it.
```

### D.5. Update `hasSpeculativeNeedsVerification` callers

The existing emitter (`computeSoftWarnings` →
`speculative_needs_verification` warning) becomes one of several
signals. Add codes:

- `graph_internals_in_user_prose` (hard)
- `fabricated_numbers_in_question` (hard)
- `missing_attempted_resolution` (hard)
- `missing_or_generic_impact` (hard)
- `manifest_declared_but_no_import_search` (soft)

The existing `speculative_needs_verification` keeps the prose-
token detector for back-compat (legacy items that snuck through
on older runs still get surfaced).

### D.6. Consolidator helpers (§C.9)

`orchestration/src/nodes/initialize-project/phase2/question-consolidator/helpers/exact-text-dedupe.ts`
— deterministic pre-LLM dedupe by normalised question text.
Returns `{ dedupedGaps, eliminatedDuplicates }` for the
orchestrator to merge back into the final consolidation_groups.

The Phase 2 node
(`question-consolidator.node.ts`) gets the new threshold gate:

```ts
if (gaps.length <= 3) {
  // Pass-through: no LLM spawn. Each gap becomes its own group.
  return { gaps: passThroughGaps(gaps) };
}

const { dedupedGaps, eliminatedDuplicates } = exactTextDedupe(gaps);
if (dedupedGaps.length <= 3) {
  // Deterministic pass alone resolved enough — skip the LLM.
  return { gaps: passThroughGaps(dedupedGaps), consolidation_groups: [...] };
}

// Otherwise spawn the consolidator agent on the smaller set.
const consolidated = await consolidateQuestions(dedupedGaps, ...);
return mergeWithEliminatedDuplicates(consolidated, eliminatedDuplicates);
```

---

## E. Tests

### E.1. New unit tests

`orchestration/test/unit/nodes/initialize-project/phase1/shared/needs-verification-quality-prose.test.ts`:

For each gira question 1–7, assert:

- Question 1 (`main.tsx` exists?) → fails on
  `missing_attempted_resolution` when the agent's
  `attempted_resolution` is empty; passes when the agent's
  resolution includes a `Read` of the file.
- Question 2 (file-count guess) → fails on
  `fabricated_numbers_in_question`.
- Question 3 (S3/OAuth implemented?) → soft warning
  `manifest_declared_but_no_import_search` when the agent
  searched only manifests, no import sites.
- Question 4 (CI exists / Sentry reachable) → fails on the
  expanded synonym set ("infrastructure repository", "build
  environments").
- Question 5 (testing coverage policy) → PASSES (legitimate item).
- Question 6 (NestJS controllers beyond graph) → fails on
  `graph_internals_in_user_prose`.
- Question 7 (ioredis usage) → same fail as #6.

Plus the per-rule unit tests:

- `validateNeedsVerificationProse`: graph-internals rule fires
  on each banned phrase; fabricated-number rule matches
  `~123` / `≈123` / `approximately 123` / `roughly 123` / etc.;
  missing-attempted-resolution fires on empty / null / 1-entry
  arrays; non-tool entries are detected.
- Stack-agnostic spread: every test uses fixtures from at least
  three language families (TypeScript / Python / Java) to prove
  the rules are language-neutral.

### E.2. Schema tests

`orchestration/test/unit/schemas/phase1-agent-outputs.schema.test.ts`
extension: needs_verification entries without
`attempted_resolution` fail the schema; entries with `< 2`
attempts fail; entries with `2+` pass.

### E.3. Integration sweep

Run the existing suite + new tests; verify that the gira-style
fixtures (synthetic) produce the right warning + fail signals.

---

## F. Rollout

| Step | Description                                                                                                                | Layer            | Risk |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---- |
| 1    | Update `verification-format.md` (prompt-only). Add the §C.8.2 self-check section. Stop hook still tolerates missing fields. | analyzer prompt  | low  |
| 2    | Land `validateNeedsVerificationProse` as a SOFT warning emitter for `attempted_resolution` + `impact`.                     | Stop hook (soft) | low  |
| 3    | Update schema: require `attempted_resolution` (≥2) AND `impact` (≥40 chars). Stop hook rejects missing field. **Breaking for analyzer outputs.** | schema + Stop hook | medium |
| 4    | Promote graph-internals + fabricated-numbers + generic-impact detectors to HARD validators.                                | Stop hook (hard) | medium |
| 5    | Roll out the expanded synonym list (§C.5) and the manifest-vs-import soft warning (§C.4).                                  | Stop hook (mixed) | low  |
| 6    | Lock the consolidator's tool surface to `none` (§C.9.1) + add the closed-book hygiene anti-regression test.                | consolidator     | low  |
| 7    | Add the deterministic `exact-text-dedupe` pre-pass (§C.9.3) and gate the LLM consolidator behind `gaps.length > 3` (§C.9.2).  | consolidator     | medium |
| 8    | Trim the consolidator prompt + add the explicit non-goals section (§C.9.4).                                                | consolidator     | low  |

Steps 1–2 ship in one commit (analyzer prompt + soft validator).
Steps 3–4 ship in a second commit (schema breaking change + hard
validators). Step 5 ships in a third commit (synonym + manifest
cross-check). Steps 6–8 ship in a fourth commit (consolidator
performance + scope tightening) — they are independent of the
analyzer-side hardening but depend on it for the cleaner-input
assumption.

Each commit includes the relevant tests and passes typecheck +
lint + format gates.

---

## G. Acceptance criteria

After this lands, a fresh `/initialize-project` run on gira (or
any project) must produce:

**Question quality (analyzer-layer):**

- [ ] **0 questions** that mention "graph", "semantic search",
  "Class search returned", `mcp__code_graph__*`, "graph traversal",
  "during graph parsing", or "graph data alone".
- [ ] **0 questions** with fabricated numbers (`~N`, `≈N`,
  `approximately N`, `roughly N` of files / functions / classes).
- [ ] **Every question has ≥2 entries in `attempted_resolution`**,
  each a concrete tool invocation.
- [ ] **Every question has a concrete `impact` field** (≥40 chars)
  naming a specific artefact (wiki page / skill / finding) the
  answer changes; generic phrasing is rejected.
- [ ] Manifest-declared dependencies trigger the soft warning
  when the agent didn't search for import sites.
- [ ] Synonyms of "outside this repository" surface the existing
  `speculative_needs_verification` warning.
- [ ] On a re-run of the gira fixture: of the 7 questions, only
  question 5 (testing coverage policy) survives. The other 6 are
  blocked at the schema or validator layer with feedback the agent
  acts on in the retry.

**Consolidator performance:**

- [ ] On runs with ≤3 total gaps across all 4 analyzers, the
  consolidator skips the LLM spawn entirely (saves ~10-15s).
- [ ] On runs with >3 gaps, the deterministic `exact-text-dedupe`
  pre-pass resolves duplicate-by-normalised-text cases without an
  LLM call; the LLM only sees genuinely-paraphrased pairs.
- [ ] The consolidator's tool surface is `none` (verified by the
  closed-book hygiene anti-regression test).
- [ ] The consolidator prompt is trimmed; the "non-goals" section
  explicitly bans code analysis / quality review / question
  rewriting.
- [ ] Aggregate Phase 2 wall-clock duration drops from ~1m on the
  current gira run to ≤30s on the typical case (and to a few
  hundred ms on the ≤3-gap fast path).

---

## H. Open question for confirmation

**Should `attempted_resolution` ALSO accept "this fact lives in a
human-only system" as a valid entry?** For example, "the dev who
configured Sentry remembers the URL" or "the operator confirmed
in Slack." These are legitimate — they explain why no tool can
resolve the item.

My proposal: yes, but with a hard prefix `human:` and a free-form
explanation. So `attempted_resolution: ["human: requires operator
knowledge of Sentry instance accessibility from CI runners"]` is
allowed AS THE ONLY entry (it explains why search wasn't tried).
The validator counts a single `human:`-prefixed entry as
satisfying the ≥2 requirement when the rest of the resolution is
"there is no tool path to this answer."

If you don't want this escape hatch, drop the `human:` clause and
the rule reverts to "≥2 tool invocations always." Confirm before I
implement.

---

**Awaiting your confirmation or change requests before I touch any
code.** As you asked.
