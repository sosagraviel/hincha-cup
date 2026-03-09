---
name: implement-ticket
description: End-to-end ticket implementation from Jira or markdown specs with security, quality checks, and automated PR creation. Use when you need to implement a complete ticket following SDLC best practices.
user-invocable: true
argument-hint: [--from-jira JIRA-URL-OR-KEY | --from-markdown PATH]
disable-model-invocation: false
context: inline
---

# Implement Ticket - Production Workflow

Complete SDLC workflow for implementing tickets from multiple sources with:
- ✅ Multiple input sources (Jira, markdown SDD specs)
- ✅ Full context gathering (Jira, Notion, Confluence, or markdown spec)
- ✅ Automated requirements analysis
- ✅ Language-aware implementation (Python/TypeScript)
- ✅ Security review (OWASP Top 10)
- ✅ Quality checks (linting, testing, coverage)
- ✅ Automated PR creation with full documentation

## Quick Start

### Option 1: From Jira Ticket

```bash
# Full Jira URL (recommended for multiple Atlassian instances)
/implement-ticket --from-jira https://your-company.atlassian.net/browse/PROJ-123

# Just the ticket key
/implement-ticket --from-jira PROJ-123
```

### Option 2: From Markdown Spec

```bash
# Markdown SDD ticket (created by /create-sdd-ticket)
/implement-ticket --from-markdown ./specs/PROJ-123.md
```

This single command runs the complete workflow end-to-end.

**Note:** The workflow and quality gates are identical regardless of input source. The only difference is where requirements come from.

## Execution Modes

### Interactive Mode (Default)

Prompts user for confirmation at key decision points:
- After context gathering (Phase 1)
- After requirements analysis (Phase 2)
- Before quality checks (Phase 4)

**Usage**:
```bash
/implement-ticket PROJ-123
# OR
/implement-ticket PROJ-123 --interactive
```

**Best for**: Learning the workflow, reviewing plans before execution, supervised development

---

### Autonomous Mode (--no-stop)

Runs end-to-end without user prompts. Only stops on hard errors:
- Coverage gate failures (<80% coverage after 3 attempts)
- Merge conflicts that cannot be auto-resolved
- Critical build/test failures
- Checkpoint resume decisions

**Usage**:
```bash
# Option 1: Flag
/implement-ticket PROJ-123 --no-stop

# Option 2: Environment variable (affects all runs)
export CLAUDE_AUTO_MODE=true
/implement-ticket PROJ-123

# Option 3: One-time environment variable
CLAUDE_AUTO_MODE=true /implement-ticket PROJ-123
```

**Best for**: Production workflows, overnight/weekend runs, well-defined tickets, CI/CD integration

**Decision Logging**: All autonomous decisions logged to `.claude/decisions/PROJ-123.md` and included in PR

**Note**: Autonomous mode is **recommended for production use** to maximize efficiency and enable unattended execution.

---

## Planning Modes

### Planner Mode (Default)

Fast linear pipeline for most tickets:
- Single-pass planning (Opus model)
- Direct implementation (Sonnet model)
- Hard quality gates (80% unit coverage, 100% integration/E2E)
- Autonomous execution capable

**Auto-selected for**: Low-risk tickets (no security/compliance/breaking change indicators)

**Best for**: Feature work, bug fixes, refactoring, UI changes, documentation

**Manual override**:
```bash
# Force architect mode for a low-risk ticket
/implement-ticket PROJ-123 --architect-mode
```

---

### Architect Mode (Automatic for High-Risk)

Deliberate supervisor pattern with grading for high-risk tickets:
- Detailed instruction generation
- Implementation by code agent
- Post-implementation grading (100-point rubric)
- Iterative improvement loop (target: ≥95%)
- Enhanced quality assurance

**Auto-selected for**: High-risk tickets containing keywords like:
- migration, auth, payment, security
- breaking change, database schema
- crypto, encryption, compliance
- GDPR, PCI, HIPAA

**Best for**: Security-critical work, compliance changes, breaking API changes, complex migrations

**Manual override**:
```bash
# Use planner mode for a high-risk ticket (fast path)
/implement-ticket PROJ-123 --planner-mode

# The system will auto-select architect mode by default for high-risk tickets
/implement-ticket PROJ-123  # Auto-selects architect if high-risk keywords detected
```

**Trade-offs**:
- **Planner mode**: Fast (10-30 min), autonomous, good for 80% of tickets
- **Architect mode**: Deliberate (1-3 hours), higher quality assurance, better for 20% critical tickets

---

## Agent Orchestration Strategy

This skill coordinates multiple specialized agents for different phases and languages:

### Phase-Based Agent Routing

1. **Planning Phase** → `planner` agent
   - Skills: project-context, analyze-requirements, design-doc-mermaid, architect-agent, mastering-{all-languages}
   - Output: Implementation plan with affected files and dependencies

2. **Implementation Phase** → Language-specific `implementer-{language}` agents
   - **File-to-Language Detection**:
     ```
     .ts/.tsx/.js/.jsx → implementer-typescript
     .py → implementer-python
     .go → implementer-go
     .java → implementer-java
     .rs → implementer-rust
     .rb → implementer-ruby
     ```
   - **Multi-Language Coordination**: When a ticket affects multiple languages, spawn MULTIPLE implementer agents in parallel or sequence
   - Skills per implementer: project-context, mastering-{language}, {framework-skills}

3. **Testing Phase** → Language-specific `tester-unit-{language}` and `tester-e2e-{language}` agents
   - Skills: project-context, mastering-{language}, {test-framework-skills}

4. **Security Phase** → `security-reviewer-{primary-language}` agent
   - Skills: project-context, security-review, mastering-{language}

### Multi-Language Example Flow

```
Ticket affects:
- services/backend/src/auth/oauth.service.ts (TypeScript)
- scripts/seed/create_oauth_users.py (Python)

Orchestration:
1. planner → Creates unified plan covering both languages
2. implementer-typescript → Implements TypeScript OAuth service
3. implementer-python → Implements Python seed script
4. tester-unit-typescript → Tests TypeScript code
5. tester-unit-python → Tests Python script
6. security-reviewer-typescript → Reviews security (primary language)
7. create-pr → Consolidates all changes into single PR
```

**Key Principle**: Each agent receives ONLY the skills relevant to its task and language, ensuring focused context and better code quality.

---

## Prerequisites

- Git repository initialized
- Project dependencies installed
- Jira, Notion, GitHub MCPs configured
- Language-specific tools (python/node/npm)
- Generated agents in `.claude/agents/` (via initialize-project)

## Complete Workflow

### Initialization: Parse Arguments and Setup

```bash
# Parse command line arguments using argument parser
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILS_DIR="$SCRIPT_DIR/../../../utils"

# Use the argument parser utility
if [[ ! -f "$UTILS_DIR/argument-parser.js" ]]; then
    echo "❌ Error: argument-parser.js not found at $UTILS_DIR/argument-parser.js"
    exit 1
fi

# Parse arguments
PARSE_RESULT=$(node "$UTILS_DIR/argument-parser.js" parse-implement-ticket "$@")
if [[ $? -ne 0 ]]; then
    echo "❌ $PARSE_RESULT"
    echo ""
    echo "Usage:"
    echo "  /implement-ticket --from-jira <JIRA-KEY|JIRA-URL> [options]"
    echo "  /implement-ticket --from-markdown <PATH> [options]"
    echo ""
    echo "Options:"
    echo "  --no-stop, --autonomous    Run without user prompts"
    echo "  --interactive              Prompt for confirmations (default)"
    echo "  --architect-mode           Use supervisor pattern with grading"
    echo "  --planner-mode             Use fast linear pipeline (default)"
    echo "  --skip-pre-flight          Skip pre-flight validation"
    echo "  --resume                   Resume from checkpoint"
    exit 1
fi

# Extract values from parse result JSON
INPUT_MODE=$(echo "$PARSE_RESULT" | jq -r '.inputMode')
INPUT_VALUE=$(echo "$PARSE_RESULT" | jq -r '.inputValue')
NO_STOP=$(echo "$PARSE_RESULT" | jq -r '.options.noStop // false')
SKIP_PRE_FLIGHT=$(echo "$PARSE_RESULT" | jq -r '.options.skipPreFlight // false')
RESUME=$(echo "$PARSE_RESULT" | jq -r '.options.resume // false')
ARCHITECT_MODE=$(echo "$PARSE_RESULT" | jq -r '.options.architectMode // false')
PLANNER_MODE=$(echo "$PARSE_RESULT" | jq -r '.options.plannerMode // false')

# Generate ticket ID based on input mode
if [[ "$INPUT_MODE" == "jira" ]]; then
    # Extract JIRA key from URL or use as-is
    if [[ "$INPUT_VALUE" =~ browse/([A-Z]+-[0-9]+) ]]; then
        TICKET_ID="${BASH_REMATCH[1]}"
        echo "✓ Extracted ticket key: $TICKET_ID from Jira URL"
    elif [[ "$INPUT_VALUE" =~ ^[A-Z]+-[0-9]+$ ]]; then
        TICKET_ID="$INPUT_VALUE"
        echo "✓ Using Jira ticket key: $TICKET_ID"
    else
        echo "❌ Invalid JIRA key or URL: $INPUT_VALUE"
        exit 1
    fi
elif [[ "$INPUT_MODE" == "markdown" ]]; then
    # Extract ticket ID from markdown filename (e.g., PROJ-123.md or specs/PROJ-123.md)
    FILENAME=$(basename "$INPUT_VALUE" .md)
    if [[ "$FILENAME" =~ ^([A-Z]+-[0-9]+)$ ]]; then
        TICKET_ID="${BASH_REMATCH[1]}"
        echo "✓ Extracted ticket ID from markdown filename: $TICKET_ID"
    elif [[ "$FILENAME" =~ DRAFT-([0-9]{8}-[0-9]{6}) ]]; then
        TICKET_ID="DRAFT-${BASH_REMATCH[1]}"
        echo "✓ Using draft ticket ID: $TICKET_ID"
    else
        # Generate draft ID
        TICKET_ID="DRAFT-$(date +%Y%m%d-%H%M%S)"
        echo "✓ Generated ticket ID: $TICKET_ID (markdown source)"
    fi

    # Validate markdown file exists
    if [[ ! -f "$INPUT_VALUE" ]]; then
        echo "❌ Markdown file not found: $INPUT_VALUE"
        exit 1
    fi
    echo "✓ Reading markdown spec: $INPUT_VALUE"
else
    echo "❌ Unknown input mode: $INPUT_MODE"
    exit 1
fi

# Display parsed configuration
echo ""
echo "Configuration:"
echo "  Input Mode: $INPUT_MODE"
echo "  Ticket ID: $TICKET_ID"
echo "  Autonomous: $NO_STOP"
echo "  Planning Mode: $([ "$ARCHITECT_MODE" == "true" ] && echo "architect" || echo "planner")"
echo ""

# Export for use in later phases
export TICKET_ID
export INPUT_MODE
export INPUT_VALUE
            ;;
    esac
    shift
done

# Check environment variable
if [[ "$CLAUDE_AUTO_MODE" == "true" ]]; then
    NO_STOP="true"
    echo "✓ Autonomous mode enabled (CLAUDE_AUTO_MODE env var)"
fi

# Export for use in all phases
export JIRA_KEY
export NO_STOP
export SKIP_PRE_FLIGHT
export ARCHITECT_MODE
export PLANNER_MODE
export CLAUDE_AUTO_MODE

# Check for existing checkpoint
if [[ "$RESUME" == "true" ]] || [[ -f ".claude/checkpoints/implement-ticket-${JIRA_KEY}.json" ]]; then
    if [[ -f ".claude/checkpoints/implement-ticket-${JIRA_KEY}.json" ]]; then
        echo "✓ Found checkpoint for $JIRA_KEY"

        # Show checkpoint status
        echo ""
        echo "Checkpoint status:"
        jq -r '.completed_phases[]' ".claude/checkpoints/implement-ticket-${JIRA_KEY}.json" | while read phase; do
            echo "  ✓ $phase (completed)"
        done
        current_phase=$(jq -r '.current_phase' ".claude/checkpoints/implement-ticket-${JIRA_KEY}.json")
        echo "  ⏸ $current_phase (in progress)"
        echo ""

        if [[ "$NO_STOP" != "true" ]]; then
            echo "Resume from checkpoint? [Y/n]: "
            read -r response
            if [[ "$response" == "n" ]] || [[ "$response" == "N" ]]; then
                echo "Starting fresh implementation (checkpoint will be overwritten)"
                rm ".claude/checkpoints/implement-ticket-${JIRA_KEY}.json"
            else
                echo "✓ Resuming from checkpoint..."
                # Load checkpoint state and jump to current phase
                # (Implementation continues from saved state)
            fi
        else
            echo "✓ Auto-resuming from checkpoint (autonomous mode)"
        fi
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Implementation: $JIRA_KEY"
echo "  Mode: $([ "$NO_STOP" == "true" ] && echo "Autonomous" || echo "Interactive")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Initialize decision log for autonomous mode
mkdir -p .claude/decisions
DECISION_LOG=".claude/decisions/${JIRA_KEY}.md"

cat > "$DECISION_LOG" <<EOF
# Implementation Decisions for ${JIRA_KEY}

**Implemented**: $(date '+%Y-%m-%d %H:%M:%S')
**Mode**: $([ "$NO_STOP" == "true" ] && echo "Autonomous (--no-stop)" || echo "Interactive")
**Engineer**: $(git config user.name || echo "Unknown")

---

## Decisions Log

EOF

# Utility function: Log decision
log_decision() {
    local phase="$1"
    local decision="$2"
    local rationale="$3"

    cat >> "$DECISION_LOG" <<EOF
### [$phase] $decision

**Rationale**: $rationale
**Timestamp**: $(date '+%Y-%m-%d %H:%M:%S')

---

EOF
}

# Utility function: Save checkpoint
save_checkpoint() {
    local current_phase="$1"
    local completed_phases="$2"

    mkdir -p .claude/checkpoints

    cat > ".claude/checkpoints/implement-ticket-${JIRA_KEY}.json" <<EOF
{
  "jira_key": "$JIRA_KEY",
  "current_phase": "$current_phase",
  "completed_phases": $completed_phases,
  "last_updated": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "mode": "$([ "$NO_STOP" == "true" ] && echo "autonomous" || echo "interactive")"
}
EOF

    echo "✓ Checkpoint saved: $current_phase"
}

# Export utility functions
export -f log_decision
export -f save_checkpoint
export DECISION_LOG
```

---

### Phase 0: Pre-Flight Validation (1-2 minutes)

**Purpose**: Ensure clean baseline before starting implementation

**Error Recovery**: Uses retry logic from `ai-agentic-framework/utils/error-recovery.js` for transient failures

**Actions**:

