---
name: doc-updater
description: Maintain project documentation accuracy after code changes by analyzing changed files and updating only necessary sections of the project instruction file and the three prescriptive convention skills (code-conventions, multi-file-workflows, testing-conventions). Use after implementing a ticket, after significant code changes, or when architectural patterns, file placement conventions, or technologies change.
---

# Documentation Updater Skill

## Purpose

Maintain `{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}` and the three prescriptive convention skills under `{{CONFIG_DIR}}/skills/` (`code-conventions/SKILL.md`, `multi-file-workflows/SKILL.md`, `testing-conventions/SKILL.md`) after code changes by analyzing changed files and updating only the necessary sections.

**What this skill does NOT touch:**

- `docs/llm-wiki/` — refreshed by the `/wiki-refresh` workflow (graph-grounded)
- The architectural narrative — descriptive prose lives in the wiki, not in skills
- Per-endpoint / per-entity inventories — those are discoverable from code

**Descriptive vs. prescriptive line (load-bearing):**

- CLAUDE.md is a **cheat-sheet**: file placement, commands, tech stack
- The three skills are **prescriptive**: rules, examples, checklists
- The wiki is **descriptive**: system shape, service inventory, flows

If a fact you'd update is descriptive, it belongs in the wiki — run `/wiki-refresh` instead.

## When to Use

Invoke `/doc-updater` when:

- ✅ After implementing a ticket (Phase 7 of implement-ticket)
- ✅ After significant code changes
- ✅ When architectural patterns change
- ✅ When file placement conventions change
- ✅ When new technology is added

**Do NOT use** for:

- ❌ Simple bug fixes
- ❌ New endpoints (endpoints shouldn't be listed in docs)
- ❌ New entities (entity fields shouldn't be listed in docs)
- ❌ Implementation details discoverable from code

## Inputs

This skill expects to be called from implement-ticket Phase 7 with:

1. **Changed files list**: From `git diff --name-only`
2. **Implementation summary**: Brief description of changes
3. **Ticket ID**: For tracking purposes

## Workflow

### Phase 0: Read Current Documentation

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Read current {{INSTRUCTION_FILE}} and the three convention skills",
      "status": "in_progress",
      "activeForm": "Reading current documentation"
    }
  ]
}
```
</TodoWrite>

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

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Read current {{INSTRUCTION_FILE}} and the three convention skills",
      "status": "completed",
      "activeForm": "Reading current documentation"
    }
  ]
}
```
</TodoWrite>

---

### Phase 1: Analyze Changed Files

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Analyze all changed files for documentation impact",
      "status": "in_progress",
      "activeForm": "Analyzing changed files for documentation impact"
    }
  ]
}
```
</TodoWrite>

Read and categorize all changed files:

```bash
# Read each changed file to understand modifications
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

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Analyze all changed files for documentation impact",
      "status": "completed",
      "activeForm": "Analyzing changed files for documentation impact"
    }
  ]
}
```
</TodoWrite>

---

### Phase 2: Detect Documentation Impact

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Detect which documentation sections need updates",
      "status": "in_progress",
      "activeForm": "Detecting documentation impact"
    }
  ]
}
```
</TodoWrite>

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
patterns. Update when:

1. **New Gotcha Discovered**:
   - A bug fix surfaced a non-obvious pattern that's easy to get wrong
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
it belongs in the wiki — run `/wiki-refresh` instead. This skill carries
**prescriptive** rules only ("ALWAYS wrap order writes in a transaction").

#### multi-file-workflows/SKILL.md Updates Needed When:

Cross-cutting checklists — ordered steps for changes that touch many
files. Update when:

1. **New Multi-File Workflow Discovered**:
   - The implementation surfaced an "and you must also update X" rule
   - Add a `## Workflow Name` heading + numbered steps + gotcha note

2. **Existing Workflow Changed**:
   - A new file is now part of an existing workflow (e.g., a new barrel export)
   - The order of steps in an existing workflow matters and changed

#### testing-conventions/SKILL.md Updates Needed When:

Prescriptive test rules with example code. Update when:

1. **New "Do Not Mock" Rule Added**:
   - Test failure or production incident proved a class shouldn't be mocked

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
docs). **Do not update those here.** Run `/wiki-refresh` instead; it
re-runs the graph-grounded wiki generator over the current code.

#### Apply the Maintenance Test

**CRITICAL**: Only update documentation if:

- ✅ Changes affect hard-to-discover knowledge
- ✅ Changes introduce new patterns
- ✅ Changes modify architectural conventions
- ✅ Changes affect developer workflow

**DO NOT update if**:

