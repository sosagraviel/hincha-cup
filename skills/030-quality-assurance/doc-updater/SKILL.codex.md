---
name: doc-updater
description: Maintain {{INSTRUCTION_FILE}} (CLAUDE.md/AGENTS.md) and the three generated convention skills (code-conventions, multi-file-workflows, testing-conventions) accuracy after code changes. Surgical updates only; defers descriptive content to /wiki-refresh and graph maintenance to ensure-context.sh.
version: 2.0.0
last-updated: 2026-05-14
---

# Documentation Updater Skill

> **Codex variant.** Semantic content is identical to SKILL.claude.md.
> Differences from the Claude variant:
> - Role prompts are loaded locally from `{{CONFIG_DIR}}/agents/<role>.md`
>   rather than being resolved by the Claude CLI agent registry.
> - Progress tracking appends JSON lines to
>   `$ARTIFACTS_DIR/doc-updater-progress.jsonl` instead of using TaskCreate
>   calls (Codex does not have the TaskCreate MCP tool).
> - Sub-agent spawning uses `codex --continue` with the role prompt file
>   path; Claude uses `claude --agent`.
> - MCP tool references use the Codex AGENTS.md-style naming convention
>   (e.g., `mcp__filesystem__read_file` rather than the MCP short names).

## Responsibilities and non-responsibilities

### In scope

This skill updates exactly four targets — nothing else:

1. `{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}` (CLAUDE.md / AGENTS.md) — prescriptive project rules: file placement, tech stack cheat-sheet, common commands, architecture structure.
2. `{{CONFIG_DIR}}/skills/code-conventions/SKILL.md` — prescriptive coding conventions, gotchas, naming rules, WRONG/CORRECT examples.
3. `{{CONFIG_DIR}}/skills/multi-file-workflows/SKILL.md` — prescriptive multi-file checklists for changes that cross ≥2 files.
4. `{{CONFIG_DIR}}/skills/testing-conventions/SKILL.md` — prescriptive testing rules, fixture conventions, mocking rules.

### Out of scope (and why)

| What | Why not here | Where instead |
|------|-------------|---------------|
| `docs/llm-wiki/**` | Descriptive content — system shape, service inventory, flows. Belongs in the wiki. | `/wiki-refresh` (invoked automatically in `/implement-ticket` Phase 8.5) |
| Code graph | The graph is a structural artifact maintained by pre-flight tooling, not by a documentation pass. | `ensure-context.sh` preflight |
| README files | READMEs are discoverable human documentation handled during ticket implementation, not by this skill. | Implementer agent during `/implement-ticket` Phase 5 |

**Prescriptive vs. descriptive line (load-bearing):**

- `{{INSTRUCTION_FILE}}` is a **cheat-sheet**: file placement rules, commands, tech stack
- The three convention skills are **prescriptive**: rules, examples, checklists
- The wiki is **descriptive**: system shape, service inventory, request flows

If a fact you would update is descriptive, it belongs in the wiki — invoke `/wiki-refresh` instead.

---

## CRITICAL: Role prompt for this agent

```
CRITICAL: This agent updates PRESCRIPTIVE rules only.

FORBIDDEN:
- Editing any file under docs/llm-wiki/**
- Adding descriptive narrative ("the system uses X") to any convention skill body
- Editing README.md or any documentation that is not one of the four targets listed in "In scope"
- Bumping version numbers in package.json / pyproject.toml / Cargo.toml / go.mod / etc.

If a proposed change is descriptive, refuse it and tell the caller to invoke /wiki-refresh instead.
```

---

## Binary qualification rubric

A change qualifies for a convention update **only if** it satisfies at least one of:

**(a)** It introduces a **new file-placement rule** — a new directory structure, file naming convention, or module organisation pattern that a developer must know before creating new files.

**(b)** It introduces or removes a **workflow that crosses ≥2 files** — a multi-step checklist where skipping or reordering steps causes bugs or broken builds.

**(c)** It changes a **testing convention reusable by future work** — a new fixture pattern, mock boundary rule, coverage threshold change, or test-organisation rule that applies beyond this one ticket.

Anything else is either descriptive (→ `/wiki-refresh`) or one-off implementation detail (→ no update).

---

## When to Use

Invoke `$doc-updater` when:

- After implementing a ticket (Phase 8 of implement-ticket)
- After significant code changes
- When architectural patterns change
- When file placement conventions change
- When new technology is added

Do NOT invoke for:

- Simple bug fixes
- New endpoints (endpoints must not be listed in docs)
- New entities (entity fields must not be listed in docs)
- Implementation details discoverable from code

---

