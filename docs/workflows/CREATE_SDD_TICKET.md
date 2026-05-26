# create-sdd-ticket Workflow

Generates comprehensive, gap-free tickets following Specification-Driven Development (SDD) principles.

**Version**: 3.1.0
**File**: `skills/020-development-workflow/create-sdd-ticket/SKILL.md`

---

## Key Principles

### 1. Specification-Driven Development
- Gap-free specifications
- Implementation-ready format
- BDD scenarios define success
- Deep codebase inference before asking questions

### 2. INVEST Criteria
- **I**ndependent - No blocking dependencies
- **N**egotiable - Flexible implementation
- **V**aluable - Delivers user value
- **E**stimable - Clear enough to estimate
- **S**mall - 1-3 days completable
- **T**estable - Clear acceptance criteria

### 3. Minimal Engineer Interruption
Performs wiki-first inference before touching the codebase:
1. LLM wiki (`docs/llm-wiki/wiki/`) — pre-digested architecture, service contracts, patterns
2. Code graph — symbol lookups, community membership, callers
3. Project context skill and `CLAUDE.md`/`AGENTS.md`
4. Codebase grep + file inspection (narrowed by graph)
5. Engineer questions — only for gaps 1–4 cannot resolve

---

## Input/Output Modes

### Input Modes

| Mode | Flag | Example |
|------|------|---------|
| Text | `--from-input "text"` | `--from-input "Add JWT auth"` |
| Jira | `--from-jira KEY` | `--from-jira "PROJ-123"` |
| Markdown | `--from-markdown PATH` | `--from-markdown "./draft.md"` |

### Output Modes

| Mode | Flag | Example |
|------|------|---------|
| Markdown | `--save-to-markdown PATH` | `--save-to-markdown "./spec.md"` |
| Jira | `--save-to-jira URL` | `--save-to-jira "<board-url>"` |
| Display | _(none)_ | Preview only |

### Invoking the Skill

| Provider     | Invoke                | List active skills |
| ------------ | --------------------- | ------------------ |
| Claude Code  | `/create-sdd-ticket`  | Auto-discovered    |
| Codex CLI    | `$create-sdd-ticket`  | `/skills`          |

### Common Usage

```bash
# Claude Code — Text → Markdown (most common)
/create-sdd-ticket --from-input "Add user profile page" --save-to-markdown "./specs/PROF-001.md"
# Enhance Jira ticket
/create-sdd-ticket --from-jira "PROJ-123" --save-to-jira "<board-url>"
# Complete draft
/create-sdd-ticket --from-markdown "./draft.md" --save-to-markdown "./final.md"
# Preview only
/create-sdd-ticket --from-input "Add real-time notifications"

# Codex CLI — same flags, '$' prefix
$create-sdd-ticket --from-input "Add user profile page" --save-to-markdown "./specs/PROF-001.md"
$create-sdd-ticket --from-jira "PROJ-123" --save-to-jira "<board-url>"
$create-sdd-ticket --from-markdown "./draft.md" --save-to-markdown "./final.md"
$create-sdd-ticket --from-input "Add real-time notifications"
```

---

## Workflow (9 Phases)

0. **Preflight (MANDATORY)** - Run `bash $FRAMEWORK_PATH/scripts/ensure-context.sh`. Auto-installs `uv`/`uvx`/`code-review-graph` if missing, builds or incrementally updates the graph, refreshes the wiki when stale, re-emits the local MCP config, and writes a `.preflight-ok` marker. Hot path: <3 s. STOPs on non-zero exit; do NOT continue to later phases.
0.1. **Inject Project Context** - Load project-context skill and `CLAUDE.md`/`AGENTS.md`
0.2. **Wiki & Graph Context Preload** - Read `docs/llm-wiki/wiki/` core docs; run one `get_minimal_context_tool` call; persist context artifact. Graceful fallback when wiki is missing (fresh clone, `/initialize-project` not yet run). Pass `--skip-wiki` to bypass explicitly.
1. **Parse Input** - Load from text, Jira, or markdown
2. **Intelligent Gap Detection** - Consult wiki first, then graph, then project-context, then codebase grep, then ask you
3. **Batch Questions** - Ask remaining questions in one batch (minimized by phases 0.2 and 2)
4. **Process Answers** - Fill gaps and re-validate completeness
5. **SDD Template** - Format with user stories and BDD scenarios; include `wikiEvidence` and `graphEvidence` in `technicalContext`
6. **INVEST Validation** - Ensure quality criteria met
7. **Output Formatting** - Save to markdown or Jira

**Why Phase 0 matters**: clarifying questions and BDD scenarios are grounded in the project's actual conventions, not generic best-practice guesses. The skill won't ask "should errors return 4xx or problem-details?" if the codebase already establishes that convention.