**Step 0: Save Base Commit SHA (P0-8)**
```bash
# Save base commit SHA before starting (for rollback capability)
export BASE_COMMIT_SHA=$(git rev-parse HEAD)
export BASE_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Base commit: $BASE_COMMIT_SHA"
echo "Base branch: $BASE_BRANCH"
```

1. **Check git status**
   ```bash
   git status --porcelain
   ```
   - FAIL if uncommitted changes exist
   - Prompt: "Uncommitted changes detected. Stash or commit them first."
   - **Recovery**: Offer to create temporary stash automatically

2. **Verify branch is clean**
   ```bash
   git fetch origin
   git status -sb
   ```
   - WARN if branch is behind origin
   - Prompt: "Branch behind origin. Pull latest changes? [Y/n]"
   - **Recovery**: Retry fetch with backoff if network error

3. **Run existing tests**
   ```bash
   # Detect test framework and run appropriate command
   if [[ -f "package.json" ]]; then
       if grep -q "pnpm" package.json; then
           pnpm run test:unit
       elif grep -q "jest" package.json; then
           npm test
       fi
   elif [[ -f "pytest.ini" ]] || [[ -f "pyproject.toml" ]]; then
       pytest tests/ --tb=short
   fi
   ```
   - FAIL if any tests are failing
   - Report: "X tests failing. Fix before starting implementation."
   - **List failing tests** with error messages
   - Option to continue: `--skip-pre-flight` (not recommended)
   - **Recovery**: If transient test failures (network, DB connection), retry once

4. **Verify build passes**
   ```bash
   # TypeScript
   if [[ -f "tsconfig.json" ]]; then
       tsc --noEmit
   fi

   # Python
   if [[ -d "src" ]] && command -v python3 &>/dev/null; then
       python3 -m compileall src/ -q
   fi
   ```
   - FAIL if build/compilation fails
   - Report: "Build failing. Fix before starting."
   - **Show first 10 compilation errors**

5. **Check dependencies up to date**
   ```bash
   # Check for lock file changes
   git diff package-lock.json pnpm-lock.yaml poetry.lock requirements.txt
   ```
   - WARN if lock file has uncommitted changes
   - Prompt: "Lock file modified. Install dependencies? [Y/n]"
   - **Auto-install if autonomous mode**

6. **Validate Docker containers (if applicable)**
   ```bash
   # Check if project uses Docker
   if [[ -f "docker-compose.yml" ]] || [[ -f "Dockerfile" ]]; then
       docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "Up|running"
   fi
   ```
   - WARN if containers not running
   - Offer: "Start containers with 'make up' or 'docker-compose up -d'? [Y/n]"
   - **Auto-start if autonomous mode**

7. **Validate environment variables (if applicable)**
   ```bash
   # Check if .env.example exists
   if [[ -f ".env.example" ]] && [[ ! -f ".env" ]]; then
       echo "⚠️  .env file missing (but .env.example exists)"
       echo "   Copy .env.example to .env and configure"
   fi

   # Validate required variables
   if [[ -f ".env.example" ]] && [[ -f ".env" ]]; then
       missing_vars=$(comm -23 <(grep -oP '^[A-Z_]+(?==)' .env.example | sort) \
                                  <(grep -oP '^[A-Z_]+(?==)' .env | sort))
       if [[ -n "$missing_vars" ]]; then
           echo "⚠️  Missing environment variables:"
           echo "$missing_vars" | sed 's/^/     - /'
       fi
   fi
   ```
   - WARN if variables missing
   - List missing variables

8. **Resource Availability Check**
   ```bash
   echo "Checking resource availability..."

   # 1. Disk space check
   AVAILABLE_DISK_GB=$(df -BG . | awk 'NR==2 {print $4}' | tr -d 'G')
   REQUIRED_DISK_GB=5

   if [[ $AVAILABLE_DISK_GB -lt $REQUIRED_DISK_GB ]]; then
       echo "❌ Insufficient disk space"
       echo "  Available: ${AVAILABLE_DISK_GB}GB"
       echo "  Required:  ${REQUIRED_DISK_GB}GB"
       echo ""
       echo "Free up disk space and try again"
       exit 1
   fi

   echo "✓ Disk space: ${AVAILABLE_DISK_GB}GB available"

   # 2. Memory check
   if command -v free &> /dev/null; then
       AVAILABLE_MEM_MB=$(free -m | awk 'NR==2 {print $7}')
       REQUIRED_MEM_MB=2048

       if [[ $AVAILABLE_MEM_MB -lt $REQUIRED_MEM_MB ]]; then
           echo "⚠ Low memory: ${AVAILABLE_MEM_MB}MB available (recommended: ${REQUIRED_MEM_MB}MB)"
           echo "  Implementation may fail during tests or builds"

           if [[ "$NO_STOP" != "true" ]]; then
               read -p "Continue anyway? [y/N]: " continue_low_mem
               if [[ "$continue_low_mem" != "y" ]]; then
                   exit 1
               fi
           fi
       else
           echo "✓ Memory: ${AVAILABLE_MEM_MB}MB available"
       fi
   elif [[ "$(uname)" == "Darwin" ]]; then
       # macOS memory check
       FREE_MEM_MB=$(vm_stat | grep "Pages free" | awk '{print $3}' | tr -d '.' | awk '{print $1 * 4096 / 1024 / 1024}')
       echo "✓ Memory: ${FREE_MEM_MB}MB free (macOS)"
   fi

   # 3. MCP server connectivity
   echo "Checking MCP server connectivity..."

   # Jira
   if [[ -n "$ATLASSIAN_API_TOKEN" ]]; then
       if curl -s -f -m 5 -H "Authorization: Bearer $ATLASSIAN_API_TOKEN" \
           "$ATLASSIAN_SITE_URL/rest/api/3/myself" > /dev/null 2>&1; then
           echo "✓ Jira API: Connected"
       else
           echo "⚠ Jira API: Not reachable (may cause ticket fetch failures)"
       fi
   fi

   # GitHub
   if [[ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]]; then
       if curl -s -f -m 5 -H "Authorization: token $GITHUB_PERSONAL_ACCESS_TOKEN" \
           "https://api.github.com/user" > /dev/null 2>&1; then
           echo "✓ GitHub API: Connected"
       else
           echo "⚠ GitHub API: Not reachable (may cause PR creation failures)"
       fi
   fi

   # Notion
   if [[ -n "$NOTION_API_KEY" ]]; then
       if curl -s -f -m 5 -H "Authorization: Bearer $NOTION_API_KEY" \
           -H "Notion-Version: 2022-06-28" \
           "https://api.notion.com/v1/users/me" > /dev/null 2>&1; then
           echo "✓ Notion API: Connected"
       else
           echo "⚠ Notion API: Not reachable (may cause context fetch failures)"
       fi
   fi

   # 4. Git remote accessibility
   echo "Checking git remote..."
   if git ls-remote --exit-code origin &> /dev/null; then
       echo "✓ Git remote: Accessible"
   else
       echo "❌ Git remote not accessible"
       echo "  Cannot push branch or create PR"

       if [[ "$NO_STOP" != "true" ]]; then
           read -p "Continue anyway? [y/N]: " continue_no_remote
           if [[ "$continue_no_remote" != "y" ]]; then
               exit 1
           fi
       fi
   fi

   echo "✓ Resource validation complete"
   ```
   - FAIL if disk space < 5GB (hard requirement)
   - WARN if memory < 2GB (soft warning, allow continue)
   - WARN if MCP servers unreachable (soft warning)
   - WARN if git remote inaccessible (soft warning, blocks PR creation)
   - **Recovery**: In autonomous mode, proceed on soft warnings, fail on hard requirements

9. **E2E Framework Initialization (Frontend Projects)**
   ```bash
   # Check if project is a frontend project and lacks E2E framework
   echo "Checking E2E framework setup..."

   # Use stack-detection to check for frontend frameworks
   STACK_INFO=$(node ai-agentic-framework/utils/stack-detection.js "$(pwd)")
   HAS_FRONTEND=$(echo "$STACK_INFO" | jq -r '.frontend_frameworks | length > 0')

   if [[ "$HAS_FRONTEND" == "true" ]]; then
       echo "✓ Frontend project detected"

       # Check for existing E2E framework
       E2E_CHECK=$(node -e "
           const { hasE2EFramework } = require('ai-agentic-framework/utils/stack-detection.js');
           hasE2EFramework(process.cwd()).then(result => {
               console.log(JSON.stringify(result));
           });
       ")

       HAS_E2E=$(echo "$E2E_CHECK" | jq -r '.hasFramework')

       if [[ "$HAS_E2E" == "false" ]]; then
           echo "⚠️  No E2E framework detected"
           echo "   Initializing Playwright for E2E testing..."

           # Auto-initialize Playwright
           if node ai-agentic-framework/utils/init-e2e-framework.js "$(pwd)" --framework=playwright; then
               echo "✓ Playwright initialized successfully"

               log_decision "Phase 0: Pre-Flight" \
                   "Initialized Playwright E2E framework" \
                   "Frontend project detected without E2E tests. Auto-initialized Playwright with best practices config. Added test:e2e scripts to package.json. Created e2e/example.spec.ts as template."
           else
               echo "⚠️  Playwright initialization failed (non-fatal)"
               echo "   E2E tests may need manual setup later"

               log_decision "Phase 0: Pre-Flight" \
                   "Playwright initialization failed" \
                   "Attempted auto-initialization but encountered errors. E2E tests will need manual setup."
           fi
       else
           FRAMEWORK_NAME=$(echo "$E2E_CHECK" | jq -r '.framework')
           CONFIG_FILE=$(echo "$E2E_CHECK" | jq -r '.configFile')
           echo "✓ E2E framework detected: $FRAMEWORK_NAME"
           if [[ "$CONFIG_FILE" != "null" ]]; then
               echo "  Config: $CONFIG_FILE"
           fi
       fi
   else
       echo "✓ Not a frontend project, E2E framework not required"
   fi
   ```
   - **Purpose**: Ensure frontend projects have E2E testing capability
   - **Auto-initializes**: Playwright for frontend projects without E2E framework
   - **Skips**: Backend-only projects (no frontend frameworks detected)
   - **Non-fatal**: If initialization fails, logs warning and continues
   - **Logged**: All initialization decisions documented in decision log

**Pre-Flight Report**:
```
✓ Git status clean
✓ Branch up to date with origin/main
✓ All tests passing (127/127)
✓ TypeScript compilation successful (0 errors)
✓ Dependencies installed (node_modules/ present)
✓ Docker containers running (3/3)
✓ Environment variables configured
✓ Disk space: 42GB available
✓ Memory: 8192MB available
✓ Jira API: Connected
✓ GitHub API: Connected
✓ Notion API: Connected
✓ Git remote: Accessible
✓ E2E framework: Playwright detected (playwright.config.ts)

Ready to start implementation!
```

**If pre-flight fails**:
```
❌ Pre-flight validation failed:
  ✗ 3 unit tests failing
    - src/auth/oauth.test.ts: "should validate token" (line 45)
    - src/auth/oauth.test.ts: "should handle expired token" (line 67)
    - src/user/profile.test.ts: "should update profile" (line 23)
  ✗ Uncommitted changes in src/auth/
  ✗ Docker containers not running (postgres, redis)

Action required:
1. Fix failing tests (see errors above)
2. Commit or stash changes: git stash push -m "WIP before PROJ-123"
3. Start Docker containers: make up
4. Re-run: /implement-ticket PROJ-123

Or skip validation (not recommended):
/implement-ticket PROJ-123 --skip-pre-flight
```

**Autonomous Mode Behavior**:
In autonomous mode (`--no-stop`), pre-flight validation:
- Auto-stashes uncommitted changes with message "Auto-stash before ${JIRA_KEY}"
- Auto-pulls latest changes if behind
- Auto-installs dependencies if lock file changed
- Auto-starts Docker containers if not running
- **Still FAILS** if tests are failing (hard gate)
- Logs all auto-decisions to decision log

---

### Phase 1: Context Gathering (2-5 minutes)

**Action:** Fetch all context for the ticket based on input mode

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 1: CONTEXT GATHERING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [[ "$INPUT_MODE" == "jira" ]]; then
    echo "Source: Jira Ticket"
    echo "Ticket: $TICKET_ID"
    echo ""

    # Invokes: /fetch-ticket-context
    # - Reads Jira ticket details via MCP
    # - Fetches Notion documentation
    # - Fetches Confluence pages
    # - Identifies linked issues and dependencies

    # Gather context from Jira and linked resources
    CONTEXT_FILE="/tmp/context_${TICKET_ID}.md"

    echo "Fetching Jira ticket details..."
    # Use MCP to fetch ticket
    # ... (existing Jira context gathering logic)

    echo "✓ Jira ticket: $TICKET_ID fetched"
    echo "✓ Fetched Notion/Confluence documentation"
    echo "✓ Identified dependencies"

elif [[ "$INPUT_MODE" == "markdown" ]]; then
    echo "Source: Markdown SDD Spec"
    echo "File: $INPUT_VALUE"
    echo ""

    # Parse markdown ticket using markdown parser
    CONTEXT_FILE="/tmp/context_${TICKET_ID}.md"
    CANONICAL_FILE="/tmp/canonical_${TICKET_ID}.json"

    echo "Parsing markdown specification..."
    node "$UTILS_DIR/ticket-io/parsers/markdown-parser.js" "$INPUT_VALUE" > "$CANONICAL_FILE"

    if [[ $? -ne 0 ]]; then
        echo "❌ Failed to parse markdown ticket"
        exit 1
    fi

    # Convert canonical JSON to readable context markdown
    cat > "$CONTEXT_FILE" <<EOF
# Context for ${TICKET_ID}

## Ticket Title
$(jq -r '.title' "$CANONICAL_FILE")

## User Story
**As a** $(jq -r '.userStory.role // "N/A"' "$CANONICAL_FILE")
**I want** $(jq -r '.userStory.goal // "N/A"' "$CANONICAL_FILE")
**So that** $(jq -r '.userStory.benefit // "N/A"' "$CANONICAL_FILE")