## Inputs

This skill expects to be called from implement-ticket Phase 8 with:

1. **Changed files list**: From `git diff --name-only`
2. **Implementation summary**: Brief description of changes
3. **Ticket ID**: For tracking purposes

---

## Codex execution mechanics

### Progress tracking

Codex appends progress events to a JSONL file instead of using tool-based
task management. Each line is a JSON object:

```bash
echo '{"phase":"0","status":"in_progress","label":"Read current documentation"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

Each line is a JSON object with `phase`, `status` (`in_progress` |
`completed` | `skipped`), and `label`.

### Sub-agent spawning

When this skill needs to invoke a role prompt as a sub-agent under Codex:

```bash
codex --continue "{{CONFIG_DIR}}/agents/doc-updater-analyst.md" \
  --input "$INPUT_JSON_PATH" \
  --output "$OUTPUT_JSON_PATH"
```

Role prompt files live at `{{CONFIG_DIR}}/agents/<role>.md`. The framework
copies them from `skills/030-quality-assurance/doc-updater/agents/` during
`sync-framework-resources.sh`.

### MCP tool names

Under Codex, MCP tools follow the AGENTS.md naming convention:

| Operation | Codex MCP name |
|-----------|---------------|
| Read file | `mcp__filesystem__read_file` |
| Write file | `mcp__filesystem__write_file` |
| Edit file | `mcp__filesystem__edit_file` |
| Glob | `mcp__filesystem__glob` |
| Bash | `mcp__bash__execute` |

---

## Workflow

### Phase 0: Read Current Documentation

Append progress:

```bash
echo '{"phase":"0","status":"in_progress","label":"Read current documentation"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

Read existing documentation:

```bash
echo "=== Current {{INSTRUCTION_FILE}} ==="
cat {{CONFIG_DIR}}/{{INSTRUCTION_FILE}}

echo ""
echo "=== Current code-conventions/SKILL.md ==="
cat {{CONFIG_DIR}}/skills/code-conventions/SKILL.md

echo ""
echo "=== Current multi-file-workflows/SKILL.md ==="
cat {{CONFIG_DIR}}/skills/multi-file-workflows/SKILL.md

echo ""
echo "=== Current testing-conventions/SKILL.md ==="
cat {{CONFIG_DIR}}/skills/testing-conventions/SKILL.md
```

```bash
echo '{"phase":"0","status":"completed","label":"Read current documentation"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

---

### Phase 1: Analyze Changed Files

```bash
echo '{"phase":"1","status":"in_progress","label":"Analyze changed files for documentation impact"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

Read and categorize all changed files:

```bash
for file in $CHANGED_FILES; do
  echo "=== $file ==="
  cat "$file"
done
```

Categorize changes:

- Backend code (controllers, services, guards, middleware)
- Frontend code (components, pages, hooks)
- Configuration (package.json, docker-compose.yml, tsconfig.json)
- Infrastructure (Dockerfile, scripts, CI/CD)

```bash
echo '{"phase":"1","status":"completed","label":"Analyze changed files for documentation impact"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

---

### Phase 2: Detect Documentation Impact

```bash
echo '{"phase":"2","status":"in_progress","label":"Detect documentation impact"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

#### {{INSTRUCTION_FILE}} Updates Needed When:

1. **New Technology Added**:
   - New framework/library in package.json
   - New language (e.g., Python scripts added)
   - New database/service in docker-compose.yml

2. **File Placement Changes**:
   - New directory structure
   - New file naming convention
   - New module organization pattern

3. **Common Commands Changed**:
   - package.json scripts modified
   - Makefile targets changed
   - New development workflow commands

4. **Architecture Changes**:
   - Monorepo structure modified
   - New path aliases added
   - Backend/frontend organization changed

5. **Services & Ports Changed**:
   - docker-compose.yml services added/removed
   - Port mappings changed
   - New services deployed

#### code-conventions/SKILL.md Updates Needed When:

Prescriptive code rules — gotchas, naming, error-handling, data-layer
patterns. Applies only when the binary rubric clause (a), (b), or (c) is
satisfied. Update when:

1. **New Gotcha Discovered**:
   - A bug fix surfaced a non-obvious pattern that is easy to get wrong
   - Add a `### Title` block with WRONG/CORRECT code examples

2. **Naming Convention Changed**:
   - File naming convention modified
   - Identifier convention modified

3. **Error Handling Pattern Changed**:
   - New exception type or handler added that needs prescriptive rules
   - Error response format changed

4. **Data-Layer Rule Changed**:
   - Repository / DAO pattern modified
   - Transaction handling rule changed (e.g., new wrapping requirement)

