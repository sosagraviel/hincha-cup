# `.claude/` and `.codex/` Directory Layout

How the per-project provider configs are organised, who writes each file, and how we guarantee none of them carry absolute filesystem paths.

---

## Single-init model

`<project>/.claude/` (or `.codex/`) is **generated, then committed to the project's repository.** Exactly one developer runs `initialize-project` per target repo; the rest of the team consumes the resulting tree. Every other developer's `pwd` is different from the initialiser's, so any absolute path that leaks into a committed file silently breaks for everyone but the author.

This is the load-bearing constraint behind every other rule on this page: **no file we write may contain `/Users/<name>/…` or `/home/<name>/…`.** Symlinks are forbidden too — they point at filesystems that exist on one developer's machine.

---

## Canonical layout

```
<project>/
├── .claude/                          # Claude provider — committed
│   ├── CLAUDE.md                     # Generated quick-reference (Phase 4)
│   ├── framework-config.json         # Generated config registry (Phase 4)
│   ├── settings.json                 # Shareable permissions — committed
│   ├── settings.local.json           # Per-developer overrides — gitignored
│   ├── skills/                       # Synced from framework + per-stack overlays
│   ├── agents/                       # Synced agent templates
│   └── mcp.json                      # Per-spawn MCP config (transient)
│
├── .codex/                           # Codex provider — committed (when --provider codex)
│   ├── AGENTS.md                     # Codex's CLAUDE.md equivalent
│   ├── config.toml                   # Auto-discovered MCP server config
│   ├── prompts/                      # Skill bodies expressed as Codex prompts
│   └── … (mirrored from .claude/ shape)
│
├── .mcp.json                         # Project-level Claude MCP config (gitignored; preflight writes local copy)
├── .code-review-graph/               # Graph DB + launcher metadata
│   ├── .gitignore                    # Framework allowlist (committed) — overrides tool's `*`
│   ├── graph.db                      # SQLite graph (gitignored — per-developer)
│   ├── code-review-graph             # Wrapper script (gitignored)
│   ├── launcher.json                 # Install resolution metadata (gitignored)
│   └── extraction-manifest.json      # Freshness signal (gitignored)
└── .code-review-graphignore          # Seeded from templates/code-review-graphignore (committed)
```

### Per-file table

