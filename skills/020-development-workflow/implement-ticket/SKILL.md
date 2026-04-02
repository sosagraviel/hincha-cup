---
name: implement-ticket
description: End-to-end ticket implementation with stack-agnostic testing, visual verification, and automated documentation updates. Supports 1000+ parallel tickets with isolated environments.
argument-hint: '[--from-jira JIRA-URL-OR-KEY | --from-markdown PATH]'
---

# Implement Ticket V2 - Production Autonomous Workflow

## ⚠️ Migration Notice

> **This skill now uses the TypeScript orchestration module.**
>
> ### New Approach (Orchestration CLI)
>
> ```bash
> # From project root
> cd orchestration
> npm run implement -- --from-jira PROJ-123
> ```
>
> ### Orchestration Implementation
>
> The utilities referenced below have been migrated to `orchestration/src/`:
>
> - **Stack Detection**: `services/implement-ticket/project-config-reader.service.ts`
> - **Test Framework Detection**: `services/implement-ticket/test-orchestrator.service.ts`
> - **Environment Management**: `services/implement-ticket/environment-manager.service.ts`
> - **Screenshot Capture**: `services/implement-ticket/screenshot.service.ts`
> - **Test Orchestration**: `services/implement-ticket/test-orchestrator.service.ts`
> - **Artifact Collection**: `services/implement-ticket/artifact-collector.service.ts`
>
> **The utility paths in the tables below reference deprecated locations for historical context.**

---

Complete SDLC workflow with:

- ✅ Stack-agnostic testing (TypeScript, Python, Go, Java, Rust, Ruby)
- ✅ Automated E2E framework initialization (Playwright)
- ✅ Visual verification with pixel-perfect iteration
- ✅ Parallel ticket support (1000+ concurrent tickets)
- ✅ Automated documentation updates (CLAUDE.md, project-context)
- ✅ Post-PR review loop with automated fixes
- ✅ Comprehensive artifact collection (screenshots, videos, coverage)

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

## Execution Modes

### Interactive Mode (Default)

Prompts user for confirmation at key decision points:

- After context gathering (Phase 1)
- After planning (Phase 2)
- After visual verification (Phase 6)
- Before PR creation (Phase 8)

**Usage**:

```bash
/implement-ticket PROJ-123
# OR
/implement-ticket PROJ-123 --interactive
```

**Best for**: Learning the workflow, reviewing plans, supervised development

---

### Autonomous Mode (--no-stop)

Runs end-to-end without user prompts. Only stops on hard errors:

- Coverage gate failures (<80% coverage after 3 attempts)
- Visual verification failures (>5% diff after 5 iterations)
- Merge conflicts that cannot be auto-resolved
- Critical build/test failures

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

**Best for**: Production workflows, overnight runs, CI/CD integration

**Decision Logging**: All autonomous decisions logged to `.claude/decisions/PROJ-123.md` and included in PR

---

## 10-Phase Workflow Architecture

```
Phase 0: Pre-Flight Validation
    ↓
Phase 1: Context Gathering (Jira, Notion, Confluence, Figma, etc.)
    ↓
Phase 2: Planning & Architectural Design (with Test Plan)
    ↓
Phase 3: Environment Setup (Isolated Docker Compose + Port Allocation)
    ↓ (Capture "before" screenshots)
    ↓
Phase 4: Implementation (Code + Unit Tests + Integration Tests)
    ↓
Phase 5: Testing (Unit → Integration → E2E with stack detection)
    ↓
Phase 6: Visual Verification (Screenshot comparison + iteration loop)
    ↓ (Iterate up to 5 times if diff > 5%)
    ↓
Phase 7: Documentation Update (CLAUDE.md + project-context)
    ↓
Phase 8: PR Creation (with artifacts: screenshots, videos, coverage)
    ↓
Phase 9: Review Loop (PR feedback → fixes → re-test)
    ↓ (Iterate up to 3 times for blocking issues)
    ↓
Phase 10: Cleanup (Teardown isolated environment)
```

## Stack Support Matrix

| Stack                 | Unit Tests               | Integration Tests      | E2E Tests                     | Auto-Init E2E |
| --------------------- | ------------------------ | ---------------------- | ----------------------------- | ------------- |
| TypeScript/JavaScript | Jest, Vitest, Mocha, Ava | Jest, Supertest        | Playwright, Cypress, TestCafe | ✅ Playwright |
| Python                | Pytest, unittest         | Pytest, Flask-Testing  | Playwright                    | ✅ Playwright |
| Go                    | go test                  | go test                | Playwright                    | ✅ Playwright |
| Java                  | JUnit (Maven/Gradle)     | JUnit + TestContainers | Playwright                    | ✅ Playwright |
| Rust                  | cargo test               | cargo test             | Playwright                    | ✅ Playwright |
| Ruby                  | RSpec, Minitest          | RSpec                  | Playwright                    | ✅ Playwright |

**Note**: If no E2E framework is detected, Playwright will be automatically installed and configured.

## Parallel Ticket Support

Supports **1000+ parallel tickets** with isolated environments:

```bash
# Terminal 1
/implement-ticket PROJ-123 --no-stop

# Terminal 2 (simultaneously)
/implement-ticket PROJ-456 --no-stop

# Terminal 3 (simultaneously)
/implement-ticket PROJ-789 --no-stop
```

**How It Works**:

- Each ticket gets a unique port range via hash-based allocation
- Docker Compose override files for isolation (`docker-compose.PROJ-123.yml`)
- Separate artifact directories (`.claude/artifacts/PROJ-123/`)
- Base port range: 10000 (100 ports per ticket)
- Supports 500 concurrent tickets: 10000-59999

**Example Port Allocation**:

```
PROJ-123 (hash=42)  → Ports 14200-14299
PROJ-456 (hash=137) → Ports 23700-23799
PROJ-789 (hash=221) → Ports 32100-32199
```

---

# Phase 0: Pre-Flight Validation

**Goal**: Validate environment, detect stack, and prepare for implementation.

