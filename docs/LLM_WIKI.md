# LLM Wiki — router contract, retrieval model, conventions

The LLM wiki is the project-specific knowledge base that downstream agents consult before touching code. This page documents the *contract* between the framework that generates the wiki and the agents (planner, implementer, doc-updater, reviewer) that consume it.

It does not document any individual page's content — those are project-specific and live under `<project>/docs/llm-wiki/wiki/`.

---

## TL;DR

1. **Generation is closed-book synthesis over already-digested upstream.** The `wiki-generator` agent has no filesystem or MCP tools; its prompt carries the Phase 1 analyzer JSON, the Phase 3 synthesis, the just-generated CLAUDE.md, and the project-context skill. If a fact is missing from that input, the page records the gap with `(not determined by analysis)` — never re-explores the source tree.
2. **Retrieval is router-driven.** `<project>/docs/llm-wiki/CLAUDE.md` (Claude) or `AGENTS.md` (Codex) is the runtime entry point. ≤150 lines. Decision table tells consumers which page to read for which question.
3. **`index.md` carries summaries inline.** One read of `index.md` returns the same information today's "walk every page's frontmatter" pattern used to gather across N files. Tier 1 retrieval collapses to one file open.
4. **Three tiers, in order:** (1) router + index, (2) read 1–3 page bodies, (3) follow `[[wikilinks]]` at depth ≤ 2. Fallback to graph MCP tools when the wiki doesn't answer.

---

## Layout

```
<project>/docs/llm-wiki/
├── CLAUDE.md              # router (Claude provider)
├── AGENTS.md              # router (Codex provider) — only one of CLAUDE/AGENTS/COPILOT exists
├── CHANGELOG.md           # Keep-a-Changelog: one entry per ingest
├── log.md                 # append-only chronological log
├── .state.json            # graph_commit, graph_sha, last_ingest_at, graph_stats
├── raw/
│   ├── snapshots/         # pinned human-authored project docs (sha256 stamped)
│   └── external/          # opt-in cached external docs
└── wiki/
    ├── index.md           # summary catalog (Tier 1 entry — one read)
    ├── ARCHITECTURE.md    # LLM-synthesized
    ├── DATA-FLOWS.md      # LLM-synthesized
    ├── PATTERNS.md        # LLM-synthesized
    ├── SERVICES.md        # deterministic catalog (no LLM call)
    └── services/
        └── <service-id>.md  # one per detected service, LLM-synthesized
```

`raw/` is read-only for AI agents — re-ingest via `/wiki-refresh` instead of editing by hand. Phase 1 analyzer JSONs are not stored here; they live under `.<provider>-temp/initialize-project/phase1-outputs/` per the framework's disk-first idempotency pattern.

---

## The router (`CLAUDE.md` / `AGENTS.md`)

The wiki's own router doc is the runtime entry point. It is project-specific (service list, available graph tools templated in) but the routing rules are universal. Every consumer skill (`create-sdd-ticket`, `implement-ticket`, etc.) reads it first.

Sections:

1. **Wiki at a glance** — one paragraph naming the project, service count, top-level docs.
2. **How to query (decision table)** — which page to read for which question.
3. **Tier discipline** — index → 1–3 page bodies → wikilinks (depth ≤ 2) → graph MCP fallback.
4. **Available graph tools** (optional) — live MCP tool catalog from Phase 0. Only emitted when the catalog is non-empty.
5. **Ingest workflow** — what `/wiki-refresh` does on every PR.
6. **Off-limits** — `raw/` is read-only; `.state.json` is not removed without a `Removed` entry; the router doc itself is regenerated, not hand-edited.

Capped at ~150 lines. Loading the router never costs more than reading a single wiki page body.

---

## The summary catalog (`index.md`)

Generated deterministically after every other page is built. For each page, it reads frontmatter (`summary`, `confidence`, `document_type`, `tags`, `related`) and emits one line per page in the form:

```markdown
- [ARCHITECTURE](ARCHITECTURE.md) — *architecture, confidence: medium* — Monorepo with three services. **Tags:** architecture, topology, typescript, nestjs. **Related:** [[SERVICES]], [[DATA-FLOWS]].
```