- ❌ Changes are simple bug fixes
- ❌ Changes add new endpoints (endpoints shouldn't be listed)
- ❌ Changes add new entities (entity fields shouldn't be listed)
- ❌ Changes are implementation details discoverable by reading code

**Maintenance Test**: Ask yourself: "If a developer adds a new endpoint, would they need to update this documentation?" If yes, that content should NOT be in the documentation.

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Detect which documentation sections need updates",
      "status": "completed",
      "activeForm": "Detecting documentation impact"
    }
  ]
}
```
</TodoWrite>

---

### Phase 3: Generate Update Plan

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Generate structured update plan",
      "status": "in_progress",
      "activeForm": "Generating structured update plan"
    }
  ]
}
```
</TodoWrite>

Generate a JSON structure with your analysis:

```json
{
  "ticketId": "<ticket-id>",
  "changesDetected": {
    "claudeMd": {
      "updateNeeded": <boolean>,
      "sections": ["<section name>", ...],
      "reason": "<why update is needed>"
    },
    "projectContext": {
      "updateNeeded": <boolean>,
      "sections": ["<section name>", ...],
      "reason": "<why update is needed>"
    }
  },
  "updates": {
    "claudeMd": [
      {
        "section": "<section name>",
        "action": "add|update|remove",
        "before": "<current content>",
        "after": "<new content>",
        "justification": "<why this change>"
      }
    ],
    "projectContext": [
      {
        "section": "<section name>",
        "action": "add|update|remove",
        "before": "<current content>",
        "after": "<new content>",
        "justification": "<why this change>"
      }
    ]
  }
}
```

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Generate structured update plan",
      "status": "completed",
      "activeForm": "Generating structured update plan"
    }
  ]
}
```
</TodoWrite>

---

### Phase 4: Apply Updates

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Apply documentation updates",
      "status": "in_progress",
      "activeForm": "Applying documentation updates"
    }
  ]
}
```
</TodoWrite>

#### Update {{INSTRUCTION_FILE}}

For each update in `updates.claudeMd`:

1. Use the Edit tool to apply changes:

   ```
   Edit({
     file_path: '{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}',
     old_string: update.before,
     new_string: update.after
   })
   ```

2. Verify the edit was successful

**Update Strategy by Section**:

1. **Tech Stack Section**:
   - Update if new language/framework added
   - Update versions if major version bump
   - Keep list concise

2. **File Placement Guide**:
   - Update if new file type pattern added
   - Update if directory structure changed
   - Ensure examples are real paths from codebase (verify with Glob)

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
`updates.multiFileWorkflows` / `updates.testingConventions`:

1. Use the Edit tool to apply changes to the appropriate skill body:

   ```
   Edit({
     file_path: '{{CONFIG_DIR}}/skills/code-conventions/SKILL.md',
     old_string: update.before,
     new_string: update.after,
   })
   ```

   ```
   Edit({
     file_path: '{{CONFIG_DIR}}/skills/multi-file-workflows/SKILL.md',
     old_string: update.before,
     new_string: update.after,
   })
   ```

   ```
   Edit({
     file_path: '{{CONFIG_DIR}}/skills/testing-conventions/SKILL.md',
     old_string: update.before,
     new_string: update.after,
   })
   ```

2. Verify the edit was successful.

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
3. **What NOT to Mock** — add a bullet with one-line rationale (often
   "incident X showed mocking Y masks failures").
4. **Fixture Conventions** — update naming / location rules with the
   example.

**If a fact you'd want to add is descriptive** ("the system uses RabbitMQ
for jobs", "auth is OAuth2 PKCE"), it belongs in the wiki, not in a
skill. Run `/wiki-refresh` instead — the wiki-generator re-runs over
the current graph and analyzers, producing a fresh
`docs/llm-wiki/wiki/ARCHITECTURE.md` and per-service docs. Do not
duplicate descriptive content into skills.

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Apply documentation updates",
      "status": "completed",
      "activeForm": "Applying documentation updates"
    }
  ]
}
```
</TodoWrite>

---

### Phase 5: Verify Updates

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Verify documentation updates are correct",
      "status": "in_progress",
      "activeForm": "Verifying documentation updates"
    }
  ]
}
```
</TodoWrite>

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

- ✅ Only necessary sections updated
- ✅ Existing structure preserved
- ✅ No exhaustive lists added
- ✅ All referenced paths exist (use Glob to verify)
- ✅ Changes pass the maintenance test
- ✅ Each file remains within its line bounds:
  - {{INSTRUCTION_FILE}} 30–250 lines
  - code-conventions/SKILL.md 30–250 lines
  - multi-file-workflows/SKILL.md 20–200 lines
  - testing-conventions/SKILL.md 25–200 lines