```bash
#!/bin/bash
set -e

TICKET_ID="$1"
INPUT_SOURCE="$2"  # --from-jira or --from-markdown
INPUT_VALUE="$3"   # URL/key or file path

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Validate environment and detect stack",
    status: "in_progress",
    activeForm: "Validating environment and detecting stack"
  }]
})

echo "🚀 Phase 0: Pre-Flight Validation"
echo "=================================="

# Step 1: Validate git repository
echo "  - Checking git repository..."
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not a git repository. Run 'git init' first."
    exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠️  You have uncommitted changes. Commit or stash them first."
    exit 1
fi

# Step 2: Create artifact directories
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"
mkdir -p "$ARTIFACTS_DIR"/{context,plans,implementations,tests,screenshots/{before,after,diffs},videos,coverage,decisions}

export ARTIFACTS_DIR

# Step 3: Detect stack and test frameworks
echo "  - Detecting stack..."

UTILS_DIR="$HOME/.claude/utils"

node -e "
const { StackDetector } = require('$UTILS_DIR/stack-detection.js');

const detector = new StackDetector(process.cwd());
detector.detect().then(stack => {
    console.log(JSON.stringify(stack, null, 2));
});
" > "$ARTIFACTS_DIR/stack-profile.json"

# Step 4: Detect test frameworks
echo "  - Detecting test frameworks..."

node -e "
const { TestFrameworkDetector } = require('$UTILS_DIR/test-framework-detection.js');

const detector = new TestFrameworkDetector(process.cwd());
detector.detectAll().then(frameworks => {
    console.log(JSON.stringify(frameworks, null, 2));

    if (frameworks.e2e.length === 0) {
        console.log('⚠️  No E2E framework detected. Playwright will be initialized in Phase 3.');
    }
});
" > "$ARTIFACTS_DIR/test-frameworks.json"

# Step 5: Detect environment orchestration
echo "  - Detecting environment setup..."

node -e "
const { EnvironmentDetector } = require('$UTILS_DIR/environment-detection.js');

const detector = new EnvironmentDetector(process.cwd());
detector.detect().then(envConfig => {
    console.log(JSON.stringify(envConfig, null, 2));
});
" > "$ARTIFACTS_DIR/env-config.json"

# Step 6: Validate input source
echo "  - Validating input source..."

if [[ "$INPUT_SOURCE" == "--from-jira" ]]; then
    # Validate Jira connection
    if ! command -v gh &> /dev/null; then
        echo "❌ GitHub CLI (gh) not installed. Install it first: https://cli.github.com/"
        exit 1
    fi

    # Check if Jira MCP is configured
    if ! grep -q "jira-mcp-server" ~/.claude/mcp.json 2>/dev/null; then
        echo "⚠️  Jira MCP server not configured. Context gathering may be limited."
    fi

elif [[ "$INPUT_SOURCE" == "--from-markdown" ]]; then
    # Validate markdown file exists
    if [[ ! -f "$INPUT_VALUE" ]]; then
        echo "❌ Markdown file not found: $INPUT_VALUE"
        exit 1
    fi

    # Validate markdown file has required sections
    if ! grep -q "## Summary" "$INPUT_VALUE" || ! grep -q "## Acceptance Criteria" "$INPUT_VALUE"; then
        echo "❌ Invalid markdown spec. Must contain '## Summary' and '## Acceptance Criteria' sections."
        echo "   Run '/create-sdd-ticket' to generate a valid spec."
        exit 1
    fi

else
    echo "❌ Invalid input source. Use --from-jira or --from-markdown"
    exit 1
fi

echo ""
echo "✅ Pre-flight validation complete"
echo "   - Stack detected: $(jq -r '.primaryLanguage' $ARTIFACTS_DIR/stack-profile.json)"
echo "   - Unit test framework: $(jq -r '.unit[0].name // "None"' $ARTIFACTS_DIR/test-frameworks.json)"
echo "   - E2E test framework: $(jq -r '.e2e[0].name // "None (will auto-init Playwright)"' $ARTIFACTS_DIR/test-frameworks.json)"
echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Validate environment and detect stack",
    status: "completed",
    activeForm: "Validating environment and detecting stack"
  }]
})
```

---

# Phase 1: Context Gathering

**Goal**: Gather all context from Jira, external documentation, and markdown specs.

**Agent Used**: `context-gatherer-{JIRA_KEY}` (Opus model)

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Gather context from Jira/Markdown and external documentation",
    status: "in_progress",
    activeForm: "Gathering context from Jira/Markdown and external documentation"
  }]
})

echo "📖 Phase 1: Context Gathering"
echo "=============================="

TICKET_ID="$1"
INPUT_SOURCE="$2"
INPUT_VALUE="$3"

ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"

# Spawn context-gatherer agent
if [[ "$INPUT_SOURCE" == "--from-jira" ]]; then
    echo "  - Gathering context from Jira ticket: $INPUT_VALUE"
    echo "  - Fetching external documentation (Notion, Confluence, Figma)..."

    claude-agent spawn context-gatherer-$TICKET_ID \
        --template agents/templates/context-gatherer.template.md \
        --vars "JIRA_KEY=$TICKET_ID,JIRA_URL=$INPUT_VALUE" \
        --output "$ARTIFACTS_DIR/context/full-context.md"

elif [[ "$INPUT_SOURCE" == "--from-markdown" ]]; then
    echo "  - Reading context from markdown spec: $INPUT_VALUE"

    # Simply copy markdown spec to context directory
    cp "$INPUT_VALUE" "$ARTIFACTS_DIR/context/full-context.md"

    echo "  - Checking for external documentation references..."

    # Extract any Notion/Confluence/Figma links from markdown
    EXTERNAL_LINKS=$(grep -oE 'https://(www\.)?(notion\.so|atlassian\.net|figma\.com)/[^ ]+' "$INPUT_VALUE" || true)

    if [[ -n "$EXTERNAL_LINKS" ]]; then
        echo "  - Found external documentation links. Fetching..."

        # Spawn context-gatherer to fetch external docs
        claude-agent spawn context-gatherer-$TICKET_ID \
            --template agents/templates/context-gatherer.template.md \
            --vars "JIRA_KEY=$TICKET_ID,EXTERNAL_LINKS=$EXTERNAL_LINKS" \
            --output "$ARTIFACTS_DIR/context/external-docs.md"

        # Append external docs to full context
        cat "$ARTIFACTS_DIR/context/external-docs.md" >> "$ARTIFACTS_DIR/context/full-context.md"
    fi
fi

# Validate context was gathered
if [[ ! -f "$ARTIFACTS_DIR/context/full-context.md" ]]; then
    echo "❌ Context gathering failed. No context file generated."
    exit 1
fi

CONTEXT_SIZE=$(wc -l < "$ARTIFACTS_DIR/context/full-context.md")
echo ""
echo "✅ Context gathering complete"
echo "   - Context size: $CONTEXT_SIZE lines"
echo "   - Saved to: $ARTIFACTS_DIR/context/full-context.md"
echo ""

# Interactive mode: Ask user to review context
if [[ "${CLAUDE_AUTO_MODE:-false}" != "true" ]] && [[ "$*" != *"--no-stop"* ]]; then
    echo "📋 Review the gathered context:"
    echo "   cat $ARTIFACTS_DIR/context/full-context.md"
    echo ""
    read -p "Continue to planning? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Workflow stopped by user."
        exit 1
    fi