If the change is **descriptive** ("there is a global error handler"),
it belongs in the wiki — invoke `/wiki-refresh` instead. This skill carries
**prescriptive** rules only ("ALWAYS wrap order writes in a transaction").

#### multi-file-workflows/SKILL.md Updates Needed When:

Cross-cutting checklists — ordered steps for changes that touch many
files. Applies only when rubric clause (b) is satisfied. Update when:

1. **New Multi-File Workflow Discovered**:
   - The implementation surfaced an "and you must also update X" rule
   - Add a `## Workflow Name` heading + numbered steps + gotcha note

2. **Existing Workflow Changed**:
   - A new file is now part of an existing workflow (e.g., a new barrel export)
   - The order of steps in an existing workflow matters and changed

#### testing-conventions/SKILL.md Updates Needed When:

Prescriptive test rules with example code. Applies only when rubric clause
(c) is satisfied. Update when:

1. **New "Do Not Mock" Rule Added**:
   - Test failure or production incident proved a class must not be mocked

2. **New Fixture Convention Added**:
   - A reusable fixture / builder pattern emerged

3. **Coverage Expectation Changed**:
   - Threshold moved, or per-area coverage rule introduced

4. **New Test Pattern Added**:
   - Update the example code in the relevant section

#### Architectural Narrative Updates (NOT this skill)

If the change is **descriptive** — service boundaries shifted, request
lifecycle steps changed, a new external integration was added — that
content lives in `docs/llm-wiki/wiki/ARCHITECTURE.md` (or per-service
docs). Do not update those here. Invoke `/wiki-refresh` instead; it
re-runs the graph-grounded wiki generator over the current code.

#### Do NOT update

- Any file under `docs/llm-wiki/**`
- README.md or any discoverable human documentation
- `package.json`, `pyproject.toml`, `Cargo.toml`, or any package manifest version field
- Any file not in the four targets listed in "In scope"

#### Apply the Binary Rubric

**CRITICAL**: Only update documentation when the change satisfies rubric
clause (a), (b), or (c) above. All three clauses require that the rule be
**reusable by future work**, not specific to this ticket.

Ask: does this change (a) establish a new file-placement rule, (b)
introduce or remove a cross-file workflow, or (c) change a testing
convention applicable beyond this ticket? If none of (a), (b), (c) is
true, do not update documentation.

**DO NOT update if**:

- Changes are simple bug fixes
- Changes add new endpoints (endpoints must not be listed)
- Changes add new entities (entity fields must not be listed)
- Changes are implementation details discoverable by reading code
- The candidate update is descriptive rather than prescriptive

```bash
echo '{"phase":"2","status":"completed","label":"Detect documentation impact"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

---

### Phase 3: Generate Update Plan

```bash
echo '{"phase":"3","status":"in_progress","label":"Generate structured update plan"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

Generate a JSON structure with your analysis:

```json
{
  "ticketId": "<ticket-id>",
  "changesDetected": {
    "claudeMd": {
      "updateNeeded": false,
      "sections": [],
      "reason": "<why update is needed or not>"
    },
    "codeConventions": {
      "updateNeeded": false,
      "sections": [],
      "reason": "<rubric clause satisfied, or 'no clause satisfied'>"
    },
    "multiFileWorkflows": {
      "updateNeeded": false,
      "sections": [],
      "reason": "<rubric clause satisfied, or 'no clause satisfied'>"
    },
    "testingConventions": {
      "updateNeeded": false,
      "sections": [],
      "reason": "<rubric clause satisfied, or 'no clause satisfied'>"
    }
  },
  "updates": {
    "claudeMd": [],
    "codeConventions": [],
    "multiFileWorkflows": [],
    "testingConventions": []
  }
}
```

```bash
echo '{"phase":"3","status":"completed","label":"Generate structured update plan"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

---

### Phase 4: Apply Updates

```bash
echo '{"phase":"4","status":"in_progress","label":"Apply documentation updates"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

#### Update {{INSTRUCTION_FILE}}

For each update in `updates.claudeMd`, use `mcp__filesystem__edit_file`:

```json
{
  "tool": "mcp__filesystem__edit_file",
  "input": {
    "path": "{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}",
    "old_string": "<current content>",
    "new_string": "<new content>"
  }
}
```

**Update Strategy by Section**:

1. **Tech Stack Section**:
   - Update if new language/framework added
   - Update versions if major version bump
   - Keep list concise

2. **File Placement Guide**:
   - Update if new file type pattern added
   - Update if directory structure changed
   - Ensure examples are real paths from codebase (verify with glob)