| File | Source of truth | Who writes it | Committed? |
|---|---|---|---|
| `.claude/CLAUDE.md` | Phase 4 synthesis | `synthesis-extractor.ts` → `PortableWriter.writeMarkdown` | yes |
| `.claude/framework-config.json` | Phase 4 generator | `phase4/config-generator.ts` → `PortableWriter.writeJson` | yes |
| `.claude/skills/**` | `<framework>/skills/` + stack overlays | `phase5` resource sync | yes |
| `.claude/agents/**` | `<framework>/orchestration/templates/agents/` | `phase5/agent-generator.ts` → `PortableWriter.writeMarkdown` | yes |
| `.claude/settings.json` | Manually curated, shareable | Developer commits | yes |
| `.claude/settings.local.json` | Per-developer | Claude CLI writes auto-saves here | **no** (gitignored) |
| `.claude/mcp.json` | Per-spawn | Agent factory writes for one analyzer call | no (transient, gitignored) |
| `.mcp.json` (Claude) | Skill preflight (`ensure-context.sh`) | `upsertCodeGraphMcpConfig` and the bash MCP-config writer in `ensure-context.sh` | **no** (gitignored — re-emitted locally on every preflight) |
| `.codex/config.toml` (Codex) | Manually curated + skill preflight | Developer commits the rest; `[mcp_servers.code_graph]` block is stripped by Phase 6 housekeeping and re-emitted locally by `ensure-context.sh` | yes (without the code_graph block) |
| `.code-review-graph/graph.db` | `setup-code-graph.sh` + `code-review-graph build` | The graph SQLite DB (binary, embeds absolute paths) | **no** (per-developer; rebuilt by preflight) |
| `.code-review-graph/launcher.json` | `setup-code-graph.sh` | Per-developer install resolution metadata | **no** (gitignored) |
| `.code-review-graph/extraction-manifest.json` | `code-review-graph build/update` | Per-developer freshness signal (sha + tool_version) | **no** (gitignored) |
| `.code-review-graph/.gitignore` | `templates/code-review-graph-gitignore` | Framework allowlist (overrides upstream tool's `*` to permit metadata files) | yes |
| `.code-review-graphignore` | `templates/code-review-graphignore` | Seeded by `setup-code-graph.sh` if missing; editable by the project | yes |

`framework-config.json` no longer carries `project_metadata.project_path`. It was an absolute path in a committed file and nothing read it.

`.code-review-graph/` commit policy: **only the lightweight metadata is committed; the graph DB is per-developer.** A teammate cloning the project gets the framework allowlist and the project's `.code-review-graphignore`, then the skill preflight (`ensure-context.sh`) builds their local `graph.db` (~4 s on a small repo) and writes their local `launcher.json` + `extraction-manifest.json`. No manual setup.

---

## Settings split

`.claude/settings.json` is committed; it carries the team-wide permission allowlist (e.g. `mcp__atlassian__*` tools). `.claude/settings.local.json` is gitignored and holds per-developer preferences that the Claude CLI auto-saves (recent commands, etc.). The split exists because Claude CLI's auto-saves *will* write absolute paths into whichever settings file it picks; isolating those writes to `.local.json` keeps the committed `settings.json` clean.

If you find a path leak in `settings.local.json`: that is fine, `settings.local.json` is gitignored. If you find one in `settings.json`: that is a bug — investigate which workflow wrote it and route the write through `PortableWriter`.

---

## The four-layer portability guarantee

Every byte that lands in `.claude/` or `.codex/` flows through these layers, in order:

1. **Compile-time (branded types).** `services/framework/portable-paths/types.ts` defines `AbsolutePath` and `ProjectRelativePath` as branded TypeScript types. A function that takes `ProjectRelativePath` will not accept a raw string at compile time.

2. **Parse-time (Zod refinement).** `schemas/portable-string.schema.ts` carries a refinement that rejects strings matching the non-portable absolute-path pattern. Schemas that flow through Zod parse (e.g. payloads from agent outputs) cannot land a leaked path in workflow state.

3. **Write-time (`PortableWriter`).** Every generator that touches `.claude/` or `.codex/` calls `PortableWriter.writeJson` / `writeMarkdown` / `copyPortable` (`services/framework/portable-paths/portable-writer.service.ts`). The writer rejects strings containing the non-portable pattern with a `PortabilityError` *before* the file hits disk. This is the chokepoint: there is no other supported way to write into the provider config dirs.

4. **Run-time (Phase 6 validator).** `nodes/initialize-project/phase6/helpers/portability-validator.ts` walks `<project>/.claude/` and `<project>/.codex/` after generation and scans every committed text file for `/Users/<name>/…` or `/home/<name>/…`. If any match remains the workflow run reports `current_phase: failed`, even if every earlier phase succeeded. This is the safety net for any future generator that might slip past the writer.

The pattern intentionally has redundancy — a violation has to slip past compile-time *and* parse-time *and* the writer chokepoint *and* the runtime walker before it lands in a committed file.

### Allowlist

The runtime validator allows:

- `/tmp/…` paths (POSIX-standard).
- URLs (the pattern is bounded so `https://example.com/Users/…` does not trip).
- Content between `<!-- portable-example-start -->` and `<!-- portable-example-end -->` fences in markdown — for docs that need to *show* an absolute path as an example.

The Zod and writer layers use the same regex (`PortablePathResolver.isNonPortable`) so the allowlists do not drift.

---

## Debugging a Phase 6 portability failure

When `validatePortability` reports `ok: false`, the workflow logs the violations as:

```
[validate] non-portable: .claude/skills/foo/SKILL.md:42  /Users/alice/repo/...
```

Resolution path:

1. **Open the offending file at the listed line.** Confirm the violation visually — sometimes the regex catches false positives (rare; see allowlist above).
2. **Track which generator wrote it.** Each writer in `phase4/` and `phase5/` is the only legitimate writer for its file type. `git log -p -- <path>` plus the recent run's `.claude-temp/` artifacts narrow it down.
3. **Decide: relative path or `/tmp/`?** If the content is documenting a runtime path, `/tmp/<something>` is the conventional escape hatch. If it's referencing a project file, render it as a project-relative path via `PortablePathResolver.toProjectRelative(absolutePath, projectPath)`.
4. **Route through `PortableWriter`.** If the offending generator was using a raw `fs.writeFileSync`, replace it with `PortableWriter.writeJson` / `writeMarkdown`. This is also the fix for "the writer rejects my legitimate string" — sometimes the right answer is to fix the input upstream rather than appease the writer.

For a quick local sweep without running the full workflow:

```bash
grep -rE '/Users/[a-z]+/|/home/[a-z]+/' \
  <project>/.claude <project>/.codex \
  --include='*.md' --include='*.json' --include='*.toml'
```

Same regex spirit as the validator (the validator's pattern is more conservative around word boundaries; this is a quick smoke).

---

## Related code

| Concern | File |
|---|---|
| Branded types | `orchestration/src/services/framework/portable-paths/types.ts` |
| Path resolver / regex | `orchestration/src/services/framework/portable-paths/path-resolver.service.ts` |
| Writer chokepoint | `orchestration/src/services/framework/portable-paths/portable-writer.service.ts` |
| Zod refinement | `orchestration/src/schemas/portable-string.schema.ts` |
| Runtime validator | `orchestration/src/nodes/initialize-project/phase6/helpers/portability-validator.ts` |
| Provider config dirs helper | `orchestration/src/utils/provider-paths.ts` |
| `framework-config.json` schema | `orchestration/src/schemas/framework-config.schema.ts` |

---

## LLM-wiki frontmatter contract

Every file under `<project>/docs/llm-wiki/wiki/` carries the same provenance frontmatter so the wiki linter, the index summary catalog, and downstream agents can rely on a stable contract. This block lives here (developer documentation) rather than inside the wiki's own router doc, which is capped at ~150 lines for runtime use.

```yaml
document_type: <architecture|data-flow|pattern|service|services|index|schema>
summary: <single line, <=160 chars, load-bearing for retrieval>
confidence: <high|medium|low>
generated_at: <iso>
generated_by: ai-agentic-framework
graph_version: <sha256 of .code-review-graph/graph.db>
graph_commit: <git sha at build time>
graph_queries_used: [<mcp__code_graph__... names — Phase 1 analyzer queries, not wiki-gen>]
sources:
  - { path: <relative-to-project-root>, sha256: <hash>, ingested_at: <iso>, commit: <git sha> }
related: [<wiki-relative-paths>]
last_verified: <iso>
tags: [<curated, ~5 max — bound vocabulary from analyzer findings>]
# service docs only:
service_id: <id from stack profile>
entry_points: [<paths>]
dependencies: { production: [...], development: [...] }
community_id: <graph community id, when known>
```

Lint policy:

- **Structural (fail PR):** broken wikilinks; `sources[]` pointing to non-existent paths; missing required frontmatter keys; `graph_version` mismatch with current `.code-review-graph/graph.db`.
- **Semantic (warn):** orphan pages; stale claims; LLM-detected contradictions across changed-set + 1-hop.

The `tags:` field is consumed by `wiki/index.md`'s summary catalog so Tier 1 retrieval is a single read; keep the vocabulary curated.

---

## Portability conventions for skill / framework documentation

The Phase 6 portability validator (`portability-validator.ts`) refuses any committed text file under `<project>/.claude/` or `<project>/.codex/` whose body contains `/Users/<name>/...` or `/home/<name>/...`. The intent is that anything we ship to thousands of developer machines must be portable by construction.

### Two ways to keep skill docs portable

1. **Use `~/`-style placeholders.** `~/projects/myapp` reads identically to `/Users/you/projects/myapp` and the validator does not match it. Default for prose-style examples.
2. **Wrap genuine "absolute path tutorials" in fences.** Some references (Claude permissions syntax, AWS bastion paths, etc.) *teach* the absolute-path form. For those, use the existing fence the validator honours:

   ```html
   <!-- portable-example-start -->
   ```json
   {
     "allow": ["Read(//Users/username/project/**)"]
   }
   ```
   <!-- portable-example-end -->
   ```

   Everything between the two HTML comments is excluded from the regex sweep. Fence boundaries are line-anchored, so wrap the whole code block (or the surrounding markdown stanza), not individual characters.

A unit test (`test/unit/skills/skill-portability.test.ts`) walks `<framework>/skills/**` with the same regex and the same fence-stripper as the runtime validator, so a new contribution that forgets either convention fails CI before it ships.

### `framework-config.json` field allowlist

The current writer never emits `project_metadata.project_path`; the field is runtime-derivable. Pre-existing files from older runs may still carry it, so Phase 6 housekeeping strips it before the portability scan runs (logging `[portability] stripped stale project_path field from …`). Other `project_metadata` fields (`initialization_hash`, `last_analysis`) are preserved.

If a future field needs the same treatment, add it to `stripStaleFrameworkConfigFields` in `portability-validator.ts` — surgical strips only, never a wholesale rewrite.
