# Structure & Architecture Analysis Instructions

> **Tool naming.** Bare tool names below (e.g. `list_communities`) are semantic identifiers. The canonical names are listed in the **CODE GRAPH CONTEXT** block in your system prompt — they share the `mcp__code_graph__` prefix and may carry a `_tool` suffix. Always call the catalog name, not a name you find here.

<objective>
Analyze repository structure and identify all services/packages with their languages, frameworks, and architectural patterns. Create a comprehensive map of the codebase structure.
</objective>

<discovery_process>

> **Graph use.** All graph tool calls below MUST follow the **Graph navigation discipline** templated into your CODE GRAPH CONTEXT block (lean parameters, drill-in caps, forbidden tools). The steps below specialise _which_ lean tools to use for each question — never override the defaults.

## Step 1: Cheap orientation via graph

Call `get_minimal_context` with `task: "Map service boundaries and the architectural shape"`. The response (~100 tokens) gives you top communities, top flows, risk, and suggested next tools. Use it to seed your service inventory.

## Step 2: Service inventory via communities

Call `list_communities` with `detail_level: "minimal", min_size: 10, sort_by: "size"`. Each entry becomes a candidate service. Record `name`, `size`, `cohesion`, `dominant_language`. Do NOT pass `detail_level: "standard"` — it returns full member lists per community and overflows.

For up to **8** of the largest/highest-cohesion communities, call `get_community({ community_id, include_members: false })` to get language tags, file count, and the description. Do NOT request `include_members: true` here.

### Entry-point extraction (per-service, language-agnostic)

Every service entry MUST carry an `entry_points: string[]` field with 1–3 representative file paths (relative to the service `path`). This is what downstream consumers (Phase 3 synthesis, the LLM wiki) cite when describing the service.

The graph is language-agnostic — use it. Do NOT hard-code naming conventions per language; do not Glob `main.{ts,py,go,…}`. Pick the cheapest of these in order:

1. **Cheap path (small community, size ≤ 30):** call `get_community({ community_id, include_members: true })` and pick the top 1–3 file nodes whose names match the service's most-imported-from / most-referenced surface. Sentinel filenames the agent may recognize across stacks include but are NOT limited to: `main.*`, `index.*`, `app.*`, `server.*`, `program.*`, `bootstrap.*`, `start.*`, `__init__.*`, `Application.*`, `Startup.*`, `Run.*`. If none of those exist, prefer the file with the highest inbound-edge count.

2. **Medium path (community 30–200 members):** call `query_graph_tool({ pattern: "file_summary", target: <community-name>, detail_level: "minimal" })` and inspect the returned file summary for the top 1–3 files by inbound edges. If the tool does not support `pattern: "file_summary"` on this graph, fall through to (3).

3. **Fallback path (community > 200 members or graph returns no useful surface):** call `semantic_search_nodes_tool({ kind: "File", limit: 20 })` filtered to the service path; pick 1–3 with the most inbound dependencies.

4. **Last resort:** leave `entry_points: []` AND add a `needs_verification` item explaining that the graph could not surface entry points for this service. Do not fabricate filenames.

