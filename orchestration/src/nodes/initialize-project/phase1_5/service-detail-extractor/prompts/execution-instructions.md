# Execution instructions — Service Detail Extractor

## Step 0 — Read project-inspection.json (MANDATORY)

The Phase 0 inspector wrote `<tempDir>/project-inspection.json` BEFORE
you spawned. It contains the deterministic facts the framework already
knows about every service: lock files, manifest summaries, runtime
versions, declared scripts, etc.

**Find the entry for your `service_id`** in the inspection's `services`
map and use it as the source of truth for:

- The package manager / build tool / test runner the service uses.
- Declared scripts (Node `package.json#scripts`, Go `go.mod`, Python
  `pyproject.toml#tool.poetry.scripts`, etc.).
- Runtime version (`.nvmrc`, `engines.node`, `python-version`,
  `go.mod` `go` directive).

> **Step 0 tool budget:** 1 Read on `<tempDir>/project-inspection.json`.

Do NOT re-glob lock files or manifest files for these facts — they are
already in the inspection. The orchestrator surfaces the relevant
slice in your `<service>` block.

## Step 1 — Graph-first per-service exploration

Use the graph to discover what's _in_ your service:

> **Step 1 tool budget:** ≤ 6 graph calls total.

- `mcp__code_graph__semantic_search_nodes_tool` with the search root
  scoped to your service path — find handlers, controllers, services,
  repositories, models, DTOs.
- `mcp__code_graph__get_minimal_context_tool` on the entry-point
  symbols you found — pull just enough to write a `code_patterns`
  entry without re-reading the whole file.
- `mcp__code_graph__list_communities_tool` to see how the graph
  clusters symbols within your service (helpful when picking
  representative patterns).

If `mcp__code_graph__*` is unavailable in this run (`available: no`
in your **CODE GRAPH CONTEXT** block), fall back to Glob/Read scoped
to your service path. Surface this as
`soft_warning: ["mcp_completely_unavailable"]` in your output.

## Step 2 — Code patterns (≤ 12)

Pick the patterns that teach a new contributor the shape they should
mimic when adding new code to this service. Quality > quantity.

> **Step 2 tool budget:** ≤ 8 Reads total.

For each pattern:

- Open the candidate file with `Read`. Read just the lines you need —
  don't slurp whole files.
- Copy a verbatim ≤ 600-char excerpt into `code`.
- Set `source_file` to the path from repo root (must begin with your
  service `path`) and `source_line` to the 1-based line number where
  the snippet starts.
- Choose a hyphenated `kind` label that names the SHAPE, not the
  technology (`error-return-pattern`, `dto-validation`,
  `controller-shape`).
- Add a `note` (≤ 120 chars) when the snippet's intent isn't
  obvious from the code alone.

## Step 3 — Request lifecycle (backend / serverless / worker only)

For services whose `type` is one of `backend` / `frontend` /
`serverless` / `worker`, walk one representative request from entry
to response and emit ≤ 10 `{step, where, note?}` rows.

Skip this step entirely for `library` / `cli` / `infrastructure` —
they have no request flow. Omit the `request_lifecycle` field rather
than emitting an empty array.

> **Step 3 tool budget:** ≤ 4 graph drill-ins, ≤ 4 Reads.

- `step` is a verb-led label (≤ 120 chars): "Receive HTTP request",
  "Validate body", "Dispatch to use-case", "Persist via repository".
- `where` names the concrete code anchor (≤ 200 chars) — file path
  PLUS the symbol the agent reading the wiki can `Grep` for:
  `src/users/users.controller.ts:UsersController.create`.
- `note` is optional (≤ 240 chars) — clarify what changes about the
  request shape at this step.

## Step 4 — Representative tests (≤ 5)

For services with tests, pick up to 5 representative spec/test files
that show the project's conventions.

> **Step 4 tool budget:** ≤ 6 Reads total.

For each:

- `file` — path from repo root.
- `name` — optional `describe` / `it` / `test` name (≤ 160 chars).
- `snippet` — same `CodeSnippet` shape as `code_patterns`. ≤ 600
  chars verbatim.

If the service has no tests, OMIT the `testing` field rather than
emitting an empty `representative_examples: []`. Add a `notable`
bullet ("No automated tests in this service") so the operator sees
the absence as a finding.

## Step 5 — Notable items (≤ 8)

Free-form bullets (≤ 280 chars each) capturing service-specific
gotchas the patterns don't show:

- "Uses two-stage Docker build with `golang:1.21-alpine` → `scratch`."
- "Exposes WebSocket only when `WS_ENABLED=true` is set in
  `.env.development`."
- "All HTTP responses pass through `interceptors/audit-trail.ts` —
  bypassing it loses request context."

Don't pad. Three sharp bullets beat eight padded ones. Empty array is
fine.

## Step 6 — Self-check

Before emitting JSON:

1. Is `service_id` the exact value from `<service>` (no rename, no
   case change)?
2. Does every `source_file` start with my service `path`? Anything
   outside that path is a hard validation failure.
3. Are all snippets ≤ 600 chars and free of trailing whitespace?
4. Did I avoid technology-tied `kind` labels? (`nestjs-controller`,
   `react-hook` are wrong — `controller-shape`, `presentational-hook`
   are right.)
5. For backend/serverless/worker — did I emit `request_lifecycle`?
   For library/cli/infrastructure — did I OMIT it?
6. Is the entire output raw JSON with no prose / fences?

## Output Format Key Points

- Raw JSON. First character `{`, last character `}`. No prose.
- `agent_name`: literal string `service-detail-extractor`.
- `service_id`: echo from prompt verbatim.
- `graph_queries_used` is computed by the framework from the Stop
  hook's tool-use sidecar — do NOT populate it yourself.
- `needs_verification` is capped at 3 entries; each entry must have
  ≥ 2 `attempted_resolution` items and ≥ 40-char `impact` describing
  what wiki page / skill body / config-default the answer changes.

### JSON example skeleton

```json
{
  "agent_name": "service-detail-extractor",
  "timestamp": "2026-05-09T00:00:00.000Z",
  "service_id": "<echo from prompt>",
  "graph_queries_used": [],
  "findings": {
    "code_patterns": [
      {
        "kind": "<shape-label>",
        "language": "<canonical lowercase id>",
        "code": "<verbatim ≤ 600 chars>",
        "source_file": "<relative-path>",
        "source_line": 42,
        "note": "<optional ≤ 120 chars>"
      }
    ],
    "request_lifecycle": [
      {
        "step": "<verb-led ≤ 120 chars>",
        "where": "<file-path:Symbol>",
        "note": "<optional ≤ 240 chars>"
      }
    ],
    "testing": {
      "representative_examples": [
        {
          "file": "<relative-path>",
          "name": "<optional ≤ 160 chars>",
          "snippet": {
            "kind": "test-case",
            "language": "<canonical lowercase id>",
            "code": "<verbatim ≤ 600 chars>",
            "source_file": "<relative-path>",
            "source_line": 1
          }
        }
      ]
    },
    "notable": ["<≤ 280-char bullet>"]
  },
  "needs_verification": []
}
```