fi

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Gather context from Jira/Markdown and external documentation",
    status: "completed",
    activeForm: "Gathering context from Jira/Markdown and external documentation"
  }]
})
```

---

# Phase 2: Planning & Architectural Design

**Goal**: Create detailed implementation plan with test strategy and environment requirements.

**Agent Used**: `planner` (Opus model)

````bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Create implementation plan with test strategy",
    status: "in_progress",
    activeForm: "Creating implementation plan with test strategy"
  }]
})

echo "📐 Phase 2: Planning & Architectural Design"
echo "============================================"

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"

# Read full context
FULL_CONTEXT=$(cat "$ARTIFACTS_DIR/context/full-context.md")

# Spawn planner agent (uses updated template with test planning)
echo "  - Creating implementation plan..."

claude-agent spawn planner \
    --template agents/templates/planner.template.md \
    --vars "JIRA_KEY=$TICKET_ID,CONTEXT=$FULL_CONTEXT" \
    --skills "project-context,analyze-requirements" \
    --output "$ARTIFACTS_DIR/plans/implementation-plan.md"

# Validate plan was created
if [[ ! -f "$ARTIFACTS_DIR/plans/implementation-plan.md" ]]; then
    echo "❌ Planning failed. No plan file generated."
    exit 1
fi

# Extract test plan from implementation plan
echo "  - Extracting test plan..."

TEST_PLAN=$(grep -A 200 "### 7. Testing Strategy" "$ARTIFACTS_DIR/plans/implementation-plan.md" | sed -n '/```json/,/```/p' | sed '1d;$d')

if [[ -z "$TEST_PLAN" ]]; then
    echo "⚠️  No test plan found in implementation plan. Using default test strategy."
    TEST_PLAN='{
  "unit": { "framework": "jest", "coverageTarget": 80 },
  "integration": { "framework": "jest" },
  "e2e": { "framework": "playwright", "pages": [] },
  "visualVerification": { "required": false }
}'
fi

echo "$TEST_PLAN" > "$ARTIFACTS_DIR/plans/test-plan.json"

# Extract environment requirements
echo "  - Extracting environment requirements..."

ENV_REQUIREMENTS=$(grep -A 50 "### 8. Environment Requirements" "$ARTIFACTS_DIR/plans/implementation-plan.md" | sed -n '/```json/,/```/p' | sed '1d;$d' || echo '{"requiresEnvironmentSetup": false}')

echo "$ENV_REQUIREMENTS" > "$ARTIFACTS_DIR/plans/env-requirements.json"

echo ""
echo "✅ Planning complete"
echo "   - Implementation plan: $ARTIFACTS_DIR/plans/implementation-plan.md"
echo "   - Test plan: $ARTIFACTS_DIR/plans/test-plan.json"
echo "   - Environment requirements: $ARTIFACTS_DIR/plans/env-requirements.json"
echo ""

# Show plan summary
echo "📋 Plan Summary:"
grep -A 3 "### 1. Summary" "$ARTIFACTS_DIR/plans/implementation-plan.md" | tail -n +2
echo ""

AFFECTED_FILES=$(grep -A 100 "### 2. Affected Files" "$ARTIFACTS_DIR/plans/implementation-plan.md" | grep -E "^(CREATE|UPDATE):" | wc -l)
echo "   - Files to modify: $AFFECTED_FILES"

VISUAL_REQUIRED=$(echo "$TEST_PLAN" | jq -r '.visualVerification.required')
echo "   - Visual verification: $([[ "$VISUAL_REQUIRED" == "true" ]] && echo "Required" || echo "Not required")"
echo ""

# Interactive mode: Ask user to review plan
if [[ "${CLAUDE_AUTO_MODE:-false}" != "true" ]] && [[ "$*" != *"--no-stop"* ]]; then
    echo "📋 Review the implementation plan:"
    echo "   cat $ARTIFACTS_DIR/plans/implementation-plan.md"
    echo ""
    read -p "Continue to environment setup? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Workflow stopped by user."
        exit 1
    fi
fi

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Create implementation plan with test strategy",
    status: "completed",
    activeForm: "Creating implementation plan with test strategy"
  }]
})
````

---

# Phase 3: Environment Setup (NEW)

**Goal**: Set up isolated Docker Compose environment with unique port allocation and capture "before" screenshots.

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Set up isolated environment and capture before screenshots",
    status: "in_progress",
    activeForm: "Setting up isolated environment and capturing before screenshots"
  }]
})

echo "🔧 Phase 3: Environment Setup"
echo "=============================="

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"
UTILS_DIR="$HOME/.claude/utils"

# Read environment requirements
ENV_REQUIREMENTS=$(cat "$ARTIFACTS_DIR/plans/env-requirements.json")
REQUIRES_SETUP=$(echo "$ENV_REQUIREMENTS" | jq -r '.requiresEnvironmentSetup')

if [[ "$REQUIRES_SETUP" == "true" ]]; then
    echo "  - Setting up isolated environment for $TICKET_ID..."

    # Use EnvironmentManager utility
    node -e "
    const { EnvironmentManager } = require('$UTILS_DIR/environment-manager.js');

    const envRequirements = $ENV_REQUIREMENTS;
    const manager = new EnvironmentManager('$TICKET_ID', process.cwd());

    manager.setup(envRequirements).then(config => {
        console.log('Environment setup complete:');
        console.log('  - Override file: ' + config.overrideFile);
        console.log('  - Port range: ' + config.portRange.start + '-' + config.portRange.end);

        // Write config to artifact
        require('fs').writeFileSync('$ARTIFACTS_DIR/environment-config.json', JSON.stringify(config, null, 2));

        return config;
    }).catch(err => {
        console.error('Environment setup failed:', err.message);
        process.exit(1);
    });
    "

    echo "  - Starting services..."

    ENV_CONFIG=$(cat "$ARTIFACTS_DIR/environment-config.json")
    OVERRIDE_FILE=$(echo "$ENV_CONFIG" | jq -r '.overrideFile')

    docker compose -f docker-compose.yml -f "$OVERRIDE_FILE" up -d

    # Wait for services to be healthy
    echo "  - Waiting for services to be ready..."
    sleep 10

    # Run seed data if required
    SEED_REQUIRED=$(echo "$ENV_REQUIREMENTS" | jq -r '.seedData.required')
    if [[ "$SEED_REQUIRED" == "true" ]]; then
        echo "  - Running seed data..."
        SEED_SCRIPTS=$(echo "$ENV_REQUIREMENTS" | jq -r '.seedData.scripts[]')
        for script in $SEED_SCRIPTS; do
            echo "    - Running $script"
            node "$script"
        done
    fi

else
    echo "  - No isolated environment needed. Using existing setup."
fi

# Step 2: Initialize E2E framework if needed
TEST_FRAMEWORKS=$(cat "$ARTIFACTS_DIR/test-frameworks.json")
E2E_DETECTED=$(echo "$TEST_FRAMEWORKS" | jq -r '.e2e | length > 0')

if [[ "$E2E_DETECTED" == "false" ]]; then
    echo ""
    echo "  - No E2E framework detected. Initializing Playwright..."

    # Detect package manager
    if [[ -f "pnpm-lock.yaml" ]]; then
        PKG_MANAGER="pnpm"
    elif [[ -f "yarn.lock" ]]; then
        PKG_MANAGER="yarn"
    else
        PKG_MANAGER="npm"
    fi

    # Install Playwright
    $PKG_MANAGER add -D @playwright/test@latest
    npx playwright install chromium

    # Create Playwright config
    cat > playwright.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/e2e-results.json' }]
  ],
  use: {
    trace: 'on',
    video: 'on',
    screenshot: 'only-on-failure',
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
EOF

    # Create tests/e2e directory
    mkdir -p tests/e2e

    echo "  ✅ Playwright initialized"
fi

# Step 3: Capture "before" screenshots if visual verification is required
TEST_PLAN=$(cat "$ARTIFACTS_DIR/plans/test-plan.json")
VISUAL_REQUIRED=$(echo "$TEST_PLAN" | jq -r '.visualVerification.required')

if [[ "$VISUAL_REQUIRED" == "true" ]]; then
    echo ""
    echo "  - Capturing 'before' screenshots for visual verification..."

    # Read environment config to get base URL
    if [[ -f "$ARTIFACTS_DIR/environment-config.json" ]]; then
        ENV_CONFIG=$(cat "$ARTIFACTS_DIR/environment-config.json")
        BASE_PORT=$(echo "$ENV_CONFIG" | jq -r '.ports.frontend[0].host // 3000')
        BASE_URL="http://localhost:$BASE_PORT"
    else
        BASE_URL="http://localhost:3000"
    fi

    # Extract pages from test plan
    PAGES_TO_CAPTURE=$(echo "$TEST_PLAN" | jq -c '.e2e.pages[]')

    node -e "
    const { ScreenshotCapture } = require('$UTILS_DIR/screenshot-capture.js');

    const testPlan = $TEST_PLAN;
    const pages = testPlan.e2e.pages || [];

    if (pages.length === 0) {
        console.log('  - No pages specified in test plan. Skipping screenshot capture.');
        process.exit(0);
    }

    const capture = new ScreenshotCapture('$TICKET_ID', process.cwd(), {
        baseUrl: '$BASE_URL',
        outputDir: '$ARTIFACTS_DIR/screenshots/before',
        authRequired: false  // Will detect from environment
    });

    capture.captureAllPages(pages, 'before').then(() => {
        console.log('  ✅ Before screenshots captured');
    }).catch(err => {
        console.error('Screenshot capture failed:', err.message);
        // Non-fatal error - continue workflow
    });
    "
fi

echo ""
echo "✅ Environment setup complete"
[[ "$REQUIRES_SETUP" == "true" ]] && echo "   - Isolated environment running on ports: $(echo "$ENV_CONFIG" | jq -r '.portRange.start')-$(echo "$ENV_CONFIG" | jq -r '.portRange.end')"
echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Set up isolated environment and capture before screenshots",
    status: "completed",
    activeForm: "Setting up isolated environment and capturing before screenshots"
  }]
})
```

---

# Phase 4: Implementation

**Goal**: Implement code changes following the plan, including unit tests and integration tests marked with `@new` tag.

**Agent Used**: `implementer-{stack}` (Sonnet model)

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Implement code changes with unit and integration tests",
    status: "in_progress",
    activeForm: "Implementing code changes with unit and integration tests"
  }]
})