Stack-agnostic guarantee: every step above works for any language `code-review-graph` parses (TypeScript, JavaScript, Python, Go, Java, C#, PHP, Ruby, Rust, Kotlin, Swift, etc.). Do NOT add language-specific Glob patterns — the graph already knows.

For ≤ **3** communities whose role is genuinely ambiguous (you cannot tell from the name and description whether it's a service or a leaf package), call `get_community({ community_id, include_members: true })`. The same member list also feeds the entry-point extraction above for those communities.

Record per service:

- service id (use the community name as a stable id)
- file count (size from the community payload)
- languages (`dominant_language` plus language tags when drilled in)
- **entry points** (1–3 representative file paths from the procedure above; empty array + `needs_verification` only as last resort)

## Step 3: Architectural topology via hubs and bridges

Call `get_hub_nodes({ top_n: 10 })` and `get_bridge_nodes({ top_n: 10 })` for cross-community topology. Hub nodes are the most-connected nodes in the graph; bridge nodes sit on shortest paths between many communities.

**MANDATORY OUTPUT**: surface `findings.architecture.coupling = { hubs: [...], bridges: [...] }`. Each entry is `{ qualified_name, kind, score }` — `qualified_name` is required, `kind` and `score` are optional. Aim for **3+ entries** per list (drawn from the graph's top results). When the graph genuinely has fewer (tiny project), emit what's available and surface a `needs_verification` item — do NOT fabricate. Fields are graph-native and stack-agnostic.

The combination above (`get_minimal_context` + `list_communities` minimal + selective `get_community` + `get_hub_nodes` + `get_bridge_nodes`) is information-equivalent to `get_architecture_overview` (which the discipline forbids) and bounded.

## Manifest fallback (only when the graph is empty)

If Step 1 returned 0 communities — only then fall back to Glob `**/package.json`, `**/pyproject.toml`, `**/go.mod`, `**/Cargo.toml`, `**/pom.xml`, `**/build.gradle*`, `**/Gemfile`, `**/composer.json`, `**/*.csproj`, `**/mix.exs`, `**/pubspec.yaml`. Read the minimum needed to fill the gap.

Each manifest file represents a potential service or package. Read each one to extract metadata.

## Step 4: Detect All Languages in Repository

<multi_language_detection>

Community language tags from Steps 1–2 are the source of truth. Aggregate them into `findings.languages` (each language with ≥5 files). Skip to Step 5 — no extension table needed.

Only when the graph returned 0 communities (true empty-graph fallback): use Glob with narrow service-scoped patterns and let the file extension drive the language label (parser-canonical names: `typescript`, `python`, `go`, `java`, `kotlin`, `ruby`, `php`, `csharp`, `swift`, `elixir`, `rust`, `dart`, `c`, `cpp`, `shell`, …). Do NOT raw-`find .` — service-scoped patterns only.

</multi_language_detection>

## Step 5: Determine Repository Type

<repository_detection>

The architecture overview from Step 2 should answer this. If the graph returned a clear topology (monorepo / single-service / microservices), use it directly.

Only fall back to workspace-file analysis when the graph returned no topology:

**Monorepo indicators:**

- JavaScript/TypeScript: `workspaces` field in package.json, lerna.json, pnpm-workspace.yaml, nx.json, turbo.json
- Python: Multiple pyproject.toml/setup.py in subdirectories
- Go: go.work file (Go workspaces)
- Rust: `[workspace]` section in root Cargo.toml
- Java: Parent pom.xml with `<modules>`, or settings.gradle with `include`
- Ruby: Multiple Gemfile files in subdirectories
- PHP: Multiple composer.json files

**Single-service:** One manifest at root, no workspace configuration
**Polyrepo:** Each service in separate repository (rare in codebase analysis)

If monorepo detected, list ALL packages/services with their relative paths.

</repository_detection>

## Step 6: Detect Runtime Versions

<runtime_detection>

ONE multi-pattern Glob, then ≤2 reads:

```
**/{.nvmrc,.node-version,.python-version,runtime.txt,.go-version,go.mod,.ruby-version,.tool-versions,rust-toolchain.toml,Cargo.toml,.java-version,.tool-versions,mix.exs,pubspec.yaml}
```

Read the matched files (cap: 2). Parse the canonical version field for each language family — these files all carry a single value or directive (e.g., `.nvmrc` content, `go.mod` `go` directive, `pyproject.toml` `requires-python`, `Cargo.toml` `edition`, `pom.xml` `java.version`, `.ruby-version` content). On a polyglot monorepo with mixed versions, aggregate as `"varies by service"`.

**Report in `findings.runtimes`** (object keyed by canonical runtime name; values are version strings or constraints).

</runtime_detection>

## Step 7: Extract Service Information

For each service discovered via the graph (or manifests in fallback), record:

<service_metadata>

**Identity:**

- id: Short identifier (e.g., "api", "web", "worker") — use community name from Step 1 as the stable id
- name: Human-readable name from manifest (if present)
- path: Relative path from repository root to service directory

**Language & Version:**

- Primary language from community language tags (or inferred from manifest type)
- Version constraints from runtime version files

**Frameworks (from graph payload or manifest dependencies):**

- Main framework: Express, NestJS, Fastify (Node); Django, Flask, FastAPI (Python); Gin, Echo, Chi (Go); Axum, Rocket, Actix (Rust); Spring Boot (Java); Rails, Sinatra (Ruby)
- ORM/Database: TypeORM, Prisma, Sequelize (Node); SQLAlchemy, Django ORM (Python); GORM (Go); Diesel (Rust); Hibernate, JPA (Java); ActiveRecord (Ruby)

**Service Type (infer from graph community type or dependencies and structure):**

- backend: HTTP framework dependencies
- frontend: UI framework dependencies
- serverless: Serverless framework, AWS Lambda packages
- worker: Background job libraries
- library: No server dependencies, reusable modules
- cli: CLI framework dependencies
- mobile: React Native, Flutter
- desktop: Electron, Tauri

</service_metadata>

## Step 8: Architecture Patterns via graph

The hub/bridge findings from Step 3 plus the community shapes from Step 2 should already describe the top-level pattern. Use them directly.

Only examine source directory structure manually when the graph returned no pattern information:

**Common Patterns to Identify:**

1. **MVC (Model-View-Controller):** Separate directories for models/, views/, controllers/
2. **Vertical Slicing:** Feature-based directories (users/, orders/, payments/)
3. **Hexagonal/Clean:** Core domain separated from adapters (domain/, infrastructure/, application/)
4. **DDD (Domain-Driven Design):** Bounded contexts, aggregates, entities, value objects
5. **Flat:** All files in one directory or minimal nesting

## Step 9: File-placement table via graph

Call `query_graph({ pattern: "files_in", target: "<community>", detail_level: "minimal" })` per service from Step 2 (top ~5 services, drill-in budget). Build a 10–20 row markdown table from the edge results: columns are `Package/Service | File Type | Location Pattern | File Count | Notes`. Group by service for monorepos; include both standard and custom locations; use representative paths only when the pattern alone is ambiguous.

Report `findings.file_placement` with `table_markdown`, `shared_packages` (array of relative paths), and `import_conventions` (array of representative import strings the agent observed in the graph).

## Step 10: Extract Path Aliases (graph cannot answer — single targeted Read)

<path_aliases>

Path aliases live in build config the graph does not index. Read **the build config the detected language uses** (one file per service, not an enumeration):

- the language's primary build/compile config (e.g. tsconfig/jsconfig, pyproject, go.mod, pom.xml/build.gradle, Cargo.toml, composer.json, _.csproj/_.fsproj, build.sbt, mix.exs, pubspec.yaml). Look for the alias / module-path / source-set field appropriate to that tool.
- one bundler config when one is present (vite/webpack/esbuild/rollup/parcel for JS-ish; build-tool-specific for others).

Cap: 2 reads per service. Skip services whose build config does not declare aliases.

**Report in `findings.path_aliases` object** (alias → resolved path). Empty object when no aliases are declared.

</path_aliases>

## Step 11: Analyze Database Layer

<database_layer>

Surface the database engine, ORM/data-access layer, and migration commands. The tech-stack analyzer is the source of truth for dependency tags — defer to its findings via the consolidator. In this analyzer:

- detect the **engine** by name token in any service's manifest dependencies (postgres / mysql / mongodb / redis / sqlite / dynamodb / elasticsearch / clickhouse / cassandra / cockroach / …) using ONE `semantic_search_nodes_tool` call per credible candidate.
- detect the **ORM / data-access layer** from class/file naming in the graph (semantic_search by name pattern). Common patterns across stacks: entity decorators / annotations, schema files, model base classes, query builders, migration directories. Stack-agnostic — name tokens, not parser tricks.
- detect **migration commands** by reading the build-tool's script section (`scripts` in package.json, `[tool.poetry.scripts]` in pyproject, Makefile targets, `tasks` in build.gradle, etc.) — ONE read per service.

**Report in `findings.database` object** with `type`, `orm`, and `migration_commands` (array; empty when none found).

</database_layer>

## Step 12: Enhance Services with File Counts

**IMPORTANT: You are the SINGLE SOURCE OF TRUTH for service discovery.**

Other analyzers (Tech Stack, Code Patterns, Data Flows) will reference services by ID. Ensure each service has a unique, stable ID (use community names from Step 1).

For each service, set `file_count` from the graph community's member count. If the community payload omits the count for a given service, surface a `needs_verification` item naming the service — do NOT shell out to a filesystem-walking command. Filesystem enumeration cannot replicate community membership and produces brittle, language-tied output the synthesizer cannot reconcile with the graph topology.

**NOTE:** Do NOT create separate `packages` or `multi_stack` sections. All service information belongs in the `services` array.

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

Before outputting results, verify:

1. **Called `get_minimal_context` first?** It must be the first graph call — ~100 tokens, gives you the map. If you skipped it, you almost certainly over-pulled later.
2. **Used lean parameters everywhere?** `list_communities` with `detail_level: "minimal"`, `get_community` with `include_members: false` by default. (The discipline already forbids `get_architecture_overview` — see §3 of the navigation discipline.)
3. **Found at least ONE service?** If graph returned 0 communities AND manifest fallback found nothing, search again
4. **Detected ALL languages?** Community language tags should cover this; supplement with file-count fallback only for communities with ambiguous language data
5. **Extracted runtime versions?** Check for .nvmrc, .python-version, go.mod, etc. (graph cannot answer this)
6. **File placement table has 10-20 rows?** Use graph edge results first; supplement with Glob only for gaps
7. **Found path aliases?** Read tsconfig.json, jsconfig.json, vite.config, webpack.config (graph cannot answer this)
8. **Detected database layer?** Check dependencies for pg, psycopg2, mongoose, etc. Find ORM and migration commands
9. **Marked as monorepo?** Verify ALL workspaces are listed (cross-check workspace config against found manifests)

## When Discovery Seems Incomplete

If graph communities are empty but code clearly exists:

- Re-run Step 1 (`get_minimal_context`) — a transient first-call race may have aborted the prior attempt. Then re-run Step 2.
- If the graph is genuinely empty, fall back to manifest discovery via the multi-pattern Glob from Step 6.
- Read manifest files to surface custom layouts the graph could not parse.

</critical_thinking>

<output_format>

See shared output format documentation at: `../../../shared/prompts/output-format.md`

## Key Points

- Output raw JSON only (no markdown code blocks, no commentary)
- First character: `{`, last character: `}`
- Required field: `findings.services` array with at least 1 service
- Each service must have `id`, `path`, `type`, `language` fields
- Optional field: `needs_verification` array (maximum 5 items)
- Required field: `graph_queries_used` — set to `[]`. The framework derives the real list from your transcript.

## Example Output Shape (language-neutral skeleton)

```json
{
  "agent_name": "structure-architecture-analyzer",
  "timestamp": "<ISO-8601>",
  "findings": {
    "services": [
      {
        "id": "<community-name>",
        "path": "<relative-path>",
        "type": "<backend|frontend|library|worker|cli|serverless|mobile|desktop>",
        "language": "<canonical-language>",
        "language_version": "<version-or-constraint>",
        "file_count": 0,
        "frameworks": { "main": "<framework + version>" },
        "manifest_file": "<relative-path-to-manifest>",
        "entry_points": ["<relative-path>"]
      }
    ],
    "repository_type": "<monorepo|single-service|polyrepo>",
    "monorepo_layout": {
      "root": ".",
      "workspace_tool": "<canonical>",
      "workspace_paths": ["<glob>"]
    },
    "languages": ["<canonical>"],
    "runtimes": { "<runtime>": "<version-or-constraint>" },
    "frameworks": { "main": "<framework + version>" },
    "architecture_pattern": "<MVC|Vertical Slicing|Hexagonal|DDD|Flat>",
    "file_placement": {
      "table_markdown": "| Service | File Type | Location Pattern | File Count | Notes |\n|---|---|---|---|---|\n| ...",
      "shared_packages": ["<relative-path>"],
      "import_conventions": ["<representative-import-string>"]
    },
    "path_aliases": { "<alias>": "<resolved-path>" },
    "database": {
      "type": "<engine>",
      "orm": "<orm-name + version>",
      "migration_commands": ["<command>"]
    }
  },
  "graph_queries_used": [],
  "needs_verification": []
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `../../../shared/prompts/verification-format.md`

Use `needs_verification` ONLY when information cannot be determined from code, configs, or manifests after exhaustive searching.

Maximum 5 verification items. Prioritize business decisions and deployment architecture questions over technical details discoverable from code.

</verification_guidelines>

## Token efficiency

Graph queries are O(1) on warm cache (the graph is built once per init). Glob+Read scales with file count. For projects with thousands of files, the difference is 10–100×. Use the graph.