---

## Canonical Schema

```json
{
  "id": "PROJ-123",
  "title": "Add user authentication with JWT",
  "userStory": {
    "asA": "registered user",
    "iWantTo": "log in securely",
    "soThat": "I can access protected features"
  },
  "acceptanceCriteria": [
    {
      "scenario": "Successful login",
      "given": "valid credentials",
      "when": "submit login form",
      "then": "receive JWT token"
    }
  ],
  "technicalContext": {
    "architecture": "Backend: NestJS + JWT, Frontend: React",
    "dependencies": ["@nestjs/jwt", "bcrypt"],
    "filesToModify": ["src/auth/auth.controller.ts"],
    "wikiEvidence": ["docs/llm-wiki/wiki/services/auth.md", "docs/llm-wiki/wiki/PATTERNS.md#jwt"],
    "graphEvidence": [
      { "tool": "mcp__code_graph__semantic_search_nodes_tool", "params": { "query": "JWT token" }, "finding": "2 hits in src/auth/" }
    ]
  },
  "estimatedEffort": "2 days",
  "priority": "high"
}
```

---

## SDD Template Structure

```markdown
# [ID] Title

## User Story
As a [role]
I want to [action]
So that [benefit]

## Acceptance Criteria (BDD)

### Scenario: [Happy path]
**Given** [precondition]
**When** [action]
**Then** [expected outcome]

## Technical Context

### Architecture
[Technical approach]

### Dependencies
- [List]

### Files to Modify
- `path/to/file.ts`

## Testing Strategy
- Unit: [What to test]
- Integration: [What to test]

## Estimated Effort
[1-3 days]
```

---

## Examples

### Quick Text → Markdown

```bash
# Claude Code
/create-sdd-ticket --from-input "Add real-time notifications using WebSockets" --save-to-markdown "./specs/NOTIF-001.md"
# Codex CLI
$create-sdd-ticket --from-input "Add real-time notifications using WebSockets" --save-to-markdown "./specs/NOTIF-001.md"
```

**Process**:
1. Parse text input
2. Infer architecture from codebase
3. Infer file placement
4. Ask minimal questions
5. Generate complete ticket
6. Save to file

### Enhance Jira Ticket

```bash
# Claude Code
/create-sdd-ticket --from-jira "PROJ-456" --save-to-jira "<board-url>"
# Codex CLI
$create-sdd-ticket --from-jira "PROJ-456" --save-to-jira "<board-url>"
```

**Process**:
1. Fetch from Jira
2. Convert to canonical format
3. Add missing BDD scenarios
4. Infer technical context
5. Update Jira ticket

---

## Troubleshooting

### Too Many Questions
**Solution**:
- Ensure `.claude/CLAUDE.md` (or `.codex/AGENTS.md`) is up to date
- Ensure `.claude/skills/project-context/SKILL.md` (or the Codex equivalent under `.codex/skills/`) exists
- Add similar features to codebase for inference

### Ticket Too Large
**Solution**:
- Skill suggests splitting
- Focus on smaller scope
- Create multiple tickets

### Missing Technical Context
**Solution**:
- Provide detailed input: `--from-input "Add JWT auth using @nestjs/jwt"`
- Answer technical questions when prompted

### Skill Not Recognized in Codex
**Solution**:
- Run `/skills` in the Codex session to list available skills
- If `create-sdd-ticket` isn't listed, re-sync framework resources and restart the session

---

## Performance

| Phase | Time |
|-------|------|
| Parse input | 5s |
| Canonicalization | 10s |
| Codebase inference | 30s |
| Gap resolution | 15s |
| Template application | 10s |
| INVEST validation | 10s |
| Output formatting | 10s |
| **Total** | **~90s** |

---

---

## External Document Caching

When `framework-config.json` has `wiki.cache_external: true`, the `fetch-ticket-context` skill
persists every external doc fetched from Jira, Notion, or Confluence to:

```
docs/llm-wiki/raw/external/<source-type>/<source-id>.md
```

Each cached file carries frontmatter with `source_url`, `source_type`, `source_id`, `ticket_id`,
`fetched_at`, and `sha256`. Subsequent runs hitting the same external doc read from this cache
(valid for 7 days) instead of making a new network request.

The default (`cache_external: false`) is identical to the legacy "fetch-and-discard" behavior —
no files are written — so existing projects are unaffected until they opt in.

Pass `--refresh-external` to `fetch-ticket-context` to bypass the cache for a single run.

**See also**:
- `skills/020-development-workflow/create-sdd-ticket/SKILL.md`
- `skills/040-integrations/fetch-ticket-context/SKILL.md`
- `orchestration/src/services/graph-wiki/external-cache.ts`
- `schemas/sdd-ticket.schema.json`