echo "⚙️  Phase 4: Implementation"
echo "=========================="

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"

# Read stack profile
STACK_PROFILE=$(cat "$ARTIFACTS_DIR/stack-profile.json")
PRIMARY_LANGUAGE=$(echo "$STACK_PROFILE" | jq -r '.primaryLanguage')

# Read implementation plan
IMPLEMENTATION_PLAN=$(cat "$ARTIFACTS_DIR/plans/implementation-plan.md")

# Spawn stack-specific implementer agent (uses updated template with test creation)
echo "  - Implementing code changes ($PRIMARY_LANGUAGE)..."

claude-agent spawn implementer-$PRIMARY_LANGUAGE \
    --template agents/templates/implementer.template.md \
    --vars "JIRA_KEY=$TICKET_ID,PLAN=$IMPLEMENTATION_PLAN,STACK=$PRIMARY_LANGUAGE" \
    --skills "project-context,$PRIMARY_LANGUAGE-best-practices" \
    --output "$ARTIFACTS_DIR/implementations/implementation-log.md"

# Validate implementation
if [[ ! -f "$ARTIFACTS_DIR/implementations/implementation-log.md" ]]; then
    echo "❌ Implementation failed. No log file generated."
    exit 1
fi

# Check for new files created
NEW_FILES=$(git status --short | grep "^A " | wc -l)
MODIFIED_FILES=$(git status --short | grep "^M " | wc -l)

echo ""
echo "✅ Implementation complete"
echo "   - New files: $NEW_FILES"
echo "   - Modified files: $MODIFIED_FILES"
echo ""

# Show summary of changes
echo "📋 Changes Summary:"
git status --short
echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Implement code changes with unit and integration tests",
    status: "completed",
    activeForm: "Implementing code changes with unit and integration tests"
  }]
})
```

---

# Phase 5: Testing

**Goal**: Run all tests (unit, integration, E2E) with stack-agnostic orchestration and collect coverage.

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Run all tests (unit, integration, E2E) and check coverage",
    status: "in_progress",
    activeForm: "Running all tests and checking coverage"
  }]
})

echo "✅ Phase 5: Testing"
echo "==================="

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"
UTILS_DIR="$HOME/.claude/utils"

# Use TestOrchestrator to run all tests
echo "  - Running all tests (unit, integration, E2E)..."

node -e "
const { TestOrchestrator } = require('$UTILS_DIR/test-orchestrator.js');

const orchestrator = new TestOrchestrator(process.cwd(), {
    collectCoverage: true,
    onlyNew: false,  // Run all tests, not just @new tagged
    timeout: 600000,  // 10 minutes
    artifactDir: '$ARTIFACTS_DIR/tests'
});

orchestrator.runAll().then(results => {
    // Write results to artifact
    require('fs').writeFileSync('$ARTIFACTS_DIR/tests/test-results.json', JSON.stringify(results, null, 2));

    const summary = orchestrator.getSummary();

    console.log('');
    console.log('📊 Test Results Summary:');
    console.log('========================');
    console.log('');
    console.log('Unit Tests:');
    console.log('  - Total: ' + summary.unit.total);
    console.log('  - Passed: ' + summary.unit.passed);
    console.log('  - Failed: ' + summary.unit.failed);
    console.log('  - Coverage: ' + summary.unit.coverage + '%');
    console.log('');
    console.log('Integration Tests:');
    console.log('  - Total: ' + summary.integration.total);
    console.log('  - Passed: ' + summary.integration.passed);
    console.log('  - Failed: ' + summary.integration.failed);
    console.log('');
    console.log('E2E Tests:');
    console.log('  - Total: ' + summary.e2e.total);
    console.log('  - Passed: ' + summary.e2e.passed);
    console.log('  - Failed: ' + summary.e2e.failed);
    console.log('');
    console.log('Overall Status: ' + (summary.overall.status === 'passed' ? '✅ PASSED' : '❌ FAILED'));
    console.log('');

    // Exit with error if tests failed
    if (summary.overall.status === 'failed') {
        console.error('❌ Tests failed. Fix issues before continuing.');
        process.exit(1);
    }

    // Check coverage gate (80% minimum)
    if (summary.unit.coverage < 80) {
        console.error('❌ Coverage gate failed. Minimum 80% required, got ' + summary.unit.coverage + '%');
        process.exit(1);
    }

}).catch(err => {
    console.error('❌ Test execution failed:', err.message);
    process.exit(1);
});
"

echo "✅ All tests passed"
echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Run all tests (unit, integration, E2E) and check coverage",
    status: "completed",
    activeForm: "Running all tests and checking coverage"
  }]
})
```

---

# Phase 6: Visual Verification (NEW)

**Goal**: Capture "after" screenshots, compare with "before", and iterate until pixel-perfect (max 5 iterations).

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Capture and compare screenshots with iteration loop",
    status: "in_progress",
    activeForm: "Capturing and comparing screenshots with iteration loop"
  }]
})

echo "📸 Phase 6: Visual Verification"
echo "================================"

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"
UTILS_DIR="$HOME/.claude/utils"

# Check if visual verification is required
TEST_PLAN=$(cat "$ARTIFACTS_DIR/plans/test-plan.json")
VISUAL_REQUIRED=$(echo "$TEST_PLAN" | jq -r '.visualVerification.required')

if [[ "$VISUAL_REQUIRED" != "true" ]]; then
    echo "  - Visual verification not required for this ticket. Skipping."
    echo ""
    exit 0
fi

# Capture "after" screenshots
echo "  - Capturing 'after' screenshots..."

# Read environment config to get base URL
if [[ -f "$ARTIFACTS_DIR/environment-config.json" ]]; then
    ENV_CONFIG=$(cat "$ARTIFACTS_DIR/environment-config.json")
    BASE_PORT=$(echo "$ENV_CONFIG" | jq -r '.ports.frontend[0].host // 3000')
    BASE_URL="http://localhost:$BASE_PORT"
else
    BASE_URL="http://localhost:3000"
fi

PAGES_TO_CAPTURE=$(echo "$TEST_PLAN" | jq -c '.e2e.pages[]')

node -e "
const { ScreenshotCapture } = require('$UTILS_DIR/screenshot-capture.js');

const testPlan = $TEST_PLAN;
const pages = testPlan.e2e.pages || [];

const capture = new ScreenshotCapture('$TICKET_ID', process.cwd(), {
    baseUrl: '$BASE_URL',
    outputDir: '$ARTIFACTS_DIR/screenshots/after',
    authRequired: false
});

capture.captureAllPages(pages, 'after').then(() => {
    console.log('  ✅ After screenshots captured');
}).catch(err => {
    console.error('Screenshot capture failed:', err.message);
    process.exit(1);
});
"

# Compare screenshots
echo "  - Comparing screenshots..."

node -e "
const { ScreenshotComparator } = require('$UTILS_DIR/screenshot-comparator.js');

const comparator = new ScreenshotComparator('$TICKET_ID', process.cwd(), {
    threshold: 0.1,
    maxDiffPercent: 5.0,
    includeAntiAliasing: false
});

const beforeDir = '$ARTIFACTS_DIR/screenshots/before';
const afterDir = '$ARTIFACTS_DIR/screenshots/after';
const expectedDir = '$ARTIFACTS_DIR/screenshots/expected';  // Optional: from Figma/design

comparator.compareScreenshots(beforeDir, afterDir, expectedDir).then(report => {
    // Write report to artifact
    require('fs').writeFileSync('$ARTIFACTS_DIR/screenshots/diffs/visual-diff-report.json', JSON.stringify(report, null, 2));

    console.log('');
    console.log('📊 Visual Diff Report:');
    console.log('======================');
    console.log('');
    console.log('Overall Score: ' + report.overallScore.toFixed(2) + '%');
    console.log('Status: ' + report.overallStatus);
    console.log('');
    console.log('Comparisons:');
    report.comparisons.forEach(comp => {
        console.log('  - ' + comp.fileName + ': ' + comp.status + ' (' + comp.diffPercent.toFixed(2) + '% diff)');
    });
    console.log('');

}).catch(err => {
    console.error('Screenshot comparison failed:', err.message);
    process.exit(1);
});
"

