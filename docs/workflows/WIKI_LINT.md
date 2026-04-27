# wiki-lint Workflow

Structural and semantic validation of `docs/llm-wiki/wiki/`.

**Version**: 1.0.0
**Skill file**: `skills/030-quality-assurance/wiki-lint/SKILL.claude.md` / `SKILL.codex.md`
**CLI**: `scripts/lint-wiki.sh` / `pnpm --filter orchestration lint-wiki`
**Service**: `orchestration/src/services/graph-wiki/wiki-lint.service.ts`

---

## Architecture

The lint service is a pure TypeScript function — no LangGraph graph, no subprocess. It is called:

- By the `run_lint` node of the `wiki-refresh` graph (automatic)
- By the `lint-wiki` CLI / skill (manual)

Entry point:

```typescript
lintLlmWiki(opts: {
  projectPath: string;
  graphDbPath: string;
  changedPages?: string[];
}): Promise<LintReport>
```

---

## Report Types

```typescript
interface LintReport {
  structural: LintViolation[];
  semantic: LintViolation[];
  stats: { pages_scanned: number; duration_ms: number };
}

interface LintViolation {
  page: string;          // wiki-relative path
  rule: string;          // rule name (camelCase)
  severity: 'fail' | 'warn';
  message: string;
  evidence?: string;     // file path or symbol name that triggered the rule
}
```

---

## Structural Checks (severity: fail)

Exit code 1 when any of these fire. They represent facts about the wiki that are objectively wrong.

| Rule | Implementation |
|------|---------------|
| `brokenWikilinks` | Parse every `[text](path)` in `wiki/**/*.md`; resolve relative to the page; assert `existsSync` |
| `deadSources` | Parse `sources[].path` from YAML frontmatter; assert each exists under project root or `raw/` |
| `missingFrontmatter` | Assert every page has `document_type`, `graph_version`, `generated_at`, `summary`, `sources`, `confidence` |
| `legacy-raw-source` | Assert no `sources[].path` points under `docs/llm-wiki/raw/analyzers/` or `docs/llm-wiki/raw/graph-stats/` — those subdirs were removed. Phase 1 analyzer outputs live in `.claude-temp/initialize-project/phase1-outputs/`; graph stats live in `.state.json`. Valid `raw/` subdirs are `snapshots/` and `external/` only. Example violation: a page citing `docs/llm-wiki/raw/analyzers/01-structure-architecture.json` as a source. |
| `graphVersionMismatch` | Assert each page's `graph_version` equals `sha256(<projectPath>/.code-review-graph/graph.db)`. **Severity: warn** — expected between builds |
| `graphCommitMismatch` | Assert each page's `graph_commit` equals `git rev-parse HEAD`. **Severity: warn** — expected between builds |

`graphVersionMismatch` and `graphCommitMismatch` use `'warn'` severity despite being in the structural group; they appear in the Structural section of the Markdown report to signal "run `/wiki-refresh`" rather than "manual fix required".

---

## Semantic Checks (severity: warn)

Never affect exit code. Surface advisory information for maintainers.

| Rule | Implementation |
|------|---------------|
| `orphans` | Pages with zero inbound wikilinks (`[text](this-page)` in any other page) AND absent from `wiki/index.md` navigation list |
| `staleClaims` | Pages where `max(sources[].ingested_at) < HEAD - 90 days` AND any of those source paths have a newer commit than `ingested_at` |
| `dispatchBlind` | For each `` `SymbolName` `` extracted from page body: if `mcp__code_graph__query_graph_tool({pattern: "callers_of", target: symbol})` returns 0 callers AND `rg` finds ≥3 lexical matches, emit a warning. Skipped when MCP server unavailable. |
| `contradictions` | LLM-assisted factual conflict scan across `changedPages` + their 1-hop backlinks. Skipped when `changedPages` is empty or `claude` CLI is absent. |

---

## Output Format

### JSON (`wiki-lint-report.json`)

```json
{
  "structural": [
    {
      "page": "wiki/ARCHITECTURE.md",
      "rule": "brokenWikilinks",
      "severity": "fail",
      "message": "link points to wiki/services/auth-v2.md which does not exist",
      "evidence": "wiki/services/auth-v2.md"
    }
  ],
  "semantic": [],
  "stats": {
    "pages_scanned": 14,
    "duration_ms": 820
  }
}
```

### Markdown (`wiki-lint-report.md`)

```markdown
## Structural (fail)

| Page | Rule | Message |
|------|------|---------|
| wiki/ARCHITECTURE.md | brokenWikilinks | link points to ... |

## Semantic (warn)

*(none)*

## Stats

- Pages scanned: 14
- Duration: 820ms
```

---

## Exit Codes

| Code | Condition |
|------|-----------|
| `0` | All structural checks passed |
| `1` | One or more structural checks have `severity: fail` |

Semantic warnings never affect the exit code.

---

## CLI Flags

```bash
scripts/lint-wiki.sh \
  --project-path <abs-path>      # required
  --skip-semantic                # omit semantic checks
  --changed-pages <paths>        # comma-separated; scopes contradiction check
  --artifacts-dir <abs-path>     # default: .claude-temp/tickets/<id>/artifacts/lint/
```

---

## Skill Invocation

| Provider | Command |
|----------|---------|
| Claude Code | `/wiki-lint [--skip-semantic] [--changed-pages <paths>] [--artifacts-dir <path>]` |
| Codex CLI | `$wiki-lint [--skip-semantic] [--changed-pages <paths>] [--artifacts-dir <path>]` |

---

## Integration with wiki-refresh

The `run_lint` node in the `wiki-refresh` graph calls `lintLlmWiki()` after all pages are written. The `update_state` node reads the result and only bumps `.state.json.last_indexed_commit` when `lint_report.structural` contains zero `fail`-severity violations.

---

**See also**:
- `skills/030-quality-assurance/wiki-lint/SKILL.claude.md`
- `orchestration/src/services/graph-wiki/wiki-lint.service.ts`
- [WIKI_REFRESH.md](WIKI_REFRESH.md)