3. **Common Commands**:
   - Update if scripts in package.json changed
   - Update if Makefile targets changed
   - Keep commands organized by category

4. **Architecture Section**:
   - Update if monorepo structure changed
   - Update if new path aliases added
   - Keep brief, reference structure only

5. **Conventions**:
   - Update if code style rules changed
   - Update if commit message format changed
   - Update if new naming conventions added

6. **Services & Ports**:
   - Update if docker-compose.yml services changed
   - Update if port mappings changed

#### Update the Three Convention Skills

For each update in `updates.codeConventions` /
`updates.multiFileWorkflows` / `updates.testingConventions`, use
`mcp__filesystem__edit_file` with the appropriate target path.

**Update Strategy by Skill**:

`code-conventions/SKILL.md`:

1. **Gotchas section** — add a new `### Title` block with a one-line
   description and WRONG/CORRECT fenced code examples. Keep examples
   minimal and self-contained.
2. **Naming** — update the rule, keep the rationale to one line.
3. **Error Handling** — update the rule with one-line rationale.
4. **Data Layer Rules** — update the rule with one-line rationale.

`multi-file-workflows/SKILL.md`:

1. **Existing workflow** — modify the numbered steps in place; preserve
   step ordering.
2. **New workflow** — add a `## Adding a new <thing>` heading with
   numbered steps and a `> Gotcha:` line where wrong order causes bugs.
3. Keep checklists concrete: real file paths, `{placeholder}` for
   varying segments only.

`testing-conventions/SKILL.md`:

1. **Philosophy** — add or modify a "do test" / "do NOT test" bullet.
2. **Unit / Integration / E2E patterns** — update the example test code
   to match the new pattern.
3. **What NOT to Mock** — add a bullet with one-line rationale.
4. **Fixture Conventions** — update naming / location rules with the
   example.