# Read comparison report
VISUAL_REPORT=$(cat "$ARTIFACTS_DIR/screenshots/diffs/visual-diff-report.json")
VISUAL_STATUS=$(echo "$VISUAL_REPORT" | jq -r '.overallStatus')

echo "  - Visual verification status: $VISUAL_STATUS"
echo ""

# Iteration loop (max 5 iterations)
MAX_ITERATIONS=5
ITERATION=1

while [[ "$VISUAL_STATUS" != "PASS" ]] && [[ $ITERATION -le $MAX_ITERATIONS ]]; do
    echo "🔄 Visual Verification Iteration $ITERATION/$MAX_ITERATIONS"
    echo "=============================================="

    echo "  - Spawning visual-verifier agent to analyze differences..."

    # Spawn visual-verifier agent
    claude-agent spawn visual-verifier-$TICKET_ID \
        --template agents/templates/visual-verifier.template.md \
        --vars "JIRA_KEY=$TICKET_ID,DIFF_REPORT=$VISUAL_REPORT" \
        --output "$ARTIFACTS_DIR/screenshots/diffs/visual-verification-analysis-iter-$ITERATION.json"

    # Read analysis
    ANALYSIS=$(cat "$ARTIFACTS_DIR/screenshots/diffs/visual-verification-analysis-iter-$ITERATION.json")

    echo "  - Analysis complete. Found $(echo "$ANALYSIS" | jq -r '.overallAssessment.totalDifferences') differences."

    # Check if design review is required
    REQUIRES_DESIGN_REVIEW=$(echo "$ANALYSIS" | jq -r '.overallAssessment.requiresDesignReview')

    if [[ "$REQUIRES_DESIGN_REVIEW" == "true" ]]; then
        echo "⚠️  Large visual differences detected (>20%). Manual design review recommended."
        echo "   - Review analysis: $ARTIFACTS_DIR/screenshots/diffs/visual-verification-analysis-iter-$ITERATION.json"

        # In autonomous mode, log decision and continue
        if [[ "${CLAUDE_AUTO_MODE:-false}" == "true" ]] || [[ "$*" == *"--no-stop"* ]]; then
            echo "   - Autonomous mode: Continuing with automated fixes (may not be pixel-perfect)."
            echo "Decision: Large visual diff (>20%), continuing with automated fixes" >> "$ARTIFACTS_DIR/decisions/$TICKET_ID.md"
        else
            read -p "Continue with automated fixes? (y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "❌ Visual verification stopped by user."
                exit 1
            fi
        fi
    fi

    # Apply fixes from analysis
    echo "  - Applying fixes from visual-verifier analysis..."

    IMPLEMENTATION_PLAN=$(echo "$ANALYSIS" | jq -r '.implementationPlan[]' | tr '\n' ';')

    # Spawn implementer to apply fixes
    claude-agent spawn implementer-visual-fixes-$ITERATION \
        --template agents/templates/implementer.template.md \
        --vars "JIRA_KEY=$TICKET_ID,PLAN=$IMPLEMENTATION_PLAN" \
        --output "$ARTIFACTS_DIR/implementations/visual-fixes-iter-$ITERATION.md"

    # Re-capture "after" screenshots
    echo "  - Re-capturing 'after' screenshots..."

    node -e "
    const { ScreenshotCapture } = require('$UTILS_DIR/screenshot-capture.js');

    const testPlan = $TEST_PLAN;
    const pages = testPlan.e2e.pages || [];

    const capture = new ScreenshotCapture('$TICKET_ID', process.cwd(), {
        baseUrl: '$BASE_URL',
        outputDir: '$ARTIFACTS_DIR/screenshots/after',
        authRequired: false
    });

    capture.captureAllPages(pages, 'after').then(() => {
        console.log('  ✅ After screenshots re-captured');
    });
    "

    # Re-compare screenshots
    echo "  - Re-comparing screenshots..."

    node -e "
    const { ScreenshotComparator } = require('$UTILS_DIR/screenshot-comparator.js');

    const comparator = new ScreenshotComparator('$TICKET_ID', process.cwd(), {
        threshold: 0.1,
        maxDiffPercent: 5.0
    });

    comparator.compareScreenshots('$ARTIFACTS_DIR/screenshots/before', '$ARTIFACTS_DIR/screenshots/after').then(report => {
        require('fs').writeFileSync('$ARTIFACTS_DIR/screenshots/diffs/visual-diff-report-iter-$ITERATION.json', JSON.stringify(report, null, 2));

        console.log('  - New visual status: ' + report.overallStatus);
    });
    "

    # Read new report
    VISUAL_REPORT=$(cat "$ARTIFACTS_DIR/screenshots/diffs/visual-diff-report-iter-$ITERATION.json")
    VISUAL_STATUS=$(echo "$VISUAL_REPORT" | jq -r '.overallStatus')

    ITERATION=$((ITERATION + 1))
    echo ""
done

if [[ "$VISUAL_STATUS" == "PASS" ]]; then
    echo "✅ Visual verification passed after $((ITERATION - 1)) iteration(s)"
else
    echo "⚠️  Visual verification did not pass after $MAX_ITERATIONS iterations"
    echo "   - Final diff score: $(echo "$VISUAL_REPORT" | jq -r '.overallScore')%"
    echo "   - Review diffs: $ARTIFACTS_DIR/screenshots/diffs/"

    # In autonomous mode, log decision and continue (non-blocking)
    if [[ "${CLAUDE_AUTO_MODE:-false}" == "true" ]] || [[ "$*" == *"--no-stop"* ]]; then
        echo "   - Autonomous mode: Continuing to PR creation (visual diffs will be included in PR for manual review)."
        echo "Decision: Visual verification did not pass after 5 iterations, continuing to PR" >> "$ARTIFACTS_DIR/decisions/$TICKET_ID.md"
    else
        read -p "Continue to PR creation? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Workflow stopped by user."
            exit 1
        fi
    fi
fi

echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Capture and compare screenshots with iteration loop",
    status: "completed",
    activeForm: "Capturing and comparing screenshots with iteration loop"
  }]
})
```

---

# Phase 7: Documentation Update (NEW)

**Goal**: Automatically update CLAUDE.md and project-context/SKILL.md if architectural patterns changed.

**Agent Used**: `doc-updater-{JIRA_KEY}` (Opus model)

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Update documentation (CLAUDE.md, project-context)",
    status: "in_progress",
    activeForm: "Updating documentation"
  }]
})

echo "📝 Phase 7: Documentation Update"
echo "================================="

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"

# Get list of changed files
CHANGED_FILES=$(git diff --name-only origin/main...HEAD)

if [[ -z "$CHANGED_FILES" ]]; then
    echo "  ✅ No files changed. Skipping documentation update."
    echo ""
    exit 0
fi

echo "  📝 Invoking /doc-updater skill to analyze code changes..."
echo ""

# The doc-updater skill will:
# 1. Read current CLAUDE.md and project-context/SKILL.md
# 2. Analyze all changed files for documentation impact
# 3. Apply the maintenance test (only update hard-to-discover knowledge)
# 4. Generate structured update plan
# 5. Apply minimal necessary updates
# 6. Verify updates are correct

# Export variables for skill access
export TICKET_ID="$TICKET_ID"
export ARTIFACTS_DIR="$ARTIFACTS_DIR"
export CHANGED_FILES="$CHANGED_FILES"

# Invoke doc-updater skill
# This skill handles all intelligent analysis and updates
/doc-updater

# Check if skill completed successfully
if [[ $? -eq 0 ]]; then
    echo ""
    echo "  ✅ Documentation update completed successfully"
else
    echo ""
    echo "  ⚠️  Documentation update encountered issues (non-blocking)"
fi

# Apply updates (doc-updater agent already applied them via Edit tool)
echo "  ✅ Documentation updated"
echo ""

# Commit documentation changes
if git diff --quiet .claude/CLAUDE.md .claude/skills/project-context/SKILL.md 2>/dev/null; then
    echo "  - No documentation changes to commit"
else
    git add .claude/CLAUDE.md .claude/skills/project-context/SKILL.md
    git commit -m "docs: update documentation for $TICKET_ID

$(echo "$DOC_ANALYSIS" | jq -r '.changesDetected.claudeMd.reason // "" + " " + .changesDetected.projectContext.reason // ""')"

    echo "  ✅ Documentation changes committed"
fi

echo ""

# ============================================================================
# SUBSTEP: Check for stack changes and update config
# ============================================================================

echo "  - Checking for stack changes..."

# Spawn config-updater agent
claude-agent spawn config-updater-$TICKET_ID \
    --template agents/config-updater.md \
    --vars "TICKET_ID=$TICKET_ID,FRAMEWORK_PATH=$FRAMEWORK_PATH" \
    --output "$ARTIFACTS_DIR/config-update-result.json"

CONFIG_UPDATE_RESULT=$(cat "$ARTIFACTS_DIR/config-update-result.json")
CONFIG_UPDATED=$(echo "$CONFIG_UPDATE_RESULT" | jq -r '.config_updated')

if [[ "$CONFIG_UPDATED" == "true" ]]; then
    echo "  ✅ Framework configuration updated"

    LANGUAGES_ADDED=$(echo "$CONFIG_UPDATE_RESULT" | jq -r '.changes.languages_added | join(", ")')
    FRAMEWORKS_ADDED=$(echo "$CONFIG_UPDATE_RESULT" | jq -r '.changes.frameworks_added | to_entries | map("\(.key): \(.value | join(", "))") | join("; ")')

    [[ ! -z "$LANGUAGES_ADDED" ]] && echo "     - New languages: $LANGUAGES_ADDED"
    [[ ! -z "$FRAMEWORKS_ADDED" ]] && echo "     - New frameworks: $FRAMEWORKS_ADDED"

    SYNC_TRIGGERED=$(echo "$CONFIG_UPDATE_RESULT" | jq -r '.sync_triggered')

    if [[ "$SYNC_TRIGGERED" == "true" ]]; then
        echo "  ✅ Framework resources synced"
        SKILLS_ADDED=$(echo "$CONFIG_UPDATE_RESULT" | jq -r '.sync_result.skills_added')
        AGENTS_ADDED=$(echo "$CONFIG_UPDATE_RESULT" | jq -r '.sync_result.agents_added')
        echo "     - Skills added: $SKILLS_ADDED"
        echo "     - Agents added: $AGENTS_ADDED"
    fi
else
    echo "  ℹ️  No stack changes detected"
fi

echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Update documentation (CLAUDE.md, project-context)",
    status: "completed",
    activeForm: "Updating documentation"
  }]
})
```

---

# Phase 8: PR Creation

**Goal**: Collect all artifacts (screenshots, videos, coverage) and create PR with rich documentation.

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Collect artifacts and create pull request",
    status: "in_progress",
    activeForm: "Collecting artifacts and creating pull request"
  }]
})

echo "🚀 Phase 8: PR Creation"
echo "======================="

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"
UTILS_DIR="$HOME/.claude/utils"

# Step 1: Collect artifacts
echo "  - Collecting artifacts..."

node -e "
const { ArtifactCollector } = require('$UTILS_DIR/artifact-collector.js');

const collector = new ArtifactCollector('$TICKET_ID', process.cwd());

collector.collect().then(artifacts => {
    // Write manifest
    require('fs').writeFileSync('$ARTIFACTS_DIR/artifacts-manifest.json', JSON.stringify(artifacts, null, 2));

    console.log('  ✅ Artifacts collected:');
    console.log('     - Screenshots: ' + artifacts.screenshots.length);
    console.log('     - Videos: ' + artifacts.videos.length);
    console.log('     - Test results: ' + artifacts.testResults.length);
    console.log('     - Coverage reports: ' + artifacts.coverage.length);

}).catch(err => {
    console.error('Artifact collection failed:', err.message);
});
"

# Step 2: Generate PR description with artifacts
echo "  - Generating PR description..."

TEST_RESULTS=$(cat "$ARTIFACTS_DIR/tests/test-results.json")

node -e "
const { ArtifactCollector } = require('$UTILS_DIR/artifact-collector.js');

const collector = new ArtifactCollector('$TICKET_ID', process.cwd());
const testResults = $TEST_RESULTS;

collector.generatePRDocumentation(testResults).then(markdown => {
    require('fs').writeFileSync('$ARTIFACTS_DIR/pr-description.md', markdown);

    console.log('  ✅ PR description generated');
});
"

# Step 3: Commit all changes
echo "  - Committing changes..."

git add .
git commit -m "$TICKET_ID: Implement feature

See PR description for details."

# Step 4: Push branch
BRANCH_NAME="feature/$TICKET_ID"
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
git push -u origin "$BRANCH_NAME"

# Step 5: Create PR with GitHub CLI
echo "  - Creating pull request..."

IMPLEMENTATION_PLAN=$(cat "$ARTIFACTS_DIR/plans/implementation-plan.md")
PR_BODY=$(cat "$ARTIFACTS_DIR/pr-description.md")

# Extract PR title from implementation plan
PR_TITLE=$(grep -A 1 "### 1. Summary" "$IMPLEMENTATION_PLAN" | tail -n 1 | sed 's/^[[:space:]]*//')

gh pr create \
    --title "$TICKET_ID: $PR_TITLE" \
    --body "$PR_BODY" \
    --label "automated" \
    --label "ready-for-review"

PR_URL=$(gh pr view --json url -q .url)

echo ""
echo "✅ Pull request created: $PR_URL"
echo ""

# Save PR URL to artifact
echo "$PR_URL" > "$ARTIFACTS_DIR/pr-url.txt"

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Collect artifacts and create pull request",
    status: "completed",
    activeForm: "Collecting artifacts and creating pull request"
  }]
})
```

---

# Phase 9: Review Loop (NEW)

**Goal**: Iterate on PR feedback with automated fixes (max 3 iterations).

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Run PR review loop with automated fixes (max 3 iterations)",
    status: "in_progress",
    activeForm: "Running PR review loop with automated fixes"
  }]
})

echo "🔄 Phase 9: Review Loop"
echo "======================="

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"
UTILS_DIR="$HOME/.claude/utils"

echo "  - Running automated review loop with max 3 iterations..."

# Use ReviewLoopOrchestrator to handle review-fix-test cycle
node -e "
const { ReviewLoopOrchestrator } = require('$UTILS_DIR/review-loop-orchestrator.js');

const orchestrator = new ReviewLoopOrchestrator(process.cwd(), '$TICKET_ID');

orchestrator.orchestrate().then(result => {
    // Write result to artifact
    require('fs').writeFileSync('$ARTIFACTS_DIR/review-loop-result.json', JSON.stringify(result, null, 2));

    console.log('');
    console.log('📊 Review Loop Summary:');
    console.log('========================');
    console.log('');
    console.log('Status: ' + result.status);
    console.log('Iterations: ' + result.iterations);
    console.log('Blocking Issues Resolved: ' + result.blockingIssuesResolved);
    console.log('');

    if (result.status !== 'success') {
        console.error('⚠️  Review loop did not fully succeed. Manual intervention may be required.');
        console.error('   - Check: $ARTIFACTS_DIR/review-loop-result.json');
    }

}).catch(err => {
    console.error('❌ Review loop failed:', err.message);
    process.exit(1);
});
"

# Read result
REVIEW_RESULT=$(cat "$ARTIFACTS_DIR/review-loop-result.json")
REVIEW_STATUS=$(echo "$REVIEW_RESULT" | jq -r '.status')
ITERATIONS=$(echo "$REVIEW_RESULT" | jq -r '.iterations')

echo "  - Review loop completed: $REVIEW_STATUS after $ITERATIONS iteration(s)"
echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Run PR review loop with automated fixes (max 3 iterations)",
    status: "completed",
    activeForm: "Running PR review loop with automated fixes"
  }]
})
```