Grouped by `document_type`: Architecture → Services catalog → Per-service docs → Data flows → Patterns. Sorted alphabetically within each group for stable diffs.

---

## Frontmatter contract

Every page under `wiki/` carries the same provenance frontmatter. The contract lives in **[`docs/CLAUDE_DIR_LAYOUT.md`](./CLAUDE_DIR_LAYOUT.md)** (developer-facing) — not in the runtime router (which is capped at ~150 lines and project-specific).

Key fields consumed at retrieval time: `document_type`, `summary`, `confidence`, `tags`, `related`. Service docs additionally carry `service_id`, `entry_points`, `dependencies`, `community_id` when known.

---

## Generation contract (`wiki-generator`)

The `wiki-generator` agent runs at the end of Phase 4 of `initialize-project`. **Closed-book.** No `Read`, no `Grep`, no `Glob`, no `mcp__code_graph` tools. Its prompt carries:

- The relevant Phase 1 analyzer JSON (for service docs, sliced to that service only).
- The relevant section of `phase3-synthesis.md`, scoped by heading keywords (architecture / data-flow / pattern keywords for the matching doc).
- The relevant slice of the just-generated `CLAUDE.md`.
- The relevant slice of `project-context/SKILL.md`.

If a fact is missing from that input, the page writes `(not determined by analysis)` and continues. **Never invents. Never falls back to file reads.** A surfaced gap is a Phase 1 bug to fix at the analyzer.

Service-doc concurrency is bounded (default 3 in flight) so the LLM CLI never gets more parallel sessions than the host can usefully service.

---

## Retrieval contract (consumer skills)

Every skill that consults the wiki follows the same four-step pattern:

1. **Read the router** (`docs/llm-wiki/CLAUDE.md` or `AGENTS.md`).
2. **Read the index** (`docs/llm-wiki/wiki/index.md`) — one read, summaries inline.
3. **Expand 1–3 matched bodies.** Cap 5. Stop wikilink traversal at depth 2.
4. **Optional graph call.** When the matched bodies don't fully answer, call `mcp__code_graph__get_minimal_context_tool` *at most once*. Preserve the response — downstream phases (planner, implementer) reuse it.

Persist the loaded context to `<artifacts>/context/wiki-context.md` with sections `## ROUTER`, `## WIKI_INDEX_SNAPSHOT`, `## WIKI_CORE`, and (when step 4 ran) `## get_minimal_context_tool Payload`.

---

## Frontmatter cleanliness

Frontmatter is contractual, not narrative. Two structured fields are sanitized at every materialization site so they stay grep-able and diff-stable:

- **`graph_queries_used`** — only canonical `mcp__code_graph__[A-Za-z0-9_]+` names survive. Free-form analyzer prose (e.g. `"list_communities({ detail_level: 'standard' }) — exceeded token limit"`) is dropped. Source-of-truth path: Phase 1 Stop hook writes a sidecar; the orchestration node overwrites the field from the sidecar; the wiki layer re-applies the regex as defence in depth. See `services/graph-wiki/query-name-normalizer.ts`.
- **`tags`** — bounded curated vocabulary, max 5 entries per page. `service.frameworks.main` strings are split on `+` (multi-package joiners), version constraints stripped (`^x.y.z`, `~x.y.z`, bare `x.y.z`, `>=2.0`), `@scope/` prefix dropped, lowercased, whitespace slugified. Candidates longer than 30 chars are dropped. See `cleanFrameworkTokens` in `services/graph-wiki/document-specs.ts`.

These are the rules that make `index.md`'s summary catalog cheap and useful. A regression here makes Tier 1 retrieval noisy.

---

## Graph navigation discipline (when the wiki does not answer)

If the wiki answers your question, you do not need to call any graph tool at all — that is the whole point of the wiki. When you genuinely need to fall back to the graph, follow the canonical discipline templated into `<project>/.claude/CLAUDE.md` (or `.codex/AGENTS.md`), section *Graph navigation discipline* — same `<!-- GRAPH_DISCIPLINE_START -->` fenced section also present in the project-context skill body.