- ✅ No descriptive prose leaked into the skills (descriptive belongs in the wiki)

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Verify documentation updates are correct",
      "status": "completed",
      "activeForm": "Verifying documentation updates"
    }
  ]
}
```
</TodoWrite>

---

## Important Rules

1. **Minimal Updates**: Only update what's necessary. Don't rewrite entire sections.

2. **Preserve Structure**: Maintain existing formatting and organization.

3. **No Exhaustive Lists**: Never add endpoint lists, entity field lists, or similar comprehensive inventories.

4. **Hard-to-Discover Only**: Only document patterns that aren't obvious from reading code.

5. **Verify Paths**: Only reference paths that exist (verify with Glob).

6. **Maintenance Test**: Ask: "If someone adds a new endpoint, would they need to update this?" If yes, remove it.

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
      "reason": "No new gotchas or rule changes"
    },
    "multiFileWorkflows": { "updateNeeded": false, "sections": [], "reason": "No new cross-file workflow" },
    "testingConventions": { "updateNeeded": false, "sections": [], "reason": "No new test rule" }
  },
  "updates": {
    "claudeMd": [],
    "codeConventions": [],
    "multiFileWorkflows": [],
    "testingConventions": []
  }
}
```

### Example 2: File Placement Update

```json
{
  "ticketId": "PROJ-456",
  "changesDetected": {
    "claudeMd": {
      "updateNeeded": true,
      "sections": ["File Placement Guide"],
      "reason": "New feature module pattern introduced for profile pages"
    },
    "codeConventions": { "updateNeeded": false, "sections": [], "reason": "No new gotcha" },
    "multiFileWorkflows": { "updateNeeded": false, "sections": [], "reason": "No new cross-file workflow" },
    "testingConventions": { "updateNeeded": false, "sections": [], "reason": "No new test rule" }
  },
  "updates": {
    "claudeMd": [
      {
        "section": "File Placement Guide",
        "action": "add",
        "before": null,
        "after": "| User Profile Page | src/features/profile/*.tsx | ProfilePage.tsx |",
        "justification": "New profile feature introduced with its own directory structure"
      }
    ],
    "codeConventions": [],
    "multiFileWorkflows": [],
    "testingConventions": []
  }
}
```

### Example 3: New Gotcha + Cross-File Workflow

```json
{
  "ticketId": "PROJ-789",
  "changesDetected": {
    "claudeMd": { "updateNeeded": false, "sections": [], "reason": "No cheat-sheet impact" },
    "codeConventions": {
      "updateNeeded": true,
      "sections": ["Gotchas"],
      "reason": "Discovered that the new transaction wrapper must be used for any inventory write — bare repo.save corrupts state on partial failure"
    },
    "multiFileWorkflows": {
      "updateNeeded": true,
      "sections": ["Adding a new entity"],
      "reason": "Workflow now also requires registering the entity in the new EntityRegistry"
    },
    "testingConventions": { "updateNeeded": false, "sections": [], "reason": "No test rule change" }
  },
  "recommendation": "If descriptive context about the new EntityRegistry is needed, run /wiki-refresh — the wiki, not the skills, is where descriptive prose lives.",
  "updates": {
    "codeConventions": [
      {
        "section": "Gotchas",
        "action": "add",
        "before": null,
        "after": "### Inventory writes must go through dataSource.transaction\n\n```typescript\n// WRONG\nawait inventoryRepo.save(inv);\n```\n\n```typescript\n// CORRECT\nreturn dataSource.transaction(async (m) => m.save(Inventory, inv));\n```",
        "justification": "Production incident PROJ-789 surfaced this rule"
      }
    ],
    "multiFileWorkflows": [
      {
        "section": "Adding a new entity",
        "action": "update",
        "before": "1. Create migration\n2. Update entity class",
        "after": "1. Create migration\n2. Update entity class\n3. Register in `apps/api/src/entity-registry.ts`",
        "justification": "EntityRegistry now required"
      }
    ]
  }
}
```

---

## Success Criteria

Your documentation update is successful if:

- ✅ Only necessary sections are updated
- ✅ Updates maintain existing structure and formatting
- ✅ No exhaustive lists added
- ✅ All referenced paths exist in codebase
- ✅ Changes pass the maintenance test
- ✅ Documentation remains within line bounds ({{INSTRUCTION_FILE}} 30–250 lines; code-conventions 30–250; multi-file-workflows 20–200; testing-conventions 25–200)
- ✅ Updates accurately reflect code changes
- ✅ Hard-to-discover knowledge is preserved

---

## Integration with implement-ticket

This skill is invoked from `implement-ticket` Phase 7:

```bash
# From implement-ticket SKILL.md Phase 7
CHANGED_FILES=$(git diff --name-only origin/main...HEAD)

echo "Changed files: $CHANGED_FILES"
echo "Ticket ID: $TICKET_ID"

# Invoke doc-updater skill
# Note: Skill will read changed files and analyze impact
/doc-updater
```

The skill will:

1. Detect changed files automatically via git
2. Analyze each file for documentation impact
3. Apply maintenance test
4. Update only necessary sections
5. Return success/failure status