---

# Phase 10: Cleanup (NEW)

**Goal**: Teardown isolated environment and archive artifacts.

```bash
#!/bin/bash
set -e

# TodoWrite: Mark phase as in_progress
TodoWrite({
  todos: [{
    content: "Teardown environment and archive artifacts",
    status: "in_progress",
    activeForm: "Tearing down environment and archiving artifacts"
  }]
})

echo "🧹 Phase 10: Cleanup"
echo "===================="

TICKET_ID="$1"
ARTIFACTS_DIR=".claude/artifacts/$TICKET_ID"
UTILS_DIR="$HOME/.claude/utils"

# Step 1: Teardown isolated environment
ENV_CONFIG="$ARTIFACTS_DIR/environment-config.json"

if [[ -f "$ENV_CONFIG" ]]; then
    echo "  - Tearing down isolated environment..."

    node -e "
    const { EnvironmentManager } = require('$UTILS_DIR/environment-manager.js');

    const manager = new EnvironmentManager('$TICKET_ID', process.cwd());

    manager.teardown().then(() => {
        console.log('  ✅ Environment teardown complete');
    }).catch(err => {
        console.error('Environment teardown failed:', err.message);
        // Non-fatal - continue cleanup
    });
    "
else
    echo "  - No isolated environment to teardown"
fi

# Step 2: Archive artifacts
echo "  - Archiving artifacts..."

ARCHIVE_NAME="$TICKET_ID-artifacts-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$ARTIFACTS_DIR/$ARCHIVE_NAME" -C "$ARTIFACTS_DIR" .

echo "  ✅ Artifacts archived: $ARTIFACTS_DIR/$ARCHIVE_NAME"

# Step 3: Clean up temporary files
echo "  - Cleaning up temporary files..."

# Remove Docker Compose override file
OVERRIDE_FILE="docker-compose.$TICKET_ID.yml"
[[ -f "$OVERRIDE_FILE" ]] && rm "$OVERRIDE_FILE"

# Remove any .tmp files
find "$ARTIFACTS_DIR" -name "*.tmp" -delete

echo ""
echo "✅ Cleanup complete"
echo ""
echo "═══════════════════════════════════════════"
echo "   🎉 Workflow Complete for $TICKET_ID"
echo "═══════════════════════════════════════════"
echo ""
echo "📦 Artifacts: $ARTIFACTS_DIR/"
echo "📋 PR: $(cat "$ARTIFACTS_DIR/pr-url.txt" 2>/dev/null || echo "Not created")"
echo ""

# TodoWrite: Mark phase as completed
TodoWrite({
  todos: [{
    content: "Teardown environment and archive artifacts",
    status: "completed",
    activeForm: "Tearing down environment and archiving artifacts"
  }]
})
```

---

# Error Handling and Graceful Degradation

## Phase-Level Error Handling

Each phase has specific error handling:

### Phase 0: Pre-Flight Validation

- **Hard Errors** (stop workflow):
  - Not a git repository
  - Uncommitted changes
  - Invalid input source
- **Graceful Degradation**: None (must pass to continue)

### Phase 1: Context Gathering

- **Hard Errors**: Context file not generated
- **Graceful Degradation**:
  - Missing external docs: Continue with Jira/markdown context only
  - MCP server not configured: Use markdown input instead

### Phase 2: Planning

- **Hard Errors**: Plan file not generated
- **Graceful Degradation**:
  - Missing test plan: Use default test strategy
  - Missing environment requirements: Assume no special setup needed

### Phase 3: Environment Setup

- **Hard Errors**: Docker Compose startup failure
- **Graceful Degradation**:
  - No Docker Compose detected: Use existing environment
  - No E2E framework: Auto-initialize Playwright
  - Screenshot capture failure: Continue without visual verification

### Phase 4: Implementation

- **Hard Errors**: Implementation log not generated
- **Graceful Degradation**: None (implementation must complete)

### Phase 5: Testing

- **Hard Errors**:
  - Test execution failure
  - Coverage <80% (after 3 retry attempts)
- **Graceful Degradation**:
  - E2E tests not found: Skip E2E testing
  - Integration tests not found: Skip integration testing

### Phase 6: Visual Verification

- **Hard Errors**: None (visual verification is best-effort)
- **Graceful Degradation**:
  - Screenshot capture failure: Skip visual verification
  - Diff >5% after 5 iterations: Continue to PR (include diffs for manual review)
  - No "before" screenshots: Skip comparison

### Phase 7: Documentation Update

- **Hard Errors**: None (documentation update is best-effort)
- **Graceful Degradation**:
  - No changes detected: Skip documentation update
  - Update failure: Log warning and continue

### Phase 8: PR Creation

- **Hard Errors**:
  - Git push failure
  - PR creation failure (network/auth)
- **Graceful Degradation**:
  - Artifact collection partial failure: Create PR with available artifacts

### Phase 9: Review Loop

- **Hard Errors**: Test failure after fixes (blocks merge)
- **Graceful Degradation**:
  - Review agent failure: Skip automated review (manual review required)
  - Max iterations reached: Continue with remaining issues (flag for manual review)

### Phase 10: Cleanup

- **Hard Errors**: None (cleanup is best-effort)
- **Graceful Degradation**:
  - Teardown failure: Log warning (resources may need manual cleanup)
  - Archive failure: Continue (artifacts still available in directory)

---

# Checkpoints and Resume

Each phase writes a checkpoint file: `.claude/artifacts/{JIRA_KEY}/checkpoints/phase-{N}.json`

**Checkpoint Format**:

```json
{
  "phase": 5,
  "phaseName": "Testing",
  "status": "completed",
  "timestamp": "2024-01-15T14:32:00Z",
  "artifacts": ["tests/test-results.json", "coverage/index.html"]
}
```

**Resume Command**:

```bash
/implement-ticket PROJ-123 --resume
```

When `--resume` is provided:

1. Read all checkpoint files
2. Find the last completed phase
3. Skip to the next phase
4. Reuse artifacts from completed phases

---

# Autonomous Decision Logging

All autonomous decisions are logged to `.claude/decisions/{JIRA_KEY}.md`

**Decision Format**:

```markdown
## Decision Log for PROJ-123

### 2024-01-15 14:32:00 - Phase 2: Planning

**Decision**: Used default test strategy
**Reason**: No test plan found in implementation plan
**Impact**: May need manual test creation later

### 2024-01-15 15:45:00 - Phase 6: Visual Verification

**Decision**: Continuing with 7.2% visual diff after 5 iterations
**Reason**: Max iterations reached, diff below critical threshold (20%)
**Impact**: Visual diff included in PR for manual review
```

---

# Usage Examples

## Example 1: Simple Bug Fix (No Visual Changes)

```bash
/implement-ticket BUG-456 --from-jira --no-stop
```

**Workflow**:

- Phase 0: ✅ Pre-flight validation
- Phase 1: ✅ Context from Jira
- Phase 2: ✅ Planning (test plan: no E2E)
- Phase 3: ⏭️ Skipped (no environment setup needed)
- Phase 4: ✅ Implementation + unit tests
- Phase 5: ✅ Testing (unit + integration)
- Phase 6: ⏭️ Skipped (no visual verification required)
- Phase 7: ⏭️ Skipped (no architectural changes)
- Phase 8: ✅ PR created
- Phase 9: ✅ Review loop (0 iterations needed)
- Phase 10: ✅ Cleanup

**Time**: ~10 minutes

---

## Example 2: Full-Stack Feature (UI + Backend + Tests)