**If a fact you would add is descriptive** ("the system uses RabbitMQ
for jobs", "auth is OAuth2 PKCE"), it belongs in the wiki, not in a
skill. Invoke `/wiki-refresh` instead.

```bash
echo '{"phase":"4","status":"completed","label":"Apply documentation updates"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

---

### Phase 5: Verify Updates

```bash
echo '{"phase":"5","status":"in_progress","label":"Verify documentation updates"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

Read updated files to confirm correctness:

```bash
echo "=== Updated {{INSTRUCTION_FILE}} ==="
cat {{CONFIG_DIR}}/{{INSTRUCTION_FILE}}

echo ""
echo "=== Updated code-conventions/SKILL.md ==="
cat {{CONFIG_DIR}}/skills/code-conventions/SKILL.md

echo ""
echo "=== Updated multi-file-workflows/SKILL.md ==="
cat {{CONFIG_DIR}}/skills/multi-file-workflows/SKILL.md

echo ""
echo "=== Updated testing-conventions/SKILL.md ==="
cat {{CONFIG_DIR}}/skills/testing-conventions/SKILL.md
```

Verify:

- Only necessary sections updated
- Existing structure preserved
- No exhaustive lists added
- All referenced paths exist (use glob to verify)
- Changes pass the binary rubric (a/b/c)
- Each file remains within its line bounds:
  - {{INSTRUCTION_FILE}} 30–250 lines
  - code-conventions/SKILL.md 30–250 lines
  - multi-file-workflows/SKILL.md 20–200 lines
  - testing-conventions/SKILL.md 25–200 lines
- No descriptive prose leaked into the skills (descriptive belongs in the wiki)
- No file under `docs/llm-wiki/**` was touched

```bash
echo '{"phase":"5","status":"completed","label":"Verify documentation updates"}' >> "$ARTIFACTS_DIR/doc-updater-progress.jsonl"
```

---

## Important Rules

1. **Minimal Updates**: Only update what's necessary. Do not rewrite entire sections.

2. **Preserve Structure**: Maintain existing formatting and organization.

3. **No Exhaustive Lists**: Never add endpoint lists, entity field lists, or similar comprehensive inventories.

4. **Hard-to-Discover Only**: Only document patterns that are not obvious from reading code.

5. **Verify Paths**: Only reference paths that exist (verify with glob).

6. **Binary Rubric**: Apply clause (a), (b), or (c). If none is satisfied, do not update.

---

## Example Outputs

### Example 1: No Updates Needed

```json
{
  "ticketId": "PROJ-123",
  "changesDetected": {
    "claudeMd": {
      "updateNeeded": false,
      "sections": [],
      "reason": "Changes are implementation details, no architectural patterns affected"
    },
    "codeConventions": {
      "updateNeeded": false,
      "sections": [],
      "reason": "No clause (a/b/c) satisfied"
    },
    "multiFileWorkflows": { "updateNeeded": false, "sections": [], "reason": "No cross-file workflow change" },
    "testingConventions": { "updateNeeded": false, "sections": [], "reason": "No reusable test rule change" }
  },
  "updates": {
    "claudeMd": [],
    "codeConventions": [],
    "multiFileWorkflows": [],
    "testingConventions": []
  }
}
```

### Example 2: File Placement Update (rubric clause a)

```json
{
  "ticketId": "PROJ-456",
  "changesDetected": {
    "claudeMd": {
      "updateNeeded": true,
      "sections": ["File Placement Guide"],
      "reason": "Rubric clause (a): new feature module pattern introduced for profile pages"
    },
    "codeConventions": { "updateNeeded": false, "sections": [], "reason": "No clause satisfied" },
    "multiFileWorkflows": { "updateNeeded": false, "sections": [], "reason": "No cross-file workflow change" },
    "testingConventions": { "updateNeeded": false, "sections": [], "reason": "No reusable test rule change" }
  },
  "updates": {
    "claudeMd": [
      {
        "section": "File Placement Guide",
        "action": "add",
        "before": null,
        "after": "| User Profile Page | src/features/profile/*.tsx | ProfilePage.tsx |",
        "justification": "Rubric clause (a): new profile feature introduced with its own directory structure"
      }
    ],
    "codeConventions": [],
    "multiFileWorkflows": [],
    "testingConventions": []
  }
}
```

### Example 3: New Gotcha + Cross-File Workflow (rubric clauses a and b)

```json
{
  "ticketId": "PROJ-789",
  "changesDetected": {
    "claudeMd": { "updateNeeded": false, "sections": [], "reason": "No cheat-sheet impact" },
    "codeConventions": {
      "updateNeeded": true,
      "sections": ["Gotchas"],
      "reason": "Rubric clause (a/b): transaction wrapper is a prescriptive rule — bare repo.save corrupts state"
    },
    "multiFileWorkflows": {
      "updateNeeded": true,
      "sections": ["Adding a new entity"],
      "reason": "Rubric clause (b): workflow now also requires registering the entity in EntityRegistry"
    },
    "testingConventions": { "updateNeeded": false, "sections": [], "reason": "No clause satisfied" }
  },
  "recommendation": "Descriptive context about the new EntityRegistry belongs in /wiki-refresh, not here.",
  "updates": {
    "codeConventions": [
      {
        "section": "Gotchas",
        "action": "add",
        "before": null,
        "after": "### Inventory writes must go through dataSource.transaction\n\n```typescript\n// WRONG\nawait inventoryRepo.save(inv);\n```\n\n```typescript\n// CORRECT\nreturn dataSource.transaction(async (m) => m.save(Inventory, inv));\n```",
        "justification": "Prescriptive rule — bare save corrupts state on partial failure"
      }
    ],
    "multiFileWorkflows": [
      {
        "section": "Adding a new entity",
        "action": "update",
        "before": "1. Create migration\n2. Update entity class",
        "after": "1. Create migration\n2. Update entity class\n3. Register in `apps/api/src/entity-registry.ts`",
        "justification": "Rubric clause (b): EntityRegistry is now a required cross-file step"
      }
    ]
  }
}
```

---

## Success Criteria

Your documentation update is successful if:

- Only necessary sections are updated
- Updates maintain existing structure and formatting
- No exhaustive lists added
- All referenced paths exist in codebase
- Changes satisfy at least one binary rubric clause (a/b/c)
- Documentation remains within line bounds ({{INSTRUCTION_FILE}} 30–250 lines; code-conventions 30–250; multi-file-workflows 20–200; testing-conventions 25–200)
- Updates accurately reflect code changes
- No file under `docs/llm-wiki/**` was touched
- No README files were touched
- No package manifest version fields were changed
- `$ARTIFACTS_DIR/doc-updater-progress.jsonl` contains one completed entry per phase

---

## Integration with implement-ticket

This skill is invoked from `implement-ticket` Phase 8 under Codex:

```bash
CHANGED_FILES=$(git diff --name-only origin/main...HEAD)
export ARTIFACTS_DIR="$ARTIFACTS_DIR"
export CHANGED_FILES="$CHANGED_FILES"
export TICKET_ID="$TICKET_ID"

$doc-updater
```

The skill will:

1. Detect changed files automatically via git
2. Analyze each file for documentation impact using the binary rubric
3. Update only the four in-scope targets when a rubric clause is satisfied
4. Append a progress JSONL entry per phase
5. Return success/failure status