Quick summary so wiki consumers don't have to look it up:

- **Forbidden:** `mcp__code_graph__get_architecture_overview_tool` — its response has no bounding knob and overflows on any non-trivial graph.
- **Cheap entry:** always start with `mcp__code_graph__get_minimal_context_tool({ task: "<your goal>" })` — ~100 tokens.
- **Lean defaults:** `detail_level: "minimal"`, `limit: 20` MAX on `semantic_search_nodes_tool`, `include_members: false` on `get_community_tool`, `include_source: false` on `get_flow_tool`.
- **Spill protocol:** if a tool result starts with `Error: result (NNN characters) exceeds maximum allowed tokens. Output has been saved to /Users/.../tool-results/...txt`, treat it as a calling error — re-call with tighter parameters; do not read the spillover file.

The full table + drill-in budgets live at `services/graph-wiki/graph-navigation-discipline.ts` (single source of truth) and at `docs/CODE_GRAPH.md`.

---

## Lint policy

`/wiki-lint` enforces:

- **Structural (fail PR):** broken wikilinks; `sources[]` paths that don't exist; missing required frontmatter keys; `graph_version` mismatch with the current `.code-review-graph/graph.db`.
- **Semantic (warn):** orphan pages; stale claims; LLM-detected contradictions across the changed-set + 1-hop.

---

## Extending the wiki

Adding a new core doc type means:

1. Adding a `*Spec` builder in `orchestration/src/services/graph-wiki/document-specs.ts` that names the analyzer slice it consumes and the keyword set it uses to scope the Phase 3 synthesis excerpt.
2. Wiring it into `LLM_WIKI_CORE_GENERATION_ORDER` in `types.ts` and adding a parallel run-core-doc node.
3. Adding the new doc type to `INDEX_GROUP_ORDER` in `wiki-generator.service.ts` so `index.md` groups it under a heading.
4. Updating the router's decision table so consumer skills know when to read the new page.

Adding a new tag or frontmatter field means updating the contract in `docs/CLAUDE_DIR_LAYOUT.md` and any consumer that reads the field. The runtime router does not need a change unless the field changes how agents pick pages.

---

## Why this shape

Three constraints from the 2024–2026 LLM-context research informed the design:

1. **Pipe structured upstream; never re-derive.** The graph-aware analysis happened in Phase 1; the wiki step is a synthesis pass over its outputs, not a second analysis pass. (See Karpathy's "compiler analogy".)
2. **Frontmatter-first at the entry point.** `index.md` and the router enumerate; never inline page bodies.
3. **Treat context as scarce.** Eagerly loading wiki bodies isn't just costly — it actively degrades reasoning. Push everything to lazy. (Chroma 2025 context-rot study: retrieval accuracy on Claude 3.5 Sonnet drops from 88 % → 30 % by 32 k tokens.)

The router is templated by the framework, not LLM-authored — Augment Code's 2,500-repo study found auto-gen schema docs typically *reduce* task success by 0.5–2 %, while carefully-templated routers add ~4 pp.

---

## Related

| Concern | File |
|---|---|
| `wiki-generator` agent prompt | `orchestration/src/nodes/initialize-project/phase4/wiki-generator/prompts/agent.md` |
| Document specs (per-doc prompt builder) | `orchestration/src/services/graph-wiki/document-specs.ts` |
| Wiki generator service (concurrency, frontmatter, schema doc) | `orchestration/src/services/graph-wiki/wiki-generator.service.ts` |
| Wiki preparation node (loads digested upstream) | `orchestration/src/nodes/initialize-project/phase4/wiki-docs/wiki-preparation.node.ts` |
| Frontmatter contract (developer-facing) | `docs/CLAUDE_DIR_LAYOUT.md` |
| Code graph (Phase 0) | `docs/CODE_GRAPH.md` |
| Skills that consume the wiki | `skills/020-development-workflow/{create-sdd-ticket,implement-ticket}/` |