```bash
/implement-ticket FEAT-789 --from-markdown ./specs/FEAT-789.md --no-stop
```

**Workflow**:

- Phase 0: ✅ Pre-flight validation
- Phase 1: ✅ Context from markdown + Notion docs
- Phase 2: ✅ Planning (test plan: unit + integration + E2E + visual)
- Phase 3: ✅ Environment setup (isolated Docker + Playwright init + before screenshots)
- Phase 4: ✅ Implementation + unit tests + integration tests
- Phase 5: ✅ Testing (unit + integration + E2E)
- Phase 6: ✅ Visual verification (3 iterations to achieve <5% diff)
- Phase 7: ✅ Documentation update (CLAUDE.md: new API endpoint convention)
- Phase 8: ✅ PR created with screenshots + videos + coverage
- Phase 9: ✅ Review loop (1 iteration for linting fix)
- Phase 10: ✅ Cleanup (teardown isolated environment)

**Time**: ~45 minutes

---

## Example 3: Parallel Tickets

```bash
# Terminal 1
/implement-ticket PROJ-123 --no-stop

# Terminal 2 (simultaneously)
/implement-ticket PROJ-456 --no-stop

# Terminal 3 (simultaneously)
/implement-ticket PROJ-789 --no-stop
```

**Each ticket runs independently**:

- Unique port ranges (PROJ-123: 14200-14299, PROJ-456: 23700-23799, etc.)
- Isolated Docker Compose environments
- Separate artifact directories
- No conflicts or race conditions

---

# Troubleshooting

## Issue: Coverage gate failure (<80%)

**Solution**:

1. Check which files are missing coverage: `cat .claude/artifacts/{JIRA_KEY}/coverage/index.html`
2. Re-run Phase 4 (implementation) to add missing tests
3. Resume from Phase 5: `/implement-ticket {JIRA_KEY} --resume`

---

## Issue: Visual verification stuck (diff not decreasing)

**Solution**:

1. Review visual-verifier analysis: `cat .claude/artifacts/{JIRA_KEY}/screenshots/diffs/visual-verification-analysis-iter-*.json`
2. Check if issue is anti-aliasing (<2% diff): Safe to ignore
3. Check if issue is design mismatch (>20% diff): May need manual design review
4. In autonomous mode, workflow will continue after 5 iterations (non-blocking)

---

## Issue: E2E tests not found

**Solution**:

1. Phase 3 will automatically initialize Playwright if no E2E framework is detected
2. If initialization fails, check npm/pnpm is available
3. Manually initialize: `npx playwright install`

---

## Issue: Docker Compose port conflicts

**Solution**:

1. Check if another ticket is using the same port range (hash collision is extremely rare)
2. Teardown other environments: `/implement-ticket {OTHER_JIRA_KEY} --cleanup`
3. Manually change base port range in environment-manager.js (default: 10000)

---

# Configuration

## Environment Variables

| Variable                | Default | Description                                 |
| ----------------------- | ------- | ------------------------------------------- |
| `CLAUDE_AUTO_MODE`      | `false` | Enable autonomous mode globally             |
| `COVERAGE_THRESHOLD`    | `80`    | Minimum code coverage percentage            |
| `VISUAL_DIFF_THRESHOLD` | `5.0`   | Maximum acceptable visual diff percentage   |
| `MAX_VISUAL_ITERATIONS` | `5`     | Maximum visual verification iterations      |
| `MAX_REVIEW_ITERATIONS` | `3`     | Maximum PR review loop iterations           |
| `BASE_PORT_RANGE`       | `10000` | Starting port for parallel ticket isolation |

## Skill Configuration

Edit `.claude/skills/020-development-workflow/implement-ticket/config.json`:

```json
{
  "defaultMode": "autonomous",
  "enableVisualVerification": true,
  "enableDocumentationUpdate": true,
  "enableReviewLoop": true,
  "parallelTicketsEnabled": true,
  "maxParallelTickets": 500
}
```

---

# Best Practices

## 1. Use Autonomous Mode for Production

Autonomous mode (`--no-stop`) is **recommended for production** to:

- Maximize efficiency (no waiting for user input)
- Enable overnight/weekend runs
- Support CI/CD integration
- All decisions are logged for audit

## 2. Create Detailed Markdown Specs

For complex features, create markdown specs with:

- Clear summary and acceptance criteria
- External documentation links (Notion, Confluence, Figma)
- API contracts and data models
- UI mockups or Figma links

Use `/create-sdd-ticket` to generate spec templates.

## 3. Monitor Parallel Tickets

When running multiple tickets in parallel:

- Check port allocation: `docker ps` (each ticket uses unique ports)
- Monitor resource usage: `docker stats`
- Review logs: `tail -f .claude/artifacts/{JIRA_KEY}/workflow.log`

## 4. Review Visual Diffs

Even in autonomous mode, review visual diffs before merging:

- Check `.claude/artifacts/{JIRA_KEY}/screenshots/diffs/`
- View side-by-side comparisons
- Validate design fidelity

## 5. Keep Documentation Up-to-Date

Phase 7 auto-updates documentation, but:

- Review changes: `git diff .claude/CLAUDE.md`
- Validate accuracy
- Commit manually if needed

---

# Integration with CI/CD

## GitHub Actions Example

```yaml
name: Implement Ticket

on:
  workflow_dispatch:
    inputs:
      ticket_id:
        description: 'Jira ticket ID or key'
        required: true
      input_source:
        description: 'Input source (--from-jira or --from-markdown)'
        required: true
        default: '--from-jira'

jobs:
  implement:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          npm install -g @anthropic-ai/claude-agent
          pnpm install

      - name: Run implement-ticket
        env:
          CLAUDE_AUTO_MODE: true
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          /implement-ticket ${{ github.event.inputs.ticket_id }} \
            ${{ github.event.inputs.input_source }} \
            --no-stop

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ticket-artifacts
          path: .claude/artifacts/${{ github.event.inputs.ticket_id }}/
```

---

# Appendix: Agent Templates Used

| Phase | Agent               | Template                                        | Model  |
| ----- | ------------------- | ----------------------------------------------- | ------ |
| 1     | context-gatherer    | `agents/templates/context-gatherer.template.md` | Opus   |
| 2     | planner             | `agents/templates/planner.template.md`          | Opus   |
| 4     | implementer-{stack} | `agents/templates/implementer.template.md`      | Sonnet |
| 6     | visual-verifier     | `agents/templates/visual-verifier.template.md`  | Opus   |
| 7     | doc-updater         | `agents/templates/doc-updater.template.md`      | Opus   |
| 9     | pr-reviewer         | `agents/templates/pr-reviewer.template.md`      | Opus   |

---

# Appendix: Utility Functions Used

| Phase | Utility               | Path                                |
| ----- | --------------------- | ----------------------------------- |
| 0     | StackDetector         | `utils/stack-detection.js`          |
| 0     | TestFrameworkDetector | `utils/test-framework-detection.js` |
| 0     | EnvironmentDetector   | `utils/environment-detection.js`    |
| 3     | EnvironmentManager    | `utils/environment-manager.js`      |
| 3     | ScreenshotCapture     | `utils/screenshot-capture.js`       |
| 5     | TestOrchestrator      | `utils/test-orchestrator.js`        |
| 6     | ScreenshotCapture     | `utils/screenshot-capture.js`       |
| 6     | ScreenshotComparator  | `utils/screenshot-comparator.js`    |
| 8     | ArtifactCollector     | `utils/artifact-collector.js`       |

---

# Support and Feedback

For issues, feature requests, or questions:

- **GitHub Issues**: https://github.com/thisisqubika/qubika-agentic-framework/issues
- **Documentation**: https://github.com/thisisqubika/qubika-agentic-framework
- **Slack**: #qubika-agentic-framework

---

**Version**: 2.0.0
**Last Updated**: 2024-01-15
**Maintained By**: AI Platform Team
