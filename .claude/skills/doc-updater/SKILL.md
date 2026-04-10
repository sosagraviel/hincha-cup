# Documentation Updater Skill

## Purpose

Maintain `.claude/CLAUDE.md` and `.claude/skills/project-context/SKILL.md` accuracy after code changes by analyzing changed files and updating only necessary documentation sections.

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
      "content": "Read current CLAUDE.md and project-context",
      "status": "in_progress",
      "activeForm": "Reading current documentation"
    }
  ]
}
```
</TodoWrite>

Read existing documentation:

```bash
echo "=== Current CLAUDE.md ==="
cat .claude/CLAUDE.md

echo ""
echo "=== Current project-context/SKILL.md ==="
cat .claude/skills/project-context/SKILL.md
```

<TodoWrite>
```json
{
  "todos": [
    {
      "content": "Read current CLAUDE.md and project-context",
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

#### CLAUDE.md Updates Needed When:

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

#### project-context/SKILL.md Updates Needed When:

1. **Request Lifecycle Changed**:
   - New middleware added
   - Guard/interceptor order changed
   - Authentication flow modified

2. **Authentication/Authorization Changed**:
   - New auth mechanism
   - RBAC/policy changes
   - Token handling modified

3. **Real-Time Architecture Changed**:
   - WebSocket event flow modified
   - New event types
   - Subscription management changed

4. **Error Handling Changed**:
   - New exception types
   - Global error handler modified
   - Error transformation changed

5. **Data Flow Patterns Changed**:
   - New repository pattern
   - DTO transformation logic
   - Response serialization changed

6. **Non-Obvious Patterns Added**:
   - New guard stacking rules
   - New decorator requirements
   - New multi-file update checklist

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

#### Update CLAUDE.md

For each update in `updates.claudeMd`:

1. Use the Edit tool to apply changes:
   ```
   Edit({
     file_path: '.claude/CLAUDE.md',
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

#### Update project-context/SKILL.md

For each update in `updates.projectContext`:

1. Use the Edit tool to apply changes:
   ```
   Edit({
     file_path: '.claude/skills/project-context/SKILL.md',
     old_string: update.before,
     new_string: update.after
   })
   ```

2. Verify the edit was successful

**Update Strategy by Section**:

1. **Request Lifecycle**:
   - Update if middleware/guards added
   - Update if order of execution changed
   - Include file paths for all steps

2. **Authentication Flow**:
   - Update if auth mechanism changed
   - Update if session management changed
   - Document caching strategy changes

3. **Authorization Pattern**:
   - Update if guard stacking changed
   - Update if RBAC policy evaluation changed
   - Document new decorator requirements

4. **Error Handling Chain**:
   - Update if new exception types added
   - Update if global error handler behavior changed
   - Document fail-fast behaviors

5. **Real-Time Architecture**:
   - Update if WebSocket event flow changed
   - Update if subscription management changed
   - Document full event pipeline

6. **Multi-File Patterns**:
   - Update if new checklist needed (e.g., "when adding a new module")
   - Document non-obvious multi-file dependencies

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
echo "=== Updated CLAUDE.md ==="
cat .claude/CLAUDE.md

echo ""
echo "=== Updated project-context/SKILL.md ==="
cat .claude/skills/project-context/SKILL.md
```

Verify:
- ✅ Only necessary sections updated
- ✅ Existing structure preserved
- ✅ No exhaustive lists added
- ✅ All referenced paths exist (use Glob to verify)
- ✅ Changes pass maintenance test
- ✅ CLAUDE.md remains concise (<300 lines)
- ✅ project-context remains concise (<250 lines)

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
    "projectContext": {
      "updateNeeded": false,
      "sections": [],
      "reason": "No hard-to-discover knowledge changed"
    }
  },
  "updates": {
    "claudeMd": [],
    "projectContext": []
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
    "projectContext": {
      "updateNeeded": false,
      "sections": [],
      "reason": "No architectural patterns changed"
    }
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
    "projectContext": []
  }
}
```

### Example 3: Major Architectural Changes

```json
{
  "ticketId": "PROJ-789",
  "changesDetected": {
    "claudeMd": {
      "updateNeeded": true,
      "sections": ["Architecture", "Request Lifecycle"],
      "reason": "Migration from REST to GraphQL requires major documentation updates"
    },
    "projectContext": {
      "updateNeeded": true,
      "sections": ["Request Lifecycle", "Error Handling Chain"],
      "reason": "GraphQL resolver chain is fundamentally different from REST middleware chain"
    }
  },
  "recommendation": "Consider running /initialize-project skill to regenerate documentation from scratch",
  "updates": {
    "claudeMd": [
      {
        "section": "Architecture",
        "action": "update",
        "before": "REST API with controllers and services",
        "after": "GraphQL API with resolvers and dataloaders",
        "justification": "Migrated from REST to GraphQL architecture"
      }
    ],
    "projectContext": [
      {
        "section": "Request Lifecycle",
        "action": "update",
        "before": "1. Request → Middleware → Controller → Service",
        "after": "1. Request → Context Builder → Resolver → Dataloader → Service",
        "justification": "GraphQL resolver chain replaces REST controller flow"
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
- ✅ Documentation remains concise (CLAUDE.md <300 lines, project-context <250 lines)
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