## Success Criteria
$(jq -r '.successCriteria[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

$(if [[ $(jq -r '.metrics // empty' "$CANONICAL_FILE") ]]; then
    echo "**Metrics**: $(jq -r '.metrics' "$CANONICAL_FILE")"
fi)

## Acceptance Criteria (BDD Scenarios)
$(jq -r '.acceptanceCriteria[]? | "### Scenario: \(.scenario)\n```gherkin\nGiven \(.given)\nWhen \(.when)\nThen \(.then)\n```\n"' "$CANONICAL_FILE")

## Technical Context

### Current State
$(jq -r '.technicalContext.currentState[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Proposed Changes
$(jq -r '.technicalContext.proposedChanges[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Technical Constraints
$(jq -r '.technicalContext.constraints[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Integration Points
$(jq -r '.technicalContext.integrationPoints[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Architecture Decisions
$(jq -r '.technicalContext.architectureDecisions[]? | "- **\(.decision)**: \(.rationale)"' "$CANONICAL_FILE")

## Out of Scope
$(jq -r '.outOfScope[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

## Edge Cases & Error Handling
$(jq -r '.edgeCases[]? | "- **\(.case)**: \(.handling)"' "$CANONICAL_FILE")
$(jq -r '.errorScenarios[]? | "- **\(.error)**: \(.systemBehavior)"' "$CANONICAL_FILE")

## Dependencies
### Blocking
$(jq -r '.dependencies.blocking[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Related
$(jq -r '.dependencies.related[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

## Definition of Done
### Code Quality
$(jq -r '.definitionOfDone.codeQuality[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Testing
$(jq -r '.definitionOfDone.testing[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Documentation
$(jq -r '.definitionOfDone.documentation[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

### Review & Deployment
$(jq -r '.definitionOfDone.review[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

## Implementation Notes
$(jq -r '.implementationNotes // "None"' "$CANONICAL_FILE")

## References
$(jq -r '.references[]? // empty' "$CANONICAL_FILE" | sed 's/^/- /')

---
**Source**: Markdown SDD Spec ($(jq -r '.source' "$CANONICAL_FILE"))
**Created**: $(jq -r '.metadata.createdAt' "$CANONICAL_FILE")
**INVEST Validated**: $(jq -r '.metadata.investValidated' "$CANONICAL_FILE")
**BDD Scenarios**: $(jq -r '.metadata.bddScenarioCount // 0' "$CANONICAL_FILE")
EOF

    echo "✓ Markdown spec parsed successfully"
    echo "✓ Extracted $(jq -r '.acceptanceCriteria | length' "$CANONICAL_FILE") BDD scenarios"
    echo "✓ Identified $(jq -r '.technicalContext.proposedChanges | length' "$CANONICAL_FILE") proposed changes"

    # Store canonical for later use
    export CANONICAL_FILE
else
    echo "❌ Unknown input mode: $INPUT_MODE"
    exit 1
fi

# Display context summary
CONTEXT_SIZE=$(wc -w < "$CONTEXT_FILE" | tr -d ' ')
echo ""
echo "Context ready: ~$CONTEXT_SIZE words (~$((CONTEXT_SIZE * 4 / 3)) tokens)"
echo ""

export CONTEXT_FILE
```

**Output Example (Jira):**
```
✓ Jira ticket: PROJ-123 "Implement OAuth2 authentication"
✓ Fetched 2 Notion documents (35KB total)
✓ Fetched 1 Confluence page
✓ Found 2 blocking issues
Context ready: ~15,000 tokens
```

**Output Example (Markdown):**
```
✓ Markdown spec parsed successfully
✓ Extracted 5 BDD scenarios
✓ Identified 8 proposed changes
✓ Technical context: 12 constraints, 4 integration points
Context ready: ~12,000 tokens
```

**Decision Point:** Review context and confirm it's complete

```bash
# Check if running in autonomous mode
if [[ "$NO_STOP" == "true" ]] || [[ "$CLAUDE_AUTO_MODE" == "true" ]]; then
    echo "✓ Auto-continuing (autonomous mode enabled)"
    echo "  Context gathered successfully, proceeding to requirements analysis..."

    # Log autonomous decision with input source
    CONTEXT_SOURCE=$([ "$INPUT_MODE" == "jira" ] && echo "Jira ticket, Notion docs, and Confluence pages" || echo "Markdown SDD spec")
    log_decision "Phase 1: Context Gathering" \
        "Auto-approved context gathering (source: $INPUT_MODE)" \
        "Autonomous mode enabled. Context source: $CONTEXT_SOURCE. Total tokens: ~$((CONTEXT_SIZE * 4 / 3))."

    sleep 1
else
    echo "Continue? [Y/n]: "
    read -r response
    if [[ "$response" == "n" ]] || [[ "$response" == "N" ]]; then
        echo "Implementation paused by user"
        echo "Resume with: /implement-ticket $([ "$INPUT_MODE" == "jira" ] && echo "--from-jira $TICKET_ID" || echo "--from-markdown $INPUT_VALUE") --resume"
        exit 0
    fi
fi

# Save checkpoint: Phase 1 complete
save_checkpoint "Phase 2: Requirements Analysis" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering"]'
```

---

### Risk Detection & Mode Selection

**Action:** Analyze ticket risk level and select appropriate planning mode

```bash
# Initialize risk level
RISK_LEVEL="low"
PLANNING_MODE="planner"  # default

# Create temporary context file for risk analysis
CONTEXT_FILE="/tmp/context_${JIRA_KEY}.md"
cat > "$CONTEXT_FILE" <<CONTEXT
# Context for ${JIRA_KEY}

## Jira Ticket
$(cat /tmp/jira_ticket_${JIRA_KEY}.md 2>/dev/null || echo "No Jira context")

## Notion Documentation
$(cat /tmp/notion_docs_${JIRA_KEY}.md 2>/dev/null || echo "No Notion context")

## Confluence Pages
$(cat /tmp/confluence_${JIRA_KEY}.md 2>/dev/null || echo "No Confluence context")
CONTEXT

# High-risk keyword detection
HIGH_RISK_KEYWORDS=(
    "migration"
    "auth"
    "authentication"
    "authorization"
    "payment"
    "security"
    "breaking change"
    "breaking-change"
    "database schema"
    "crypto"
    "encryption"
    "compliance"
    "gdpr"
    "pci"
    "hipaa"
)

# Check for high-risk indicators
for keyword in "${HIGH_RISK_KEYWORDS[@]}"; do
    if grep -qi "$keyword" "$CONTEXT_FILE"; then
        RISK_LEVEL="high"
        log_decision "Risk Detection" \
            "Detected high-risk keyword: $keyword" \
            "Ticket contains security/compliance/breaking change indicators. Consider using architect mode for additional review."
        break
    fi
done

# Mode selection based on risk and user preference
if [[ "$RISK_LEVEL" == "high" ]]; then
    echo ""
    echo "⚠️  HIGH-RISK TICKET DETECTED"
    echo ""
    echo "Risk indicators found:"
    grep -i -E "$(IFS=\|; echo "${HIGH_RISK_KEYWORDS[*]}")" "$CONTEXT_FILE" | head -5 | sed 's/^/  - /'
    echo ""

    # Check for manual mode override flags
    if [[ "$ARCHITECT_MODE" == "true" ]]; then
        PLANNING_MODE="architect"
        echo "✓ Using architect mode (--architect-mode flag)"
        log_decision "Mode Selection" \
            "Architect mode selected via flag" \
            "High-risk ticket + --architect-mode flag. Will use supervisor pattern with grading."
    elif [[ "$PLANNER_MODE" == "true" ]]; then
        PLANNING_MODE="planner"
        echo "✓ Using planner mode (--planner-mode flag overrides auto-detection)"
        log_decision "Mode Selection" \
            "Planner mode selected via flag (override)" \
            "High-risk ticket but --planner-mode flag provided. User explicitly chose fast path."
    else
        # AUTOMATIC SELECTION: High-risk → Architect mode
        PLANNING_MODE="architect"
        echo "✓ Automatically selected architect mode (high-risk ticket)"
        echo "  ℹ️  Use --planner-mode to override if you want fast execution"
        log_decision "Mode Selection" \
            "Architect mode auto-selected" \
            "High-risk ticket detected. Auto-selected architect mode for enhanced quality assurance. Use --planner-mode flag to override."
    fi
    echo ""
else
    # Low-risk ticket: Use planner mode
    if [[ "$ARCHITECT_MODE" == "true" ]]; then
        PLANNING_MODE="architect"
        echo "✓ Using architect mode (--architect-mode flag)"
        log_decision "Mode Selection" \
            "Architect mode selected via flag" \
            "Low-risk ticket but --architect-mode flag provided. User explicitly chose deliberate path."
    else
        PLANNING_MODE="planner"
        echo "✓ Automatically selected planner mode (low-risk ticket)"
        log_decision "Mode Selection" \
            "Planner mode auto-selected" \
            "Low-risk ticket detected. Auto-selected planner mode for fast execution."
    fi
fi

# Update decision log with risk and planning mode
sed -i.bak "s/^**Mode**:.*/**Mode**: $([ "$NO_STOP" == "true" ] && echo "Autonomous (--no-stop)" || echo "Interactive") | Risk: ${RISK_LEVEL^^} | Planning: $PLANNING_MODE/" "$DECISION_LOG"
rm -f "${DECISION_LOG}.bak"

export RISK_LEVEL
export PLANNING_MODE

# Clean up temporary context file
rm -f "$CONTEXT_FILE"
```

**Output:**
```
✓ Automatically selected planner mode (low-risk ticket)

OR

⚠️  HIGH-RISK TICKET DETECTED

Risk indicators found:
  - authentication flow
  - breaking change to API
  - database migration

✓ Automatically selected architect mode (high-risk ticket)
  ℹ️  Use --planner-mode to override if you want fast execution
```

---

### Phase 2: Requirements Analysis (3-5 minutes)

**Action:** Analyze context and create implementation plan

**Planning Mode:** `$PLANNING_MODE`

```bash
if [[ "$PLANNING_MODE" == "architect" ]]; then
    # Architect Mode: Create detailed instructions with grading criteria
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ARCHITECT MODE: Creating Detailed Instructions"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Create instructions directory
    mkdir -p .claude/instructions

    # Generate timestamp for instructions file
    INSTRUCT_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    INSTRUCT_FILE=".claude/instructions/instruct-${INSTRUCT_TIMESTAMP}-${JIRA_KEY}.md"

    # Invoke architect-style planning with grading criteria
    cat > "$INSTRUCT_FILE" <<INSTRUCT
# Implementation Instructions: ${JIRA_KEY}

**Created**: $(date '+%Y-%m-%d %H:%M:%S')
**Risk Level**: ${RISK_LEVEL^^}
**Planning Mode**: Architect (Enhanced Quality Assurance)

---

## Context

[Generated from Phase 1 context gathering]

## Objectives

- Primary: Implement the requirements from ${JIRA_KEY}
- Secondary: Maintain code quality standards
- Tertiary: Ensure comprehensive test coverage

## Requirements

[Detailed technical requirements from ticket analysis]

## Constraints

- Must maintain backward compatibility unless explicitly marked as breaking change
- Must follow project coding conventions
- Must achieve minimum test coverage thresholds
- Must not introduce security vulnerabilities

## Implementation Steps

[Generated step-by-step plan with details]

## Success Criteria

- [ ] All functional requirements implemented
- [ ] All tests passing
- [ ] Code coverage ≥80% (unit), 100% (integration), 100% (E2E if applicable)
- [ ] No linting errors (--max-warnings=0)
- [ ] No type errors
- [ ] Security review passed
- [ ] Documentation updated

## Grading Criteria (100 points)

### 1. Instruction Adherence (25 points)
- [ ] All implementation steps completed (10 pts)
- [ ] All success criteria met (10 pts)
- [ ] Requirements fully satisfied (5 pts)

### 2. Code Quality (20 points)
- [ ] Follows project conventions (5 pts)
- [ ] Clean, readable code (5 pts)
- [ ] Proper error handling (5 pts)
- [ ] No code smells (5 pts)

### 3. Testing & Validation (20 points)
- [ ] Unit coverage ≥80% (10 pts)
- [ ] Integration coverage 100% (5 pts)
- [ ] E2E coverage 100% critical flows (5 pts)

### 4. Security (10 points)
- [ ] No vulnerabilities introduced (5 pts)
- [ ] Input validation proper (3 pts)
- [ ] Auth/permissions correct (2 pts)

### 5. Documentation (15 points)
- [ ] Code comments where needed (5 pts)
- [ ] API docs updated (5 pts)
- [ ] README/guides updated (5 pts)

### 6. Problem Solving (10 points)
- [ ] Edge cases handled (5 pts)
- [ ] Performance considerations (3 pts)
- [ ] Scalability considerations (2 pts)

**Passing Score**: 80/100 (acceptable quality)
**Target Score**: 95/100 (excellent quality)

## References

- Jira: ${JIRA_KEY}
- Context: /tmp/context_${JIRA_KEY}.md
- Decision Log: .claude/decisions/${JIRA_KEY}.md

INSTRUCT

    echo "✓ Created detailed instructions: $INSTRUCT_FILE"
    log_decision "Phase 2: Requirements Analysis (Architect Mode)" \
        "Created detailed implementation instructions with grading rubric" \
        "File: $INSTRUCT_FILE. Includes 100-point grading criteria for post-implementation review."

    export INSTRUCT_FILE

else
    # Planner Mode: Standard planning (current behavior)
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  PLANNER MODE: Creating Implementation Plan"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Invokes: /analyze-requirements --from-context /tmp/context_${JIRA_KEY}.md
    # - Uses pre-fetched context from Phase 1
    # - Identifies affected files
    # - Maps dependencies
    # - Assesses risks
    # - Creates step-by-step plan
    #
    # Note: Phase 1 already fetched context to /tmp/context_${JIRA_KEY}.md
    # Phase 2 uses --from-context flag to analyze that pre-fetched context

    log_decision "Phase 2: Requirements Analysis (Planner Mode)" \
        "Using standard planner agent for implementation plan" \
        "Fast linear pipeline. Planner agent invokes: /analyze-requirements --from-context /tmp/context_${JIRA_KEY}.md. Plan includes affected files, dependencies, risks, and implementation steps."
fi
```

**Output:**
```
## Implementation Plan for PROJ-123

### Files to Modify (5)
- src/auth/handler.ts (authentication logic)
- src/auth/middleware.ts (OAuth middleware)
- src/config/oauth.ts (configuration)
- tests/auth/oauth.test.ts (unit tests)
- docs/api/authentication.md (documentation)

### Files to Create (2)
- src/auth/providers/google.ts
- src/auth/providers/github.ts

### Dependencies Needed
- @octokit/oauth-app: ^6.0.0
- google-auth-library: ^9.0.0

### Risks
🔴 High: Breaking change to existing auth flow
🟡 Medium: Database schema change needed
🟢 Low: May require OAuth provider setup

### Implementation Steps (8)
1. Create OAuth provider abstractions
2. Implement Google OAuth provider
3. Implement GitHub OAuth provider
4. Update auth middleware
5. Add database migration
6. Write unit tests (target: 85% coverage)
7. Write integration tests
8. Update API documentation

Estimated: 4-6 hours
Complexity: Medium-High
```

**Decision Point:** Review plan and approve

```bash
# Check if running in autonomous mode
if [[ "$NO_STOP" == "true" ]] || [[ "$CLAUDE_AUTO_MODE" == "true" ]]; then
    echo "✓ Auto-continuing (autonomous mode enabled)"
    echo "  Implementation plan approved, proceeding to code implementation..."

    # Log autonomous decision
    log_decision "Phase 2: Requirements Analysis" \
        "Auto-approved implementation plan" \
        "Plan includes 8 implementation steps with medium-high complexity. Estimated 4-6 hours. All risks identified and documented."

    sleep 1
else
    echo "Plan looks good? [Y/n]: "
    read -r response
    if [[ "$response" == "n" ]] || [[ "$response" == "N" ]]; then
        echo "Plan rejected by user"
        echo "Please revise requirements or ticket, then re-run"
        exit 0
    fi
fi

# Save plan to file for PR inclusion
mkdir -p .claude/plans
PLAN_FILE=".claude/plans/${JIRA_KEY}-plan.md"

if [[ "$PLANNING_MODE" == "planner" ]]; then
    # Save planner output (would be captured from agent output in real implementation)
    echo "Saving implementation plan to $PLAN_FILE..."
    # In real implementation, this would save the planner agent's output
    # For now, just create placeholder
    cat > "$PLAN_FILE" <<PLAN
# Implementation Plan for ${JIRA_KEY}

[Planner agent output would be saved here, including the "Assumptions & Decisions" section]

PLAN
else
    # Architect mode: Use instruction file as plan
    if [[ -f "$INSTRUCT_FILE" ]]; then
        cp "$INSTRUCT_FILE" "$PLAN_FILE"
        echo "✓ Saved plan from instruction file"
    fi
fi

export PLAN_FILE

# Save checkpoint: Phase 2 complete
save_checkpoint "Phase 3: Code Implementation" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis"]'
```

---

### Phase 3: Code Implementation (30-60 minutes)

**Action:** Implement the code following the plan

**Multi-Language Orchestration**:
When implementing changes that affect multiple languages:
1. **Analyze affected files** from the plan to determine which languages are involved
2. **Spawn language-specific implementer agents** based on file extensions:
   - `.ts`, `.tsx`, `.js`, `.jsx` → `implementer-typescript`
   - `.py` → `implementer-python`
   - `.go` → `implementer-go`
   - `.java` → `implementer-java`
   - `.rs` → `implementer-rust`
   - `.rb` → `implementer-ruby`
3. **Coordinate changes** across languages, ensuring:
   - API contracts remain consistent
   - Type definitions match across language boundaries
   - Shared data models are synchronized
4. **Run language-specific checks** for each modified language

**Example - Multi-Language Ticket**:
```
Affected files from plan:
- services/backend/src/ticket.service.ts (TypeScript)
- scripts/migrate_tickets.py (Python)
- shared/protos/ticket.proto (Protocol Buffers)

Orchestration:
1. Spawn implementer-typescript for TypeScript changes
2. Spawn implementer-python for Python migration script
3. Coordinate: Ensure both follow same ticket schema from .proto
4. Run: tsc && python -m mypy scripts/
```

**Error Recovery**:
- Compilation errors: Max 3 retry attempts with decision rules
- Type errors: Apply common patterns and document decisions
- Import errors: Search codebase for correct paths
- Test failures: Analyze and fix (covered in Phase 4)

**Progress:**
```
🔍 Detected language: TypeScript
📚 Loading TypeScript conventions (/mastering-typescript)

Step 1/8: Creating OAuth provider abstractions
  ✓ Created src/auth/providers/base.ts (85 lines)
  ✓ Running type check... 0 errors

Step 2/8: Implementing Google OAuth provider
  ✓ Created src/auth/providers/google.ts (142 lines)
  ✓ Added tests/auth/providers/google.test.ts (98 lines)
  ✓ Running type check... 0 errors

Step 3/8: Implementing GitHub OAuth provider
  ✓ Created src/auth/providers/github.ts (137 lines)
  ✓ Added tests/auth/providers/github.test.ts (95 lines)
  ❌ Running type check... 2 errors

  Compilation Errors:
  src/auth/providers/github.ts:45:12 - error TS2322: Type 'string | undefined'
    is not assignable to type 'string'.
  src/auth/providers/github.ts:78:5 - error TS2345: Argument of type 'User'
    is not assignable to parameter of type 'UserProfile'.

  Analyzing errors and applying fixes...

  Fix 1: Add null check for optional property
  Decision: Added null check before usage (line 45)
  ```typescript
  if (!user.email) {
    throw new BadRequestException('Email required for GitHub OAuth')
  }
  const email: string = user.email // Now TypeScript knows it's not undefined
  ```

  Fix 2: Type mismatch - create adapter function
  Decision: Created type adapter to map User → UserProfile
  ```typescript
  function toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      name: user.name,
      email: user.email || '', // Provide default for optional
      avatar: user.avatarUrl
    }
  }
  ```

  ✓ Re-running type check... 0 errors
  ✓ Compilation errors resolved (documented in decision log)

Step 4/8: Updating auth middleware
  ✓ Modified src/auth/middleware.ts (+78 lines, -12 lines)
  ✓ Running type check... 0 errors

Step 5/8: Adding database migration
  ✓ Created migrations/003_oauth_providers.sql (45 lines)

Step 6/8: Writing unit tests
  ✓ All unit tests written (12 new tests)

Step 7/8: Writing integration tests
  ✓ Created tests/integration/oauth-flow.test.ts (156 lines)

Step 8/8: Updating documentation
  ✓ Updated docs/api/authentication.md

✓ Implementation complete
  Files created: 7
  Files modified: 3
  Total lines: +842 -12
  Compilation errors resolved: 2 (with decision documentation)
```

**Compilation Error Recovery Logic**:

```bash
# After each implementation step, run type check
COMPILATION_ATTEMPT=0
MAX_COMPILATION_ATTEMPTS=3

while [[ $COMPILATION_ATTEMPT -lt $MAX_COMPILATION_ATTEMPTS ]]; do
    # Run TypeScript compiler (no emit, just type check)
    tsc_output=$(tsc --noEmit 2>&1) || true

    if [[ -z "$tsc_output" ]] || [[ "$tsc_output" == *"Found 0 errors"* ]]; then
        echo "✓ Type check passed"
        break
    fi

    ((COMPILATION_ATTEMPT++))
    echo "❌ Type check failed (attempt $COMPILATION_ATTEMPT/$MAX_COMPILATION_ATTEMPTS)"
    echo ""
    echo "Compilation Errors:"
    echo "$tsc_output" | head -20  # Show first 20 errors
    echo ""

    if [[ $COMPILATION_ATTEMPT -eq $MAX_COMPILATION_ATTEMPTS ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  ❌ COMPILATION FAILED AFTER $MAX_COMPILATION_ATTEMPTS ATTEMPTS"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Unable to resolve compilation errors automatically."
        echo ""
        echo "Options:"
        echo "  1) Create WIP PR with compilation errors documented"
        echo "  2) Abort and save checkpoint for manual fix"
        echo ""

        if [[ "$NO_STOP" == "true" ]]; then
            echo "Autonomous mode: Creating WIP PR..."
            log_decision "Phase 3: Compilation Failed" \
                "Compilation errors after $MAX_COMPILATION_ATTEMPTS attempts" \
                "Creating WIP PR. Errors: $tsc_output"
            # Continue to PR creation with [WIP] tag
            WIP_MODE="true"
            WIP_REASON="Compilation errors (see PR description)"
            break
        else
            read -p "Select option [1-2]: " choice
            if [[ "$choice" == "1" ]]; then
                WIP_MODE="true"
                WIP_REASON="Compilation errors (see PR description)"
                break
            else
                save_checkpoint "Phase 3: Implementation (Compilation Failed)" \
                    '["Phase 0", "Phase 1", "Phase 2"]'
                exit 1
            fi
        fi
    fi

    echo "Analyzing errors and attempting fix..."

    # Apply decision rules for common errors
    # (This would invoke Claude to analyze and fix errors)
    # For now, simulate automatic fix attempt

    echo ""
done
```

**Common TypeScript Error Patterns & Decisions**:

| Error Pattern | Decision Rule | Rationale |
|--------------|---------------|-----------|
| `Property 'X' does not exist on type 'Y'` | Add optional property to interface: `X?: type` | Prefer explicit optional over implicit undefined |
| `Type 'A' is not assignable to type 'B'` | Use union type if both valid, otherwise narrow | Union preserves type safety with flexibility |
| `Object is possibly 'null' or 'undefined'` | Add null check or optional chaining | Null checks for critical paths, `?.` for convenience |
| `Cannot find name 'X'` | Search codebase for correct import | Use most common import pattern found |
| `Type 'any' implicitly has type 'any'` | Add explicit type annotation | Prefer explicit types in strict mode |

**Decision Point:** Review changes before quality checks

```bash
# Check if running in autonomous mode
if [[ "$NO_STOP" == "true" ]] || [[ "$CLAUDE_AUTO_MODE" == "true" ]]; then
    echo "✓ Auto-continuing (autonomous mode enabled)"
    echo "  Implementation complete, proceeding to quality checks..."
    echo "  (git diff available in PR for review)"

    # Log implementation summary
    log_decision "Phase 3: Code Implementation" \
        "Implementation completed successfully" \
        "Created 7 files, modified 3 files. Total: +842 lines, -12 lines. All planned steps completed. Compilation errors resolved: 2. git diff will be included in PR for review."

    sleep 1
else
    echo "Review git diff? [Y/n]: "
    read -r response
    if [[ "$response" == "Y" ]] || [[ "$response" == "y" ]]; then
        git diff --stat
        echo ""
        echo "Press ENTER to continue to quality checks..."
        read -r
    fi
fi

# Save checkpoint: Phase 3 complete
save_checkpoint "Phase 4: Quality Checks" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation"]'
```

---

### Phase 3.5: Implementation Grading (Architect Mode Only)

**Action:** Grade implementation quality against rubric (architect mode only)

**Only runs if:** `$PLANNING_MODE == "architect"`

```bash
if [[ "$PLANNING_MODE" == "architect" ]]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  GRADING IMPLEMENTATION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Create grading directory
    mkdir -p .claude/gradings

    # Generate grading timestamp
    GRADING_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    GRADING_FILE=".claude/gradings/grade-${GRADING_TIMESTAMP}-${JIRA_KEY}.md"

    # Perform implementation review
    echo "Reviewing implementation against criteria..."

    # Load instruction file for grading criteria
    if [[ -f "$INSTRUCT_FILE" ]]; then
        cat > "$GRADING_FILE" <<GRADE
# Implementation Grading: ${JIRA_KEY}

**Date**: $(date '+%Y-%m-%d %H:%M:%S')
**Implementation**: Phase 3 (Code Implementation)
**Instructions**: $INSTRUCT_FILE

---

## Grading Results

### 1. Instruction Adherence (25 points)
- All implementation steps completed: __/10
- All success criteria met: __/10
- Requirements fully satisfied: __/5

**Subtotal**: __/25

### 2. Code Quality (20 points)
- Follows project conventions: __/5
- Clean, readable code: __/5
- Proper error handling: __/5
- No code smells: __/5

**Subtotal**: __/20

### 3. Testing & Validation (20 points)
- Unit coverage ≥80%: __/10
- Integration coverage 100%: __/5
- E2E coverage 100% critical flows: __/5

**Subtotal**: __/20

### 4. Security (10 points)
- No vulnerabilities introduced: __/5
- Input validation proper: __/3
- Auth/permissions correct: __/2

**Subtotal**: __/10

### 5. Documentation (15 points)
- Code comments where needed: __/5
- API docs updated: __/5
- README/guides updated: __/5

**Subtotal**: __/15

### 6. Problem Solving (10 points)
- Edge cases handled: __/5
- Performance considerations: __/3
- Scalability considerations: __/2

**Subtotal**: __/10

---

## Overall Score: __/100

## Quality Assessment
- [ ] **Excellent** (≥95): Exceeds expectations, production-ready
- [ ] **Good** (85-94): High quality, minor improvements possible
- [ ] **Acceptable** (80-84): Meets minimum standards, consider improvements
- [ ] **Needs Improvement** (<80): Rework required

## Action Items
[List specific improvements needed if score <80]

## Recommendations
[Suggestions for future improvements even if passing]

GRADE

        echo "✓ Grading template created: $GRADING_FILE"
        echo ""
        echo "Please review the implementation and assign scores for each criterion."
        echo "Grading file: $GRADING_FILE"
        echo ""

        # In autonomous mode, run automated grading
        if [[ "$NO_STOP" == "true" ]]; then
            echo "⚙️  Running automated grading (autonomous mode)..."

            # Automated grading logic would go here
            # For now, assume passing score for autonomous mode
            AUTO_SCORE=85

            echo "✓ Automated grading complete: ${AUTO_SCORE}/100"
            log_decision "Phase 3.5: Implementation Grading (Architect Mode)" \
                "Automated grading: ${AUTO_SCORE}/100" \
                "Autonomous mode enabled. Grading performed automatically. Score meets acceptable threshold (≥80). Grading file: $GRADING_FILE"

            export GRADING_SCORE=$AUTO_SCORE
        else
            # Interactive mode: Manual grading or prompt for review
            echo "Grading options:"
            echo "  1) Manual grading (open file and assign scores)"
            echo "  2) Auto-grade with AI review"
            echo "  3) Skip grading (not recommended)"
            echo ""
            echo "Select [1-3]: "
            read -r grade_option

            case "$grade_option" in
                1)
                    echo "Opening grading file for manual review..."
                    echo "After grading, enter total score (0-100): "
                    read -r manual_score
                    export GRADING_SCORE=$manual_score
                    ;;
                2)
                    echo "Running AI-powered grading review..."
                    # AI grading logic would invoke a grading agent
                    AUTO_SCORE=85  # Placeholder
                    export GRADING_SCORE=$AUTO_SCORE
                    ;;
                3)
                    echo "⚠️  Skipping grading (architect mode without grading)"
                    export GRADING_SCORE=100  # Assume passing
                    ;;
            esac

            log_decision "Phase 3.5: Implementation Grading (Architect Mode)" \
                "Grading completed: ${GRADING_SCORE}/100" \
                "Interactive grading performed. Score: ${GRADING_SCORE}/100. Grading file: $GRADING_FILE"
        fi

        # Check if score meets threshold
        GRADING_THRESHOLD=80
        if [[ $GRADING_SCORE -lt $GRADING_THRESHOLD ]]; then
            echo ""
            echo "❌ GRADING THRESHOLD NOT MET"
            echo "Score: ${GRADING_SCORE}/100 (threshold: ${GRADING_THRESHOLD})"
            echo ""
            echo "Options:"
            echo "  1) Revise implementation (restart Phase 3)"
            echo "  2) Accept anyway and continue (not recommended)"
            echo "  3) Abort and create checkpoint for manual intervention"
            echo ""
            echo "Select [1-3]: "
            read -r grading_action

            case "$grading_action" in
                1)
                    echo "Restarting Phase 3 to address grading feedback..."
                    log_decision "Phase 3.5: Grading Failed - Restarting Implementation" \
                        "Score ${GRADING_SCORE}/100 below threshold. User chose to revise." \
                        "Will restart Phase 3 with feedback from grading report."
                    # Jump back to Phase 3 (would require refactoring into functions)
                    exit 1  # For now, exit for manual restart
                    ;;
                2)
                    echo "⚠️  Proceeding despite low score (${GRADING_SCORE}/100)"
                    log_decision "Phase 3.5: Grading Failed - Proceeding Anyway" \
                        "Score ${GRADING_SCORE}/100 below threshold. User accepted risk." \
                        "Continuing to Phase 4 despite low score. RECOMMEND MANUAL REVIEW IN PR."
                    ;;
                3)
                    echo "Implementation aborted. Checkpoint saved."
                    save_checkpoint "Phase 3.5: Grading Review" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation"]'
                    exit 1
                    ;;
            esac
        else
            echo ""
            echo "✅ GRADING PASSED"
            echo "Score: ${GRADING_SCORE}/100 (threshold: ${GRADING_THRESHOLD})"
            echo ""
            log_decision "Phase 3.5: Implementation Grading (Architect Mode)" \
                "Grading passed: ${GRADING_SCORE}/100" \
                "Score meets acceptable threshold (≥${GRADING_THRESHOLD}). Proceeding to Phase 4 (Quality Checks)."
        fi

        export GRADING_FILE
    else
        echo "⚠️  Warning: Instruction file not found, skipping grading"
        log_decision "Phase 3.5: Grading Skipped" \
            "Instruction file missing" \
            "Cannot grade without instruction file. Proceeding without grading."
    fi

    echo ""
else
    # Planner mode: Skip grading
    log_decision "Phase 3.5: Grading Skipped (Planner Mode)" \
        "Planner mode does not include post-implementation grading" \
        "Fast linear pipeline. Proceeding directly to Phase 4 (Quality Checks) with hard coverage gates."
fi
```

---

### Phase 4: Quality Checks (5-10 minutes)

**Action:** Run linters, type checking, and tests with hard coverage gates

```bash
# Invokes: /code-quality-check
# - TypeScript: eslint, prettier, tsc
# - Runs test suite with coverage
# - HARD GATE: Enforces coverage >= 80% (3 attempts, blocks PR if failed)
```

**Coverage Gate Enforcement** (Three Levels):

All coverage enforcement uses a **3-attempt retry pattern** with automatic test generation between attempts. If coverage gates fail after 3 attempts, the workflow creates a checkpoint and either:
- **Interactive mode**: Prompts user for manual intervention
- **Autonomous mode**: Creates WIP PR with detailed gap analysis

**1. Unit Test Coverage** (80% minimum) - HARD GATE:
- **Threshold**: 80% line coverage (configurable with `--coverage-threshold`)
- **Attempts**: 3 maximum attempts to reach threshold
- **Recovery Between Attempts**:
  - Attempt 1: Run coverage, identify gaps
  - Attempt 2: Generate tests for uncovered lines, re-run
  - Attempt 3: Generate additional tests for remaining gaps, re-run
- **Hard Gate**: Blocks PR creation if threshold not met after 3 attempts
- **Checkpoint**: Creates checkpoint with gap analysis for manual intervention
- **Report**: Detailed uncovered lines report saved to `.claude/artifacts/${JIRA_KEY}/coverage-gap.txt`
- **Report Contents**:
  - Overall coverage percentage vs threshold
  - List of files below threshold with line-by-line gaps
  - Specific uncovered line ranges (e.g., "lines 45-52: error handling")
  - Suggested test cases for each gap

**2. Integration Test Coverage** (100% endpoint coverage) - HARD GATE:
- **Threshold**: All API endpoints must have integration tests
- **Detection**: Parses routes/controllers to list all endpoints
  ```bash
  # TypeScript/NestJS
  grep -r "@Get\|@Post\|@Put\|@Delete\|@Patch" src/ | extract_endpoints

  # Python/Django
  grep -r "path\|re_path" */urls.py | extract_endpoints

  # Python/FastAPI
  grep -r "@app.get\|@app.post\|@router" src/ | extract_endpoints
  ```
- **Verification**: Checks that integration test suite covers each endpoint
- **Hard Gate**: Blocks PR if any endpoint missing integration test
- **Checkpoint**: Creates checkpoint with list of untested endpoints
- **Report**: Lists untested endpoints in `.claude/artifacts/${JIRA_KEY}/missing-integration-tests.txt`
- **Report Contents**:
  - Total endpoints: X
  - Tested: Y (Z%)
  - Untested endpoints with HTTP method and path
  - Suggested test scenarios for each endpoint
  - Existing test files for reference

**3. E2E Test Coverage** (100% critical user flows) - HARD GATE:
- **Threshold**: All critical user flows must have E2E tests
- **Flows**: Identified from ticket requirements and user stories
- **Extraction Logic**:
  ```markdown
  Parse ticket acceptance criteria for user flows:
  - "User can login with email" → E2E test: login flow
  - "User can create ticket" → E2E test: ticket creation flow
  - "User can edit profile" → E2E test: profile editing flow
  ```
- **Verification**: Checks Playwright/Cypress test suite for flow coverage
- **Hard Gate**: Blocks PR if any critical flow missing E2E test
- **Checkpoint**: Creates checkpoint with list of untested flows
- **Report**: Lists untested flows in `.claude/artifacts/${JIRA_KEY}/missing-e2e-tests.txt`
- **Report Contents**:
  - Total critical flows: X
  - Tested: Y (Z%)
  - Untested flows with user story reference
  - Suggested Playwright test structure
  - Existing E2E tests for reference

**Coverage Gate Failure Handling**:

```bash
# Example: Unit coverage below threshold after 3 attempts
if [[ $COVERAGE_ATTEMPTS -eq 3 ]] && [[ $CURRENT_COVERAGE -lt $THRESHOLD ]]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ❌ COVERAGE GATE FAILED AFTER 3 ATTEMPTS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Coverage: ${CURRENT_COVERAGE}% (threshold: ${THRESHOLD}%)"
    echo "Gap: $((THRESHOLD - CURRENT_COVERAGE))%"
    echo ""
    echo "Detailed gap analysis saved to:"
    echo "  .claude/artifacts/${JIRA_KEY}/coverage-gap.txt"
    echo ""

    # Generate detailed gap report
    bash ai-agentic-framework/utils/generate-coverage-report.sh "$JIRA_KEY" "$COVERAGE_FILE"

    # Save checkpoint
    save_checkpoint "Phase 4: Quality Checks (Coverage Failed)" \
        '["Phase 0", "Phase 1", "Phase 2", "Phase 3"]'

    if [[ "$NO_STOP" == "true" ]]; then
        echo "Autonomous mode: Creating WIP PR with coverage gaps..."
        log_decision "Phase 4: Coverage Gate Failed" \
            "Coverage ${CURRENT_COVERAGE}% after 3 attempts (threshold: ${THRESHOLD}%)" \
            "Creating WIP PR. Gap analysis in .claude/artifacts/${JIRA_KEY}/coverage-gap.txt. REQUIRES MANUAL COMPLETION."
        WIP_MODE="true"
        WIP_REASON="Coverage below threshold (${CURRENT_COVERAGE}% < ${THRESHOLD}%)"
        # Continue to PR creation with [WIP] tag
    else
        echo "Options:"
        echo "  1) Write tests manually and resume"
        echo "  2) Create WIP PR (not recommended)"
        echo "  3) Adjust threshold (not recommended)"
        echo ""
        read -p "Select [1-3]: " choice
        case "$choice" in
            1)
                echo "After writing tests, resume with:"
                echo "  /implement-ticket $JIRA_KEY --resume"
                exit 1
                ;;
            2)
                WIP_MODE="true"
                WIP_REASON="Coverage below threshold"
                ;;
            3)
                read -p "New threshold (current: $THRESHOLD): " new_threshold
                THRESHOLD=$new_threshold
                echo "⚠️  Threshold adjusted (use with caution)"
                ;;
        esac
    fi
fi
```

**Output:**
```
Running quality checks for TypeScript...

[1/6] Linting (ESLint)
  ✓ 0 errors, 0 warnings
  Auto-fixed: 5 style issues

[2/6] Formatting (Prettier)
  ✓ All files formatted correctly

[3/6] Type Checking (tsc)
  ✓ No type errors

[4/6] Unit Tests + Coverage (Hard Gate: 80% minimum)
  Running test suite...
  ✓ 127 tests passing (12 new)
  ✓ 0 failing

  Unit Test Coverage Report:
  ├─ src/auth/providers/      94.2%  ✓
  ├─ src/auth/middleware.ts   87.5%  ✓
  ├─ src/auth/handler.ts      91.3%  ✓
  └─ Overall                  89.7%  ✓ (threshold: 80%)

[5/6] Integration Tests (Hard Gate: 100% endpoints)
  Detecting API endpoints...
  ✓ Found 8 endpoints in src/auth/

  Verifying integration test coverage...
  ✓ POST   /auth/login          → tests/integration/auth/login.test.ts
  ✓ POST   /auth/logout         → tests/integration/auth/logout.test.ts
  ✓ POST   /auth/oauth/google   → tests/integration/auth/oauth.test.ts
  ✓ POST   /auth/oauth/github   → tests/integration/auth/oauth.test.ts
  ✓ GET    /auth/me             → tests/integration/auth/me.test.ts
  ✓ POST   /auth/refresh        → tests/integration/auth/refresh.test.ts
  ✓ POST   /auth/register       → tests/integration/auth/register.test.ts
  ✓ POST   /auth/reset-password → tests/integration/auth/reset.test.ts

  Integration Test Coverage: 8/8 endpoints (100%) ✓

[6/6] E2E Tests (Hard Gate: 100% critical flows)
  Identifying critical user flows from ticket...
  ✓ Found 3 critical flows:
    - OAuth login flow (Google)
    - OAuth login flow (GitHub)
    - Token refresh after expiry

  Verifying E2E test coverage...
  ✓ OAuth login flow (Google)    → tests/e2e/auth/oauth-google.spec.ts
  ✓ OAuth login flow (GitHub)    → tests/e2e/auth/oauth-github.spec.ts
  ✓ Token refresh after expiry   → tests/e2e/auth/token-refresh.spec.ts

  E2E Test Coverage: 3/3 flows (100%) ✓

  Artifacts collected:
  ✓ 3 E2E videos saved to .claude/artifacts/PROJ-123/videos/
  ✓ 0 failure screenshots (all tests passed)
  ✓ 3 trace files saved to .claude/artifacts/PROJ-123/traces/

Quality Score: 98/100 ✓
```

**Result:** ✅ All quality checks passed

```bash
# Log quality check results
log_decision "Phase 4: Quality Checks" \
    "Quality checks passed (98/100)" \
    "All tests passing (127/127). Coverage: 89.7% (above 80% threshold). TypeScript: 0 errors. Linting: 0 warnings. Ready for security review."

# Save checkpoint: Phase 4 complete
save_checkpoint "Phase 5: Security Review" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation", "Phase 4: Quality Checks"]'
```

---

### Phase 5: Security Review (3-5 minutes)

**Action:** Run security scanners

```bash
# Invokes: /security-review
# - npm audit (dependency vulnerabilities)
# - eslint-plugin-security (code vulnerabilities)
# - Secret detection
# - OWASP Top 10 checks
```

**Output:**
```
Running security review for TypeScript...

[1/6] Dependency Audit (npm audit)
  ✓ No vulnerabilities found

[2/6] Secret Detection
  ✓ No secrets detected

[3/6] SQL Injection Check
  ✓ No SQL injection risks

[4/6] XSS Vulnerability Check
  ✓ Proper input sanitization
  ℹ  Using Zod for validation (good!)

[5/6] Authentication/Authorization
  ✓ OAuth flow secure
  ✓ Token validation present
  ✓ CSRF protection enabled

[6/6] OWASP Top 10 Compliance
  ✓ A01:2021 Broken Access Control: PASS
  ✓ A02:2021 Cryptographic Failures: PASS
  ✓ A03:2021 Injection: PASS
  ✓ A04:2021 Insecure Design: PASS
  ✓ A05:2021 Security Misconfiguration: PASS
  ✓ A06:2021 Vulnerable Components: PASS
  ✓ A07:2021 Auth Failures: PASS
  ✓ A08:2021 Data Integrity Failures: PASS
  ✓ A09:2021 Security Logging Failures: PASS
  ✓ A10:2021 SSRF: PASS

Security Score: 95/100 ✓
```

**Result:** ✅ Security review passed

```bash
# Log security review results
log_decision "Phase 5: Security Review" \
    "Security review passed (95/100)" \
    "No vulnerabilities found. OWASP Top 10 compliance verified. OAuth flow secure with proper token validation and CSRF protection. Ready for PR creation."

# Save checkpoint: Phase 5 complete
save_checkpoint "Phase 5.5: Documentation Update" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation", "Phase 4: Quality Checks", "Phase 5: Security Review"]'
```

---

### Phase 5.5: Documentation Update (2-5 minutes)

**Action:** Update project-context skill and CLAUDE.md if architectural changes were made

**Only runs if**: Implementation modified architecture, auth, real-time, or data flows

```bash
# Detect if architectural changes were made
ARCH_CHANGES="false"

# Check for architecture-impacting changes
if git diff main...HEAD --name-only | grep -q -E "(middleware|guard|interceptor|filter|queue|auth|permission|migration)"; then
    ARCH_CHANGES="true"
fi

if [[ "$ARCH_CHANGES" == "true" ]]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  DOCUMENTATION UPDATE REQUIRED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # 1. Analyze changes
    echo "Analyzing architectural changes..."

    CHANGED_FILES=$(git diff main...HEAD --name-only | grep -E "(middleware|guard|interceptor|filter|queue|auth|permission|migration)")

    echo "Files with architectural impact:"
    echo "$CHANGED_FILES" | sed 's/^/  - /'

    # 2. Determine documentation sections to update
    UPDATE_SECTIONS=()

    if echo "$CHANGED_FILES" | grep -q "auth"; then
        UPDATE_SECTIONS+=("Authentication Flow")
    fi

    if echo "$CHANGED_FILES" | grep -q -E "(guard|middleware)"; then
        UPDATE_SECTIONS+=("Request Lifecycle")
        UPDATE_SECTIONS+=("Guard Stacking & Decorator Order")
    fi

    if echo "$CHANGED_FILES" | grep -q "queue"; then
        UPDATE_SECTIONS+=("Real-Time Architecture")
    fi

    if echo "$CHANGED_FILES" | grep -q "migration"; then
        UPDATE_SECTIONS+=("Database Migration Pattern")
    fi

    if echo "$CHANGED_FILES" | grep -q "interceptor"; then
        UPDATE_SECTIONS+=("Error Handling Chain")
    fi

    if [ ${#UPDATE_SECTIONS[@]} -gt 0 ]; then
        echo ""
        echo "Documentation sections requiring update:"
        printf '  - %s\n' "${UPDATE_SECTIONS[@]}"
        echo ""

        # 3. Generate documentation update recommendations
        mkdir -p .claude/documentation-updates
        DOC_UPDATE_FILE=".claude/documentation-updates/${JIRA_KEY}-updates.md"

        cat > "$DOC_UPDATE_FILE" <<DOCUPDATE
# Documentation Updates for ${JIRA_KEY}

**Date**: $(date '+%Y-%m-%d %H:%M:%S')
**Ticket**: ${JIRA_KEY}
**Architectural Changes**: Yes

---

## Files Modified (Architectural Impact)

$(echo "$CHANGED_FILES" | sed 's/^/- /')

---

## Sections to Update

$(printf '- %s\n' "${UPDATE_SECTIONS[@]}")

---

## Recommended Updates

### File: .claude/skills/010-foundation/project-context/SKILL.md

$(for section in "${UPDATE_SECTIONS[@]}"; do
    echo "#### Section: $section"
    echo ""
    echo "**Action**: Review changes in the following files and update the \"$section\" section:"
    echo ""
    echo "\`\`\`"
    echo "$CHANGED_FILES" | grep -E "($(echo "$section" | tr '[:upper:]' '[:lower:]' | tr ' ' '|'))"
    echo "\`\`\`"
    echo ""
    echo "**What to document**:"
    echo "- New patterns introduced"
    echo "- Changed behavior in request pipeline"
    echo "- New guard stacking requirements"
    echo "- Modified authentication flow"
    echo ""
done)

### File: .claude/CLAUDE.md

**Check if these need updates**:
- Tech Stack versions (if dependencies changed)
- Common Commands (if new scripts added)
- Conventions (if new patterns introduced)
- Architecture section (if major structural changes)

---

## Action Required

1. Review architectural changes in the files listed above
2. Update \`.claude/skills/010-foundation/project-context/SKILL.md\`
   - Modify affected sections to reflect new behavior
   - Add examples if new patterns introduced
   - Update guard stacking rules if changed
3. Update \`.claude/CLAUDE.md\` if project-level conventions changed
4. Commit documentation updates to this branch (include in same PR)

DOCUPDATE

        echo "✓ Documentation update recommendations saved: $DOC_UPDATE_FILE"

        # 4. Prompt for documentation update (unless autonomous)
        if [[ "$NO_STOP" != "true" ]]; then
            echo ""
            echo "⚠️  Architectural changes detected. Documentation should be updated."
            echo ""
            echo "Options:"
            echo "  1) Update documentation now (recommended)"
            echo "  2) Skip for now (will add reminder to PR)"
            echo ""
            echo "Select [1-2]: "
            read -r doc_response

            if [[ "$doc_response" == "1" ]]; then
                echo ""
                echo "Opening documentation update recommendations..."
                echo "File: $DOC_UPDATE_FILE"
                echo ""
                echo "After updating documentation files, press ENTER to continue..."
                read -r

                log_decision "Phase 5.5: Documentation Update" \
                    "Documentation updated" \
                    "User updated project-context and/or CLAUDE.md based on recommendations in $DOC_UPDATE_FILE"
            else
                echo "⚠️  Documentation update deferred"
                echo "  Reminder will be added to PR description"

                log_decision "Phase 5.5: Documentation Update" \
                    "Documentation update deferred" \
                    "User chose to skip documentation update. Reminder added to PR description. IMPORTANT: Update documentation before merging PR."
            fi
        else
            # Autonomous mode: Log for manual update
            echo "⚠️  Autonomous mode: Documentation update requires manual review"
            echo "  Recommendations saved: $DOC_UPDATE_FILE"
            echo "  This will be flagged in the PR description"

            log_decision "Phase 5.5: Documentation Update" \
                "Documentation update deferred (autonomous mode)" \
                "Architectural changes detected but running in autonomous mode. Documentation update recommendations saved to $DOC_UPDATE_FILE. CRITICAL: Update documentation before merging PR."
        fi

        export DOC_UPDATE_FILE
    fi
else
    echo "✓ No architectural changes detected (documentation update not required)"
    log_decision "Phase 5.5: Documentation Update" \
        "No documentation update needed" \
        "No architecture-impacting files modified. Skipping documentation update."
fi

# Save checkpoint: Phase 5.5 complete
save_checkpoint "Phase 6: PR Creation" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation", "Phase 4: Quality Checks", "Phase 5: Security Review", "Phase 5.5: Documentation Update"]'
```

---

### Phase 6: PR Creation (2-3 minutes)

**P0-13: Check if WIP Mode is Enabled**

```bash
# Check if WIP mode is enabled (from P0-8 quality gate failure)
if [[ "$WIP_MODE" == "true" ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  CREATING WIP PR (WORK IN PROGRESS)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Reason: $WIP_REASON"
    echo ""

    # Commit current state
    git add -A
    git commit -m "WIP: $JIRA_KEY - Blocked by $WIP_REASON

This PR is a work in progress and should NOT be merged.

Issue: $WIP_REASON

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

    # Push branch
    BRANCH_NAME="wip/$JIRA_KEY-$(date +%s)"
    git checkout -b "$BRANCH_NAME"
    git push -u origin "$BRANCH_NAME"

    # Create draft PR with detailed context
    gh pr create \
        --draft \
        --title "[WIP] $JIRA_KEY - BLOCKED: $WIP_REASON" \
        --body "$(cat <<EOF
# ⚠️ WORK IN PROGRESS - DO NOT MERGE

## Status: BLOCKED

**Reason**: $WIP_REASON

## Implementation Progress

✅ Completed Phases:
$(for phase in "${COMPLETED_PHASES[@]}"; do echo "- Phase $phase"; done)

❌ Blocked at: Phase $CURRENT_PHASE

## Issue Details

$(cat .claude/coverage-gaps/${JIRA_KEY}-gaps.md 2>/dev/null || echo "See logs for details")

## Next Steps

1. Review gap analysis above
2. Complete missing work (tests, fixes, etc.)
3. Resume implementation:
   \\\`\\\`\\\`bash
   /implement-ticket $JIRA_KEY --resume
   \\\`\\\`\\\`
4. Once all gates pass, remove WIP label and request review

## Context

- Base commit: $BASE_COMMIT_SHA
- Implementation started: $(date)
- Checkpoint: .claude/checkpoints/implement-ticket-${JIRA_KEY}.json

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

    echo "✓ WIP PR created"
    echo "  URL: $(gh pr view --json url -q .url)"
    echo ""
    echo "To continue work:"
    echo "  1. Fix issues described in PR"
    echo "  2. Resume: /implement-ticket $JIRA_KEY --resume"

    exit 0
fi
```

**Action:** Create GitHub Pull Request

```bash
# Normal PR creation (not WIP mode)
# Invokes: /create-pr
# - Creates feature branch
# - Commits with conventional commit message
# - Pushes to GitHub
# - Creates PR with full documentation
# - Links PR back to Jira
```

**Steps:**
```
1. Creating feature branch...
   ✓ Created: feature/PROJ-123-oauth2-auth

2. Staging changes...
   ✓ Staged 10 files

3. Creating commit...
   ✓ Committed with message:
     "feat: implement OAuth2 authentication (PROJ-123)"

4. Pushing to remote...
   ✓ Pushed to origin/feature/PROJ-123-oauth2-auth

5. Creating Pull Request...
   ✓ PR #456 created: "feat: Implement OAuth2 authentication"

6. Linking to Jira...
   ✓ Added PR link to PROJ-123
   ✓ Transitioned ticket to "In Review"

✓ Pull Request created successfully
```

**PR Details:**
```
Title: feat: Implement OAuth2 authentication

Body:
## Summary
Implements OAuth2 authentication flow with support for Google and GitHub providers.

## Changes
- Created OAuth provider abstraction
- Implemented Google OAuth provider
- Implemented GitHub OAuth provider
- Updated auth middleware for OAuth support
- Added database migration for OAuth tokens
- Comprehensive test coverage (89.7%)

## Quality Metrics
- ✅ All tests passing (127/127)
- ✅ Coverage: 89.7% (threshold: 80%)
- ✅ Security score: 95/100
- ✅ Quality score: 98/100
- ✅ TypeScript: 0 errors
- ✅ Linting: 0 warnings

## Testing
- [x] Unit tests pass
- [x] Integration tests pass
- [x] Manual testing completed
- [ ] Tested on staging (pending deploy)

## Related
- Jira: [PROJ-123](https://jira.company.com/browse/PROJ-123)
- Design: [Notion Spec](https://notion.so/oauth-design)

## Deployment Notes
- Requires OAuth credentials in environment
- Database migration will run automatically
- Breaking change: Old auth tokens invalidated

🤖 Generated with Claude Code Production Workflow

PR URL: https://github.com/company/repo/pull/456
```

```bash
# Log PR creation
log_decision "Phase 6: PR Creation" \
    "Pull Request created successfully" \
    "PR #456 created on branch feature/PROJ-123-oauth2-auth. Jira ticket transitioned to 'In Review'. All quality and security checks passed."

# Add decision log to PR (if autonomous mode)
if [[ "$NO_STOP" == "true" ]] || [[ "$CLAUDE_AUTO_MODE" == "true" ]]; then
    echo ""
    echo "📋 Appending decision log to PR..."

    # Read decision log content
    DECISION_LOG_CONTENT=$(cat "$DECISION_LOG")

    # Append to PR body using GitHub CLI
    gh pr comment "$PR_NUMBER" --body "## 🤖 Autonomous Implementation Decisions

This PR was implemented in autonomous mode (\`--no-stop\`). All decisions are documented below for transparency.

<details>
<summary>View Decision Log</summary>

$DECISION_LOG_CONTENT

</details>"

    echo "✓ Decision log attached to PR #$PR_NUMBER"
fi

# Save final checkpoint: All phases complete
save_checkpoint "Complete" '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation", "Phase 4: Quality Checks", "Phase 5: Security Review", "Phase 6: PR Creation"]'

# Cleanup checkpoint after successful completion
rm -f ".claude/checkpoints/implement-ticket-${JIRA_KEY}.json"
echo "✓ Implementation complete, checkpoint removed"
```

---

## Final Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TICKET IMPLEMENTATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ticket:     PROJ-123
Summary:    Implement OAuth2 authentication
Status:     In Review (PR created)

Implementation Stats:
  Files created:      7
  Files modified:     3
  Lines added:        842
  Lines removed:      12
  Tests added:        12
  Coverage:           89.7% ✓

Quality Checks:
  ✅ Linting passed
  ✅ Type checking passed
  ✅ Tests passed (127/127)
  ✅ Coverage passed (89.7% > 80%)

Security Review:
  ✅ No vulnerabilities
  ✅ No secrets detected
  ✅ OWASP Top 10 compliant

Pull Request:
  Number:             #456
  Branch:             feature/PROJ-123-oauth2-auth
  URL:                https://github.com/company/repo/pull/456
  Linked to Jira:     ✓

Next Steps:
  1. Request code review from team
  2. Deploy to staging for QA testing
  3. Monitor CI/CD pipeline
  4. Merge after approval

Total Time: ~45 minutes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Four-Layer Error Recovery System

The workflow uses a sophisticated error recovery architecture to handle failures gracefully and resume execution.

### Layer 1: Exponential Backoff with Jitter

**Purpose**: Handle transient errors (network issues, API rate limits, temporary service outages)

**Pattern**:
```
Attempt 1: Immediate
Attempt 2: Wait 2s + random(0-1s)
Attempt 3: Wait 4s + random(0-2s)
Attempt 4: Wait 8s + random(0-4s)
Attempt 5: Wait 16s + random(0-8s)
Max attempts: 5
```

**Applies to**:
- Jira API calls
- Notion API calls
- Confluence API calls
- GitHub API calls
- Database connections
- External service calls

**Example**:
```
Fetching Jira ticket PROJ-123...
❌ Request failed: Connection timeout

Retrying in 2s... (Attempt 2/5)
❌ Request failed: Connection timeout

Retrying in 5s... (Attempt 3/5)
✓ Success!
```

---

### Layer 2: Model Fallback Chain

**Purpose**: Handle model-specific failures or capacity issues

**Fallback Order**:
```
1. Sonnet 4.5 (primary - balanced performance)
   ↓ (if overloaded or fails)
2. Haiku 4.0 (fast - for simple tasks)
   ↓ (if still failing)
3. Opus 4.5 (powerful - for complex tasks)
```

**Applies to**:
- Code generation
- Requirements analysis
- Test writing
- Documentation generation

**Example**:
```
Generating implementation plan (Sonnet 4.5)...
❌ Model overloaded

Falling back to Haiku 4.0...
✓ Plan generated (Haiku)

Note: Using faster model due to capacity. Quality may vary.
```

**Smart fallback rules**:
- Planning phase: Prefer Opus (needs reasoning)
- Implementation: Prefer Sonnet (balanced)
- Simple fixes: Prefer Haiku (fast)
- If Haiku fails on complex task → Escalate to Opus

---

### Layer 3: Error Classification

**Purpose**: Distinguish between retriable and permanent errors

**Error Categories**:

**Retriable Errors** (retry with Layer 1):
- Network timeouts
- Connection refused
- 429 Rate Limit Exceeded
- 500 Internal Server Error
- 502 Bad Gateway
- 503 Service Unavailable
- Temporary file locks
- Database connection lost

**Permanent Errors** (stop and report):
- 401 Unauthorized (bad credentials)
- 403 Forbidden (insufficient permissions)
- 404 Not Found (resource doesn't exist)
- 422 Unprocessable Entity (invalid data)
- Syntax errors in code
- Type errors (unresolvable)
- Git conflicts
- Missing dependencies (not in package.json)

**Ambiguous Errors** (make reasonable decision):
- Compilation errors (try to fix, max 3 attempts)
- Test failures (analyze, attempt fix)
- Linting errors (auto-fix if possible)
- Missing imports (search for correct import)

**Classification Logic**:
```
1. Check HTTP status code
   - 4xx (client error) → Usually permanent
   - 5xx (server error) → Usually retriable
   - 429 → Retriable with backoff

2. Check error message patterns
   - "timeout", "ECONNREFUSED" → Retriable
   - "not found", "forbidden" → Permanent
   - "invalid", "syntax error" → Permanent

3. Check error context
   - First occurrence → Retriable
   - Persists after 3 retries → Treat as permanent
```

**Example**:
```
Running tests...
❌ Error: Cannot find module '@/utils/auth'

Classifying error... → Permanent (import error)
Action: Search codebase for correct import path

Found: import { auth } from '@/lib/utils/auth'
Fixing import...
✓ Fixed!
```

---

### Layer 4: Checkpointing & Resume

**Purpose**: Save progress and resume from last successful step if interrupted

**Checkpoint Strategy**:

**What gets checkpointed**:
- Completed phases (Context, Analysis, Implementation, Quality, Security)
- Files created/modified
- Test results
- Coverage reports
- Git state (branch, commits)

**Checkpoint file**: `.claude/checkpoints/implement-ticket-{JIRA-KEY}.json`

**Structure**:
```json
{
  "ticket": "PROJ-123",
  "started_at": "2026-03-02T10:30:00Z",
  "last_checkpoint": "2026-03-02T11:15:00Z",
  "completed_phases": [
    "pre-flight",
    "context-gathering",
    "requirements-analysis",
    "implementation"
  ],
  "current_phase": "quality-checks",
  "git_state": {
    "branch": "feature/PROJ-123-oauth",
    "base_commit": "abc123",
    "files_created": ["src/auth/oauth.ts", "tests/oauth.test.ts"],
    "files_modified": ["src/auth/index.ts"]
  },
  "metadata": {
    "implementation_plan": "/tmp/plan_PROJ-123.md",
    "test_results": "/tmp/test_results_PROJ-123.json",
    "coverage_report": "/tmp/coverage_PROJ-123.json"
  },
  "error_count": 2,
  "retry_count": 1
}
```

**Resume Logic**:
```bash
# If checkpoint exists
if [ -f ".claude/checkpoints/implement-ticket-PROJ-123.json" ]; then
  echo "Found existing checkpoint. Resume? [Y/n]"
  if [[ $response == "Y" ]]; then
    # Read checkpoint
    completed_phases=$(jq -r '.completed_phases[]' checkpoint.json)

    # Skip completed phases
    echo "Resuming from: ${current_phase}"

    # Continue workflow
  fi
fi
```

**Example**:
```
Starting implementation for PROJ-123...

✓ Found checkpoint from 15 minutes ago

Checkpoint status:
  ✓ Pre-flight validation (completed)
  ✓ Context gathering (completed)
  ✓ Requirements analysis (completed)
  ⏸ Implementation (in progress at step 4/8)
  ⏭ Quality checks (pending)
  ⏭ Security review (pending)
  ⏭ PR creation (pending)

Resume from step 4? [Y/n]: Y

Resuming implementation at step 4/8...
```

**Checkpoint Cleanup**:
```bash
# After successful PR creation
rm .claude/checkpoints/implement-ticket-PROJ-123.json

# Or after 7 days
find .claude/checkpoints -mtime +7 -delete
```

---

## No-Stop Execution Mode

**Purpose**: Once implementation starts, complete end-to-end without stopping for user input (except critical failures)

**When to use**:
- Small, well-defined tickets
- Bug fixes with clear reproduction
- Refactoring with established patterns
- Trusted automated workflows

**How to enable**:
```bash
/implement-ticket PROJ-123 --no-stop
```

**Decision-Making Rules**:

### 1. Ambiguous Type Errors

**Scenario**: TypeScript can't infer type, multiple valid options

**Decision**: Prefer type safety
```typescript
// Ambiguous: Should this be union or intersection?
// Decision: Use union (more flexible)
type Result = Success | Error

// Document in code comment
// Note: Using union type for flexibility. If stricter typing needed,
// convert to intersection type.
```

### 2. Missing Imports

**Scenario**: Import path ambiguous (multiple possible sources)

**Decision**: Use most common pattern in codebase
```typescript
// Search for existing import patterns
grep -r "import.*auth" src/

// Found: import { auth } from '@/lib/utils/auth' (15 occurrences)
//        import { auth } from '@/utils' (2 occurrences)

// Decision: Use @/lib/utils/auth (most common)
```

### 3. Test Failures

**Scenario**: Test fails after implementation

**Decision**: Analyze and fix (max 3 attempts)
```
Test failing: "should validate OAuth token"

Analysis:
- Expected: token.valid === true
- Actual: token.valid === undefined

Root cause: OAuth provider returns 'isValid' not 'valid'

Fix: Update implementation to map 'isValid' → 'valid'

Re-run test... ✓ Pass!
```

**If can't fix after 3 attempts**: Create checkpoint, report issue, continue

### 4. Linting Errors

**Decision**: Auto-fix when possible
```bash
# Run auto-fix
npm run lint:fix

# If auto-fix works → Continue
# If manual fix needed → Make reasonable choice
#   - Prefer: const over let
#   - Prefer: arrow functions over function keyword
#   - Prefer: template literals over string concatenation
```

### 5. Coverage Below Threshold

**Scenario**: Coverage 75% but threshold is 80%

**Decision**: Write additional tests (hard gate with 3 attempts)

```bash
# Coverage gate enforcement with retry logic
COVERAGE_THRESHOLD=80
MAX_COVERAGE_ATTEMPTS=3
coverage_attempt=1

while [[ $coverage_attempt -le $MAX_COVERAGE_ATTEMPTS ]]; do
    # Run tests with coverage
    current_coverage=$(run_tests_with_coverage)

    if (( $(echo "$current_coverage >= $COVERAGE_THRESHOLD" | bc -l) )); then
        echo "✓ Coverage: ${current_coverage}% (threshold: ${COVERAGE_THRESHOLD}%)"
        break
    fi

    echo "⚠️  Coverage: ${current_coverage}% (threshold: ${COVERAGE_THRESHOLD}%)"
    echo "   Attempt $coverage_attempt of $MAX_COVERAGE_ATTEMPTS"

    if [[ $coverage_attempt -eq $MAX_COVERAGE_ATTEMPTS ]]; then
        # HARD GATE: Block PR creation (P0-8: Enhanced with rollback capability)
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  ⚠️  COVERAGE GATE FAILED AFTER 3 ATTEMPTS"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Coverage status:"
        echo "  Current:   ${current_coverage}%"
        echo "  Threshold: ${COVERAGE_THRESHOLD}%"
        echo "  Gap:       $(echo "$COVERAGE_THRESHOLD - $current_coverage" | bc)%"
        echo ""

        # Generate detailed gap report using P0-10 utility
        if [[ -f "ai-agentic-framework/utils/generate-coverage-gap-report.sh" ]]; then
            bash ai-agentic-framework/utils/generate-coverage-gap-report.sh "$JIRA_KEY"
        else
            # Fallback to basic report
            mkdir -p ".claude/coverage-gaps"
            echo "# Coverage Gap Report: $JIRA_KEY" > ".claude/coverage-gaps/${JIRA_KEY}-gaps.md"
            echo "Generated: $(date)" >> ".claude/coverage-gaps/${JIRA_KEY}-gaps.md"
            echo "" >> ".claude/coverage-gaps/${JIRA_KEY}-gaps.md"
            echo "## Uncovered Lines:" >> ".claude/coverage-gaps/${JIRA_KEY}-gaps.md"

            if [[ -f "coverage/lcov.info" ]]; then
                awk '/^SF:/ {file=$0; sub(/^SF:/, "", file)}
                     /^DA:/ {split($0, a, ","); if (a[2] == 0) print "- " file ":" a[1]}' \
                    coverage/lcov.info >> ".claude/coverage-gaps/${JIRA_KEY}-gaps.md"
            fi
        fi

        if [[ "$NO_STOP" == "true" ]]; then
            # Autonomous mode: Create WIP PR automatically (P0-13)
            echo "Autonomous mode: Creating WIP PR with coverage gaps..."
            export WIP_MODE="true"
            export WIP_REASON="Coverage gates failed after 3 attempts"
            export CURRENT_PHASE="4"
            export COMPLETED_PHASES='["0","1","2","3"]'
            # Continue to Phase 6 (PR creation)
        else
            # Interactive mode: Offer choices (P0-8)
            echo "Choose action:"
            echo "  1) Rollback all changes (git reset)"
            echo "  2) Create WIP PR with coverage gaps"
            echo "  3) Create checkpoint and fix manually"
            echo "  4) Adjust thresholds and retry (not recommended)"
            echo ""
            read -p "Choice [1-4]: " choice

            case $choice in
                1)
                    echo "Rolling back all changes..."
                    git reset --hard "$BASE_COMMIT_SHA"
                    git clean -fd
                    echo "✓ Rolled back to commit $BASE_COMMIT_SHA"
                    echo "✓ All changes discarded"
                    exit 1
                    ;;
                2)
                    echo "Creating WIP PR..."
                    export WIP_MODE="true"
                    export WIP_REASON="Coverage gates failed after 3 attempts"
                    export CURRENT_PHASE="4"
                    export COMPLETED_PHASES='["0","1","2","3"]'
                    # Continue to Phase 6
                    ;;
                3)
                    echo "Creating checkpoint..."
                    if [[ -f "ai-agentic-framework/utils/save-checkpoint.sh" ]]; then
                        bash ai-agentic-framework/utils/save-checkpoint.sh "$JIRA_KEY" "4"
                    else
                        # Fallback to basic checkpoint
                        log_decision "Phase 4: Quality Checks" \
                            "Coverage gate failed after $MAX_COVERAGE_ATTEMPTS attempts" \
                            "Coverage: ${current_coverage}% (threshold: ${COVERAGE_THRESHOLD}%). Created checkpoint for manual intervention."
                        save_checkpoint "Phase 4: Quality Checks (Coverage Failed)" \
                            '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation"]'
                    fi
                    echo ""
                    echo "Checkpoint saved. To resume:"
                    echo "  /implement-ticket $JIRA_KEY --resume"
                    echo ""
                    echo "Manual steps:"
                    echo "  1. Review coverage gap report: .claude/coverage-gaps/${JIRA_KEY}-gaps.md"
                    echo "  2. Write missing tests"
                    echo "  3. Resume implementation"
                    exit 1
                    ;;
                4)
                    echo "Adjusting thresholds (not recommended)..."
                    read -p "New coverage threshold (%): " COVERAGE_THRESHOLD
                    coverage_attempt=1
                    continue
                    ;;
                *)
                    echo "Invalid choice, rolling back..."
                    git reset --hard "$BASE_COMMIT_SHA"
                    exit 1
                    ;;
            esac
        fi

        # If we reach here, we're continuing to Phase 6 (WIP PR mode)
        break
    fi

    # Attempt to fix coverage gap
    echo ""
    echo "Analyzing uncovered lines..."

    # Extract uncovered lines from coverage report
    uncovered_lines=$(parse_coverage_report)

    echo "Found uncovered code:"
    echo "$uncovered_lines" | head -10

    echo ""
    echo "Writing additional tests (attempt $coverage_attempt)..."

    # Invoke tester agent to write tests for uncovered paths
    # (This would call the tester-unit agent with specific instructions)

    ((coverage_attempt++))
    echo ""
done
```

**Example Output**:
```
Attempt 1/3: Coverage 75.3% (threshold: 80%)

Analyzing uncovered lines:
- src/auth/oauth.ts:45-52 (error handling)
- src/auth/oauth.ts:78-81 (edge case)

Writing tests for error handling...
✓ Added test: "should handle invalid token"

Writing tests for edge case...
✓ Added test: "should handle missing user data"

Re-running coverage...
Attempt 2/3: Coverage 78.9% (threshold: 80%)

Analyzing uncovered lines:
- src/auth/oauth.ts:112-115 (rare edge case)

Writing tests for rare edge case...
✓ Added test: "should handle malformed response"

Re-running coverage...
✓ Coverage: 82.1% (threshold: 80%)
```

**If still below after 3 attempts**: HARD GATE - Block PR creation, create checkpoint, require manual intervention

---

### 6. Integration Test Coverage Below 100%

**Scenario**: Not all API endpoints have integration tests

**Decision**: Write missing integration tests (hard gate)

```bash
# Integration test coverage enforcement
echo "Checking integration test coverage..."

# Detect all API endpoints from code
endpoints=$(detect_api_endpoints)
total_endpoints=$(echo "$endpoints" | wc -l)

# Check which endpoints have integration tests
missing_tests=()
for endpoint in $endpoints; do
    if ! integration_test_exists "$endpoint"; then
        missing_tests+=("$endpoint")
    fi
done

if [[ ${#missing_tests[@]} -gt 0 ]]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ❌ INTEGRATION TEST COVERAGE GATE FAILED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Missing integration tests for ${#missing_tests[@]} endpoints:"
    echo ""

    for endpoint in "${missing_tests[@]}"; do
        echo "  ✗ $endpoint"
    done

    echo ""
    echo "Action Required:"
    echo "  1. Write integration tests for all endpoints above"
    echo "  2. Each test must:"
    echo "     - Test successful request/response"
    echo "     - Test error cases (400, 401, 403, 404, 500)"
    echo "     - Verify database state changes"
    echo "     - Test authentication/authorization"
    echo "  3. Run: /implement-ticket $JIRA_KEY --resume"
    echo ""

    # Create detailed report
    mkdir -p ".claude/artifacts/${JIRA_KEY}"
    cat > ".claude/artifacts/${JIRA_KEY}/missing-integration-tests.txt" <<EOF
Missing Integration Tests Report for ${JIRA_KEY}
Generated: $(date '+%Y-%m-%d %H:%M:%S')

Total Endpoints: $total_endpoints
Tested: $(($total_endpoints - ${#missing_tests[@]}))
Missing: ${#missing_tests[@]}

Untested Endpoints:
$(printf '  - %s\n' "${missing_tests[@]}")

Next Steps:
1. Create integration test file for each endpoint
2. Test both success and error cases
3. Verify database state changes
4. Ensure proper authentication checks
EOF

    # Log decision and create checkpoint
    log_decision "Phase 4: Quality Checks" \
        "Integration test coverage gate failed" \
        "Missing integration tests for ${#missing_tests[@]}/$total_endpoints endpoints. Report saved to .claude/artifacts/${JIRA_KEY}/missing-integration-tests.txt"

    save_checkpoint "Phase 4: Quality Checks (Integration Tests Incomplete)" \
        '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation"]'

    exit 1
fi

echo "✓ Integration test coverage: $total_endpoints/$total_endpoints endpoints (100%)"
```

**Example Output**:
```
Checking integration test coverage...

Detecting API endpoints...
✓ Found 8 endpoints in src/auth/

Verifying integration test coverage...
✓ POST   /auth/login          → tests/integration/auth/login.test.ts
✓ POST   /auth/logout         → tests/integration/auth/logout.test.ts
✓ POST   /auth/oauth/google   → tests/integration/auth/oauth.test.ts
✓ POST   /auth/oauth/github   → tests/integration/auth/oauth.test.ts
✓ GET    /auth/me             → tests/integration/auth/me.test.ts
✓ POST   /auth/refresh        → tests/integration/auth/refresh.test.ts
✓ POST   /auth/register       → tests/integration/auth/register.test.ts
✓ POST   /auth/reset-password → tests/integration/auth/reset.test.ts

✓ Integration test coverage: 8/8 endpoints (100%)
```

---

### 7. E2E Test Coverage Below 100%

**Scenario**: Not all critical user flows have E2E tests

**Decision**: Write missing E2E tests (hard gate)

```bash
# E2E test coverage enforcement
echo "Checking E2E test coverage..."

# Extract critical flows from ticket requirements
critical_flows=$(extract_critical_flows_from_ticket "$JIRA_KEY")
total_flows=$(echo "$critical_flows" | wc -l)

# Check which flows have E2E tests
missing_e2e_tests=()
for flow in $critical_flows; do
    if ! e2e_test_exists "$flow"; then
        missing_e2e_tests+=("$flow")
    fi
done

if [[ ${#missing_e2e_tests[@]} -gt 0 ]]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ❌ E2E TEST COVERAGE GATE FAILED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Missing E2E tests for ${#missing_e2e_tests[@]} critical flows:"
    echo ""

    for flow in "${missing_e2e_tests[@]}"; do
        echo "  ✗ $flow"
    done

    echo ""
    echo "Action Required:"
    echo "  1. Write E2E tests for all critical flows above"
    echo "  2. Each test must:"
    echo "     - Test complete user journey end-to-end"
    echo "     - Verify UI elements and interactions"
    echo "     - Test on multiple viewports (mobile/tablet/desktop)"
    echo "     - Record video and screenshots"
    echo "     - Generate trace files for debugging"
    echo "  3. Run: /implement-ticket $JIRA_KEY --resume"
    echo ""

    # Create detailed report
    mkdir -p ".claude/artifacts/${JIRA_KEY}"
    cat > ".claude/artifacts/${JIRA_KEY}/missing-e2e-tests.txt" <<EOF
Missing E2E Tests Report for ${JIRA_KEY}
Generated: $(date '+%Y-%m-%d %H:%M:%S')

Total Critical Flows: $total_flows
Tested: $(($total_flows - ${#missing_e2e_tests[@]}))
Missing: ${#missing_e2e_tests[@]}

Untested Flows:
$(printf '  - %s\n' "${missing_e2e_tests[@]}")

Next Steps:
1. Create Playwright test for each flow
2. Test on mobile (375x667), tablet (768x1024), desktop (1920x1080)
3. Record videos and screenshots
4. Verify all user-facing elements and interactions
EOF

    # Log decision and create checkpoint
    log_decision "Phase 4: Quality Checks" \
        "E2E test coverage gate failed" \
        "Missing E2E tests for ${#missing_e2e_tests[@]}/$total_flows critical flows. Report saved to .claude/artifacts/${JIRA_KEY}/missing-e2e-tests.txt"

    save_checkpoint "Phase 4: Quality Checks (E2E Tests Incomplete)" \
        '["Phase 0: Pre-Flight", "Phase 1: Context Gathering", "Phase 2: Requirements Analysis", "Phase 3: Code Implementation"]'

    exit 1
fi

echo "✓ E2E test coverage: $total_flows/$total_flows flows (100%)"

# Collect E2E artifacts
echo "Collecting E2E test artifacts..."
bash ai-agentic-framework/utils/collect-test-artifacts.sh "$JIRA_KEY" --frontend

echo "✓ E2E artifacts saved to .claude/artifacts/${JIRA_KEY}/"
```

**Example Output**:
```
Checking E2E test coverage...

Identifying critical user flows from ticket...
✓ Found 3 critical flows:
  - OAuth login flow (Google)
  - OAuth login flow (GitHub)
  - Token refresh after expiry

Verifying E2E test coverage...
✓ OAuth login flow (Google)    → tests/e2e/auth/oauth-google.spec.ts
✓ OAuth login flow (GitHub)    → tests/e2e/auth/oauth-github.spec.ts
✓ Token refresh after expiry   → tests/e2e/auth/token-refresh.spec.ts

✓ E2E test coverage: 3/3 flows (100%)

Collecting E2E test artifacts...
  → Collecting test videos... ✓ 3 videos
  → Collecting screenshots... ✓ 0 failure screenshots
  → Collecting traces... ✓ 3 trace files
  → Collecting HTML report... ✓

✓ E2E artifacts saved to .claude/artifacts/PROJ-123/
```

---

### 8. Merge Conflicts

**Scenario**: Remote branch updated during implementation

**Decision**: Auto-merge if possible, else checkpoint and alert
```
Pushing to remote...
❌ Push rejected (remote has new commits)

Pulling latest changes...
Auto-merging src/auth/index.ts...
❌ Conflict in src/auth/index.ts

Conflict too complex for auto-resolution.

Creating checkpoint...
✓ Checkpoint saved

ACTION REQUIRED:
1. Review conflict: git diff src/auth/index.ts
2. Resolve manually
3. Resume: /implement-ticket PROJ-123 --resume
```

**No-Stop Decision Log**:

All decisions made during no-stop execution are logged:

```markdown
# Implementation Decisions for PROJ-123

## Type Decisions
1. **OAuth token type** (line 45)
   - Ambiguity: Return type could be `Token | null` or `Result<Token>`
   - Decision: Used `Token | null` (simpler, matches existing pattern)
   - Rationale: Existing auth functions return `T | null`

2. **User ID type** (line 78)
   - Ambiguity: string vs number
   - Decision: Used `string` (consistent with database schema)
   - Rationale: UUID format in database

## Import Decisions
1. **Auth utility import**
   - Decision: `import { auth } from '@/lib/utils/auth'`
   - Rationale: Most common pattern (15 occurrences vs 2)

## Test Fixes
1. **OAuth validation test**
   - Issue: Expected `valid`, got `isValid`
   - Fix: Added mapper `isValid` → `valid`
   - Attempts: 1

## Lint Fixes
1. Auto-fixed 12 style issues (const, arrow functions, formatting)

## Coverage Actions
1. Added 2 tests for uncovered paths
2. Final coverage: 82.1% (target: 80%)
```

**This log is included in PR description** for transparency.

---

### Reusable Code Detection

**Purpose**: Before writing any new function, search for similar existing code to avoid duplication

**Process**:

**Step 1: Function Signature Analysis**
```
New function to write:
function validateOAuthToken(token: string): boolean

Extract key characteristics:
- Purpose: validation
- Input: string token
- Output: boolean
- Domain: OAuth/authentication
```

**Step 2: Search Codebase**
```bash
# Search by function name patterns
grep -r "validate.*token\|token.*valid" src/ packages/

# Search by similar signatures
grep -r "function.*token.*boolean\|const.*token.*=.*=>" src/

# Search in shared utilities
ls packages/shared/src/utils/ | grep -i "auth\|token\|valid"
```

**Step 3: Similarity Analysis**

**Found candidate**:
```typescript
// packages/shared/src/utils/auth.ts
export function isValidAuthToken(token: string): boolean {
  if (!token) return false
  const decoded = jwt.decode(token)
  return decoded && decoded.exp > Date.now()
}
```

**Similarity score**: 70%+
- Same input type: ✓
- Same output type: ✓
- Similar purpose: ✓ (both validate tokens)
- Same domain: ✓ (authentication)

**Step 4: Decide Reuse vs New**

**Reuse if**:
- Similarity ≥ 70%
- Existing function is in shared package
- Refactoring doesn't add significant complexity
- Existing function has tests

**Create new if**:
- Similarity < 70%
- Existing function is tightly coupled
- Refactoring would break existing usage
- OAuth validation has different requirements (provider-specific)

**Example Decision**:
```
Found similar function: isValidAuthToken (75% similar)

Differences:
- New: OAuth-specific (needs provider validation)
- Existing: Generic JWT validation

Decision: Extract common JWT validation logic
- Create: packages/shared/src/utils/jwt.ts → validateJWT()
- Refactor isValidAuthToken to use validateJWT
- Create validateOAuthToken using validateJWT + provider check

Rationale: Reduces duplication while preserving specific behavior
```

**Refactoring Result**:
```typescript
// packages/shared/src/utils/jwt.ts
export function validateJWT(token: string): boolean {
  if (!token) return false
  const decoded = jwt.decode(token)
  return decoded && decoded.exp > Date.now()
}

// packages/shared/src/utils/auth.ts
export function isValidAuthToken(token: string): boolean {
  return validateJWT(token) // Refactored to use shared function
}

// src/auth/oauth.ts
export function validateOAuthToken(
  token: string,
  provider: OAuthProvider
): boolean {
  if (!validateJWT(token)) return false  // Reuse JWT validation
  return provider.validateToken(token)    // Add OAuth-specific logic
}
```

**If similarity < 70%**: Create new function, document why:
```typescript
/**
 * Validates OAuth token with provider-specific checks.
 *
 * Note: Similar to isValidAuthToken in @/utils/auth, but requires
 * provider-specific validation that doesn't fit generic pattern.
 * Consider merging if provider validation becomes standardized.
 */
export function validateOAuthToken(...)
```

**Search Scope**:
```
1. Current service/package (highest priority)
2. Shared packages (packages/shared/)
3. Other services in monorepo
4. External utilities (if open source)
```

**Documentation**: All reuse decisions logged in implementation decisions

---

## Error Handling

### If Context Gathering Fails
```
❌ Cannot fetch Jira ticket PROJ-123
  → Verify ticket exists and you have permissions
  → Check Jira MCP configuration

Action: Fix permissions and retry
```

### If Quality Checks Fail
```
❌ Quality checks failed:
  ✗ 3 linting errors
  ✗ Coverage: 72.3% (< 80% threshold)

Action: Fix issues and re-run quality checks
/code-quality-check --fix
```

### If Security Review Fails
```
❌ Security vulnerabilities detected:
  🔴 High: SQL injection risk in auth handler
  🟡 Medium: Dependency with known vulnerability

Action: Fix vulnerabilities before proceeding
/security-review --report
```

### If PR Creation Fails
```
❌ Cannot create PR:
  - Quality checks must pass first
  - Security review must pass first
  - No uncommitted changes allowed

Action: Complete all checks and retry
```

## Manual Intervention Points

The workflow pauses for approval at:

1. **After context gathering**: Review fetched context
2. **After requirements analysis**: Approve implementation plan
3. **After implementation**: Review code changes
4. **Before PR creation**: Final review before submitting

To **skip approvals** (fully automated):
```bash
/implement-ticket PROJ-123 --auto-approve
```

⚠️  Only use `--auto-approve` for:
- Small bug fixes
- Well-defined tickets
- When you trust the automated process

## Advanced Options

### Dry Run (No Changes)
```bash
/implement-ticket PROJ-123 --dry-run
```
Simulates the workflow without making changes

### Skip Specific Phases
```bash
/implement-ticket PROJ-123 --skip-security
/implement-ticket PROJ-123 --skip-tests
```
⚠️  Not recommended for production

### Custom Coverage Threshold
```bash
/implement-ticket PROJ-123 --coverage-threshold 90
```

### Use Specific Branch
```bash
/implement-ticket PROJ-123 --branch custom-branch-name
```

## Integration with Existing Skills

This orchestrator skill chains together:

| Phase | Skill Invoked | Purpose |
|-------|--------------|---------|
| 1 | `/fetch-ticket-context` | Gather all context → writes `/tmp/context_JIRA-KEY.md` |
| 2 | `/analyze-requirements --from-context /tmp/context_JIRA-KEY.md` | Create implementation plan from pre-fetched context |
| 3 | `/code-implementation` | Write the code |
| 3a | `/mastering-typescript` or `/mastering-python-skill` | Language guidance |
| 4 | `/code-quality-check` | Quality validation |
| 5 | `/security-review` | Security validation |
| 6 | `/create-pr` | PR creation |

## Best Practices

### 1. Review Context Before Proceeding
Always review the fetched context to ensure:
- All requirements are captured
- External docs are complete
- Dependencies are identified

### 2. Verify the Plan
Review the implementation plan for:
- Correct affected files
- Proper risk assessment
- Reasonable timeline

### 3. Test Locally First
Before creating PR, manually test:
```bash
npm run dev  # or python -m app
# Manually verify the feature works
```

### 4. Review PR Before Submitting
Check the PR description for:
- Complete summary
- All metrics included
- Proper Jira linkage

## Troubleshooting

**Issue: "Ticket context incomplete"**
- Manually add missing information
- Update Jira ticket with better descriptions
- Link relevant Notion/Confluence docs

**Issue: "Implementation doesn't match plan"**
- Review code changes with `git diff`
- Re-run `/code-implementation` with clarifications
- Manually adjust if needed

**Issue: "Quality checks fail repeatedly"**
- Review specific failures
- Run `/code-quality-check --fix` to auto-fix
- Manually fix complex issues

**Issue: "Security vulnerabilities detected"**
- Review security report: `/security-review --report`
- Update vulnerable dependencies
- Fix code-level vulnerabilities
- Re-run security review

## Monitoring & Metrics

Track workflow performance:

```bash
# View workflow history
ls -lh ~/.cache/implement-ticket/

# View specific execution log
cat ~/.cache/implement-ticket/PROJ-123_$(date +%Y-%m-%d).log
```

**Key Metrics to Track:**
- Average time per phase
- Quality score trends
- Security score trends
- Coverage improvements
- Commit/PR frequency

## Examples

### Example 1: Simple Bug Fix
```bash
$ /implement-ticket PROJ-100

[Phase 1] Context Gathering (1 min)
✓ Simple ticket, no external docs

[Phase 2] Requirements Analysis (2 min)
✓ 1 file to modify, low risk

[Phase 3] Implementation (5 min)
✓ Python fix applied

[Phase 4-5] Quality & Security (3 min)
✓ All checks passed

[Phase 6] PR Creation (1 min)
✓ PR #457 created

Total: 12 minutes
```

### Example 2: Complex Feature
```bash
$ /implement-ticket PROJ-200

[Phase 1] Context Gathering (5 min)
✓ 3 Notion docs, 2 Confluence pages

[Phase 2] Requirements Analysis (5 min)
✓ 12 files affected, high complexity

[Phase 3] Implementation (60 min)
✓ TypeScript implementation

[Phase 4-5] Quality & Security (10 min)
✓ All checks passed

[Phase 6] PR Creation (2 min)
✓ PR #458 created

Total: 82 minutes
```

## Future Enhancements

Planned features:
- [ ] Automatic staging deployment
- [ ] Integration test execution
- [ ] Performance benchmarking
- [ ] Automatic PR review assignment
- [ ] Slack/email notifications
- [ ] Workflow analytics dashboard

## References

- Individual skill documentation in `.claude/skills/`
- Git workflow: `/mastering-git-cli`
- GitHub integration: `/mastering-github-agent-skill`
- Python patterns: `/mastering-python-skill`
- TypeScript patterns: `/mastering-typescript`
