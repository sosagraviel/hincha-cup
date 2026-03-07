---
name: initialize-project
description: Deep codebase analysis and Claude Code configuration generator. Spawns parallel haiku analyzers then an opus architect to produce CLAUDE.md and a project-context skill. Use on any new or legacy codebase.
user-invokable: true
argument-hint: [project-path (optional, defaults to cwd)]
disable-model-invocation: true
context: inline
---

# Initialize Project — Complete 5-Phase Workflow

**CRITICAL**: This is a **SINGLE TASK** with 5 sequential phases. You MUST complete ALL phases without stopping. Do not wait for user confirmation between phases.

---

## STEP 0: MANDATORY PHASE TRACKING

**BEFORE doing anything else**, create a todo list with ALL 5 phases using the TodoWrite tool:

```typescript
TodoWrite({
  todos: [
    {
      content: 'Phase 1: Launch parallel analysis agents',
      status: 'in_progress',
      activeForm: 'Launching parallel analysis agents'
    },
    {
      content: 'Phase 2: Consolidation & gap analysis',
      status: 'pending',
      activeForm: 'Consolidating analysis and asking user questions'
    },
    {
      content: 'Phase 3: Architecture synthesis',
      status: 'pending',
      activeForm: 'Synthesizing architecture with Opus agent'
    },
    {
      content: 'Phase 4: Write CLAUDE.md and project-context files',
      status: 'pending',
      activeForm: 'Writing configuration files'
    },
    {
      content: 'Phase 5: Stack detection & auto-configuration',
      status: 'pending',
      activeForm: 'Detecting stack, copying skills, generating agents'
    }
  ]
});
```

**After creating the todo list, immediately proceed to Phase 1.**

---

## Phase 1: Launch Parallel Analysis Agents

### Step 1.1: Launch Subagents

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 1: LAUNCHING PARALLEL ANALYSIS AGENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Launch **4 subagents in parallel** using the Task tool. Send all 4 Task calls in a **single message**.

Read and invoke each agent from `.claude/skills/initialize-project/agents/`:

1. **Structure & Architecture**: `./agents/01-structure-architecture.md`
2. **Data Flows & Auth**: `./agents/02-data-flows-auth.md`
3. **DevOps & Workflow**: `./agents/03-devops-workflow.md`
4. **Conventions & Patterns**: `./agents/04-conventions-patterns.md`

Set `run_in_background: true` for all agents.

Track the agent IDs returned.

### Step 1.2: Wait for Completion

Use `AgentOutputTool` with `block: true` to retrieve all 4 agent outputs.

```bash
echo "✓ Phase 1 complete - All 4 analysis reports received"
```

### Phase 1 Complete ✓

**Update TodoWrite**: Mark Phase 1 as "completed", mark Phase 2 as "in_progress"

**CRITICAL CHECK**: Do NOT stop here. Immediately proceed to Phase 2.

---

## Phase 2: Consolidation & Gap Analysis

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 2: CONSOLIDATION & GAP ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Step 2.1: Compile Results

Read all 4 analysis reports. Create a consolidated summary organized by:

- Tech stack (exact versions)
- Architecture pattern and conventions
- Complex flows (auth, real-time, error handling, request lifecycle)
- Development workflow and commands
- Non-obvious patterns and gotchas

### Step 2.2: Identify Gaps

**CRITICAL**: The agents should have done thorough research and marked very few items as [NEEDS_VERIFICATION]. If you see many [NEEDS_VERIFICATION] items about code configuration, file locations, or technical patterns, DO NOT accept them - the agents failed to search properly.

Review the consolidated summary for ONLY these types of gaps:

**VALID GAPS TO ASK ABOUT:**

1. **Business Domain Context**: What is the application's purpose? Key user workflows?
2. **Deployment Infrastructure**: Where/how is production deployed? CI/CD pipelines?
3. **Team Conventions**: Branch naming, PR approval process, team-specific guidelines?
4. **External System Behavior**: Third-party API behaviors not documented in code

**INVALID GAPS** (these should have been found in code - reject if agents marked these):

- Config file locations (playwright.config.ts, tsconfig.json, etc.)
- Whether features are implemented (caching, persistence, error handling)
- Database error handling utilities
- Test framework configuration
- Any technical detail that exists in the codebase

If you find invalid gaps, that means the agents didn't search thoroughly enough.

### Step 2.3: Ask the Engineer

**BEFORE asking questions**: Review all gaps one more time. If a gap is about something in the codebase (config files, implementation details, technical patterns), DO NOT ask - search for it yourself using Glob, Grep, and Read tools until you find the answer.

**ONLY ask about**:

- Business domain and purpose
- Deployment and CI/CD infrastructure (if not in .github/workflows, .gitlab-ci.yml, etc.)
- Team policies and conventions (if not in CONTRIBUTING.md, docs/, etc.)

If you have valid gaps, present them as a **numbered list**:

```
I've completed the codebase analysis. Before generating the configuration files, I need
clarification on the following items:

1. [BUSINESS_CONTEXT] What is the primary business purpose of this application?
2. [DEPLOYMENT] Where is production deployed and what CI/CD system is used?
3. [TEAM_POLICY] What are the branch naming conventions?

Please answer each item. Type "skip" for any you'd like me to leave out or mark as TODO.
```

**If you have NO valid gaps** (all technical details were found in code): Skip directly to Phase 3 without asking any questions.

**Wait for the engineer's response** (only if you asked questions).

### Phase 2 Complete ✓

**Update TodoWrite**: Mark Phase 2 as "completed", mark Phase 3 as "in_progress"

**CRITICAL CHECK**: Do NOT stop here. Immediately proceed to Phase 3.

---

## Phase 3: Architecture Synthesis

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 3: ARCHITECTURE SYNTHESIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Launch the **architect synthesizer agent** using the Task tool.

Read and invoke: `./agents/05-architect-synthesizer.md`

Use `model: opus` and `subagent_type: general-purpose`.

Include in the prompt:

- Full consolidated analysis from Phase 2
- Engineer's answers from Phase 2.3
- Project path from $ARGUMENTS (or current working directory)

**Wait for the architect agent to return** the content for CLAUDE.md and project-context/SKILL.md.

### Phase 3 Complete ✓

**Update TodoWrite**: Mark Phase 3 as "completed", mark Phase 4 as "in_progress"

**CRITICAL CHECK**: Do NOT stop here. Immediately proceed to Phase 4.

---

## Phase 4: Write Configuration Files

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 4: WRITE & VERIFY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Step 4.1: Backup Existing Files

If `.claude/CLAUDE.md` exists:

```bash
cp .claude/CLAUDE.md .claude/CLAUDE.md.backup
```

### Step 4.2: Write Files

1. Parse the architect agent's output
2. Write `.claude/CLAUDE.md` with the generated content
3. Create `.claude/skills/project-context/` directory if needed
4. Write `.claude/skills/project-context/SKILL.md` with the generated content

### Step 4.3: Count Lines

```bash
wc -l .claude/CLAUDE.md .claude/skills/project-context/SKILL.md
```

### Phase 4 Complete ✓

**Update TodoWrite**: Mark Phase 4 as "completed", mark Phase 5 as "in_progress"

**🚨 CRITICAL: DO NOT STOP HERE! 🚨**

This is NOT the end. You have NOT completed the task.

**IMMEDIATELY proceed to Phase 5** (Stack Detection & Auto-Configuration).

Do NOT wait for user input. Do NOT display a completion message yet.

---

## Phase 5: Stack Detection & Auto-Configuration

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 5: STACK DETECTION & AUTO-CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Step 5.1: Detect Stack

Use Glob, Grep, and Read tools to perform comprehensive stack detection:

```bash
echo "Detecting project stack..."

# Multi-Language Detection (supports projects with multiple languages)
DETECTED_LANGS=()

# Check for TypeScript/JavaScript
if [ -f "tsconfig.json" ] || [ -f "package.json" ]; then
  DETECTED_LANGS+=("typescript")
fi

# Check for Python
if [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "requirements.txt" ]; then
  DETECTED_LANGS+=("python")
fi

# Check for Go
if [ -f "go.mod" ]; then
  DETECTED_LANGS+=("go")
fi

# Check for Rust
if [ -f "Cargo.toml" ]; then
  DETECTED_LANGS+=("rust")
fi

# Check for Java
if [ -f "pom.xml" ] || [ -f "build.gradle" ]; then
  DETECTED_LANGS+=("java")
fi

# Check for Ruby
if [ -f "Gemfile" ]; then
  DETECTED_LANGS+=("ruby")
fi

# Check for PHP
if [ -f "composer.json" ]; then
  DETECTED_LANGS+=("php")
fi

# Determine primary language (first detected = primary for backward compatibility)
if [ ${#DETECTED_LANGS[@]} -gt 0 ]; then
  PRIMARY_LANG="${DETECTED_LANGS[0]}"
else
  PRIMARY_LANG="unknown"
fi

# Get version for primary language
case "$PRIMARY_LANG" in
  typescript)
    LANG_VERSION=$(node --version 2>/dev/null || echo "not found")
    ;;
  python)
    LANG_VERSION=$(python --version 2>/dev/null || cat .python-version 2>/dev/null || echo "not found")
    ;;
  go)
    LANG_VERSION=$(go version 2>/dev/null | awk '{print $3}' || echo "not found")
    ;;
  rust)
    LANG_VERSION=$(rustc --version 2>/dev/null | awk '{print $2}' || echo "not found")
    ;;
  java)
    LANG_VERSION=$(java --version 2>/dev/null | head -1 || echo "not found")
    ;;
  ruby)
    LANG_VERSION=$(ruby --version 2>/dev/null | awk '{print $2}' || cat .ruby-version 2>/dev/null || echo "not found")
    ;;
  php)
    LANG_VERSION=$(php --version 2>/dev/null | head -1 | awk '{print $2}' || echo "not found")
    ;;
  *)
    LANG_VERSION="unknown"
    ;;
esac

# Package Manager Detection
if [ -f "pnpm-lock.yaml" ]; then
  PKG_MGR="pnpm"
elif [ -f "yarn.lock" ]; then
  PKG_MGR="yarn"
elif [ -f "package-lock.json" ]; then
  PKG_MGR="npm"
elif [ -f "poetry.lock" ]; then
  PKG_MGR="poetry"
elif [ -f "Pipfile.lock" ]; then
  PKG_MGR="pipenv"
elif [ -f "Cargo.lock" ]; then
  PKG_MGR="cargo"
elif [ -f "go.sum" ]; then
  PKG_MGR="go mod"
elif [ -f "Gemfile.lock" ]; then
  PKG_MGR="bundle"
elif [ -f "composer.lock" ]; then
  PKG_MGR="composer"
else
  PKG_MGR="unknown"
fi

# Backend Framework Detection
case "$PRIMARY_LANG" in
  typescript)
    if grep -q '"@nestjs/core"' package.json 2>/dev/null; then
      BACKEND_FRAMEWORK="nestjs"
    elif grep -q '"express"' package.json 2>/dev/null; then
      BACKEND_FRAMEWORK="express"
    elif grep -q '"fastify"' package.json 2>/dev/null; then
      BACKEND_FRAMEWORK="fastify"
    else
      BACKEND_FRAMEWORK="none"
    fi
    ;;
  python)
    if [ -f "manage.py" ]; then
      BACKEND_FRAMEWORK="django"
    elif grep -q 'fastapi' requirements.txt pyproject.toml 2>/dev/null; then
      BACKEND_FRAMEWORK="fastapi"
    elif grep -q 'flask' requirements.txt pyproject.toml 2>/dev/null; then
      BACKEND_FRAMEWORK="flask"
    else
      BACKEND_FRAMEWORK="none"
    fi
    ;;
  go)
    if grep -q 'gin-gonic/gin' go.mod 2>/dev/null; then
      BACKEND_FRAMEWORK="gin"
    elif grep -q 'labstack/echo' go.mod 2>/dev/null; then
      BACKEND_FRAMEWORK="echo"
    elif grep -q 'gorilla/mux' go.mod 2>/dev/null; then
      BACKEND_FRAMEWORK="gorilla/mux"
    else
      BACKEND_FRAMEWORK="standard library"
    fi
    ;;
  rust)
    if grep -q 'axum =' Cargo.toml 2>/dev/null; then
      BACKEND_FRAMEWORK="axum"
    elif grep -q 'actix-web =' Cargo.toml 2>/dev/null; then
      BACKEND_FRAMEWORK="actix-web"
    elif grep -q 'rocket =' Cargo.toml 2>/dev/null; then
      BACKEND_FRAMEWORK="rocket"
    else
      BACKEND_FRAMEWORK="none"
    fi
    ;;
  java)
    if grep -q 'spring-boot' pom.xml build.gradle 2>/dev/null; then
      BACKEND_FRAMEWORK="spring-boot"
    else
      BACKEND_FRAMEWORK="unknown"
    fi
    ;;
  ruby)
    if [ -f "config/application.rb" ] && grep -q 'Rails' config/application.rb 2>/dev/null; then
      BACKEND_FRAMEWORK="rails"
    elif grep -q 'sinatra' Gemfile 2>/dev/null; then
      BACKEND_FRAMEWORK="sinatra"
    else
      BACKEND_FRAMEWORK="none"
    fi
    ;;
  *)
    BACKEND_FRAMEWORK="unknown"
    ;;
esac

# Frontend Framework Detection (Node.js projects only)
if [ "$PRIMARY_LANG" = "typescript" ] || [ -f "package.json" ]; then
  if grep -q '"react"' package.json 2>/dev/null; then
    if grep -q '"next"' package.json 2>/dev/null; then
      FRONTEND_FRAMEWORK="nextjs"
    else
      FRONTEND_FRAMEWORK="react"
    fi
  elif grep -q '"vue"' package.json 2>/dev/null; then
    FRONTEND_FRAMEWORK="vue"
  elif grep -q '"@angular/core"' package.json 2>/dev/null; then
    FRONTEND_FRAMEWORK="angular"
  elif grep -q '"svelte"' package.json 2>/dev/null; then
    FRONTEND_FRAMEWORK="svelte"
  else
    FRONTEND_FRAMEWORK="none"
  fi
else
  FRONTEND_FRAMEWORK="none"
fi

# Database Detection
DATABASES=""
if grep -q 'pg\|postgresql\|@nestjs/typeorm\|psycopg2\|sqlalchemy' package.json requirements.txt pyproject.toml go.mod Cargo.toml Gemfile 2>/dev/null; then
  DATABASES="${DATABASES}postgresql "
fi
if grep -q 'mysql\|mysql2\|PyMySQL' package.json requirements.txt pyproject.toml go.mod Cargo.toml Gemfile 2>/dev/null; then
  DATABASES="${DATABASES}mysql "
fi
if grep -q 'mongodb\|mongoose\|pymongo' package.json requirements.txt pyproject.toml go.mod Cargo.toml Gemfile 2>/dev/null; then
  DATABASES="${DATABASES}mongodb "
fi
if grep -q 'redis\|ioredis' package.json requirements.txt pyproject.toml go.mod Cargo.toml Gemfile 2>/dev/null; then
  DATABASES="${DATABASES}redis "
fi
# Check docker-compose.yml
if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ]; then
  if grep -q 'image:.*postgres' docker-compose.yml docker-compose.yaml 2>/dev/null; then
    DATABASES="${DATABASES}postgresql "
  fi
  if grep -q 'image:.*mysql' docker-compose.yml docker-compose.yaml 2>/dev/null; then
    DATABASES="${DATABASES}mysql "
  fi
  if grep -q 'image:.*mongo' docker-compose.yml docker-compose.yaml 2>/dev/null; then
    DATABASES="${DATABASES}mongodb "
  fi
  if grep -q 'image:.*redis' docker-compose.yml docker-compose.yaml 2>/dev/null; then
    DATABASES="${DATABASES}redis "
  fi
fi
DATABASES=$(echo "$DATABASES" | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs)

# Testing Framework Detection
case "$PRIMARY_LANG" in
  typescript)
    if grep -q '"jest"' package.json 2>/dev/null; then
      TEST_FRAMEWORK="jest"
    elif grep -q '"vitest"' package.json 2>/dev/null; then
      TEST_FRAMEWORK="vitest"
    else
      TEST_FRAMEWORK="none"
    fi
    if grep -q '"@playwright/test"' package.json 2>/dev/null; then
      E2E_FRAMEWORK="playwright"
    elif grep -q '"cypress"' package.json 2>/dev/null; then
      E2E_FRAMEWORK="cypress"
    else
      E2E_FRAMEWORK="none"
    fi
    ;;
  python)
    if grep -q 'pytest' requirements.txt pyproject.toml 2>/dev/null; then
      TEST_FRAMEWORK="pytest"
    elif grep -q 'unittest' requirements.txt pyproject.toml 2>/dev/null; then
      TEST_FRAMEWORK="unittest"
    else
      TEST_FRAMEWORK="none"
    fi
    E2E_FRAMEWORK="none"
    ;;
  go)
    TEST_FRAMEWORK="go test"
    E2E_FRAMEWORK="none"
    ;;
  rust)
    TEST_FRAMEWORK="cargo test"
    E2E_FRAMEWORK="none"
    ;;
  java)
    if grep -q 'junit' pom.xml build.gradle 2>/dev/null; then
      TEST_FRAMEWORK="junit"
    else
      TEST_FRAMEWORK="unknown"
    fi
    E2E_FRAMEWORK="none"
    ;;
  ruby)
    if grep -q 'rspec' Gemfile 2>/dev/null; then
      TEST_FRAMEWORK="rspec"
    else
      TEST_FRAMEWORK="minitest"
    fi
    E2E_FRAMEWORK="none"
    ;;
  *)
    TEST_FRAMEWORK="unknown"
    E2E_FRAMEWORK="none"
    ;;
esac

# Serverless Function Detection
FUNCTION_LANGS=()

# Search for common serverless directory patterns
if [ -d "functions" ] || [ -d "cloud-functions" ] || [ -d "serverless" ] || [ -d "lambdas" ]; then
  echo "Scanning for serverless functions..."

  # Google Cloud Functions / Firebase Functions
  for func_dir in functions/* cloud-functions/* 2>/dev/null; do
    if [ -d "$func_dir" ]; then
      # Python functions
      if [ -f "$func_dir/requirements.txt" ] || [ -f "$func_dir/main.py" ]; then
        if [[ ! " ${DETECTED_LANGS[@]} " =~ " python " ]]; then
          DETECTED_LANGS+=("python")
        fi
        FUNCTION_LANGS+=("python:$func_dir")
      fi
      # TypeScript/JavaScript functions
      if [ -f "$func_dir/package.json" ]; then
        if [[ ! " ${DETECTED_LANGS[@]} " =~ " typescript " ]]; then
          DETECTED_LANGS+=("typescript")
        fi
        FUNCTION_LANGS+=("typescript:$func_dir")
      fi
    fi
  done

  # AWS Lambda
  for lambda_dir in lambda/* lambdas/* 2>/dev/null; do
    if [ -d "$lambda_dir" ]; then
      # Python lambdas
      if [ -f "$lambda_dir/requirements.txt" ]; then
        if [[ ! " ${DETECTED_LANGS[@]} " =~ " python " ]]; then
          DETECTED_LANGS+=("python")
        fi
        FUNCTION_LANGS+=("python:$lambda_dir")
      fi
      # Go lambdas
      if [ -f "$lambda_dir/go.mod" ]; then
        if [[ ! " ${DETECTED_LANGS[@]} " =~ " go " ]]; then
          DETECTED_LANGS+=("go")
        fi
        FUNCTION_LANGS+=("go:$lambda_dir")
      fi
      # Node.js lambdas
      if [ -f "$lambda_dir/package.json" ]; then
        if [[ ! " ${DETECTED_LANGS[@]} " =~ " typescript " ]]; then
          DETECTED_LANGS+=("typescript")
        fi
        FUNCTION_LANGS+=("typescript:$lambda_dir")
      fi
    fi
  done

  # Check serverless.yml for runtime configurations
  if [ -f "serverless.yml" ]; then
    if grep -q "runtime:.*python" serverless.yml; then
      if [[ ! " ${DETECTED_LANGS[@]} " =~ " python " ]]; then
        DETECTED_LANGS+=("python")
      fi
    fi
    if grep -q "runtime:.*node" serverless.yml; then
      if [[ ! " ${DETECTED_LANGS[@]} " =~ " typescript " ]]; then
        DETECTED_LANGS+=("typescript")
      fi
    fi
    if grep -q "runtime:.*go" serverless.yml; then
      if [[ ! " ${DETECTED_LANGS[@]} " =~ " go " ]]; then
        DETECTED_LANGS+=("go")
      fi
    fi
  fi

  # Check firebase.json for functions
  if [ -f "firebase.json" ]; then
    if grep -q '"functions"' firebase.json; then
      # Check functions directory
      if [ -f "functions/package.json" ]; then
        if [[ ! " ${DETECTED_LANGS[@]} " =~ " typescript " ]]; then
          DETECTED_LANGS+=("typescript")
        fi
      fi
      if [ -f "functions/requirements.txt" ]; then
        if [[ ! " ${DETECTED_LANGS[@]} " =~ " python " ]]; then
          DETECTED_LANGS+=("python")
        fi
      fi
    fi
  fi

  # Re-determine primary language after serverless detection
  if [ ${#DETECTED_LANGS[@]} -gt 0 ]; then
    PRIMARY_LANG="${DETECTED_LANGS[0]}"
  fi

  if [ ${#FUNCTION_LANGS[@]} -gt 0 ]; then
    echo "  ✓ Found ${#FUNCTION_LANGS[@]} serverless function(s)"
  fi
fi

# Display detected stack
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DETECTED STACK PROFILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ ${#DETECTED_LANGS[@]} -gt 1 ]; then
  echo "Languages Detected: ${DETECTED_LANGS[@]}"
  echo "Primary Language: $PRIMARY_LANG $LANG_VERSION"
else
  echo "Primary Language: $PRIMARY_LANG $LANG_VERSION"
fi
echo "Package Manager: $PKG_MGR"
echo "Backend Framework: $BACKEND_FRAMEWORK"
echo "Frontend Framework: $FRONTEND_FRAMEWORK"
echo "Databases: ${DATABASES:-none}"
echo "Test Framework: $TEST_FRAMEWORK"
[ "$E2E_FRAMEWORK" != "none" ] && echo "E2E Framework: $E2E_FRAMEWORK"
if [ ${#FUNCTION_LANGS[@]} -gt 0 ]; then
  echo "Serverless Functions: ${#FUNCTION_LANGS[@]} detected"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Step 5.2: Initialize Transaction Directory

```bash
echo "Initializing transaction directory..."
rm -rf .claude/.tmp
mkdir -p .claude/.tmp/skills
mkdir -p .claude/.tmp/agents
echo "✓ Transaction directory ready"
```

### Step 5.3: Copy Skills

Based on detected stack, copy skills from `ai-agentic-framework/skills/` to `.claude/.tmp/skills/`.

**CRITICAL**: Use `mkdir + cp -r source/* dest/` pattern to preserve full directory structure including subdirectories (references/, scripts/, agents/, etc.).

```bash
echo "Copying skills based on detected stack..."

# Helper function to copy skill preserving full directory structure
# Example: ai-agentic-framework/skills/030-quality-assurance/create-pr
#       -> .claude/.tmp/skills/030-quality-assurance/create-pr
copy_skill() {
  local skill_path="$1"
  # Extract relative path after "ai-agentic-framework/skills/"
  local relative_path="${skill_path#ai-agentic-framework/skills/}"
  local skill_name=$(basename "$skill_path")

  if [ -d "$skill_path" ]; then
    # Create full directory structure including category folders
    mkdir -p ".claude/.tmp/skills/$(dirname "$relative_path")"
    cp -r "$skill_path" ".claude/.tmp/skills/$(dirname "$relative_path")/"
    echo "  ✓ $relative_path"
  else
    echo "  ⚠ $skill_name not found (skipped)"
  fi
}

# ALWAYS COPY (Foundation + Workflow + Quality + Essential Integrations)
copy_skill "ai-agentic-framework/skills/010-foundation/start-task"
copy_skill "ai-agentic-framework/skills/020-development-workflow/implement-ticket"
copy_skill "ai-agentic-framework/skills/020-development-workflow/analyze-requirements"
copy_skill "ai-agentic-framework/skills/020-development-workflow/code-implementation"
copy_skill "ai-agentic-framework/skills/020-development-workflow/create-sdd-ticket"
copy_skill "ai-agentic-framework/skills/020-development-workflow/mastering-git-cli"
copy_skill "ai-agentic-framework/skills/020-development-workflow/architect-agent"
copy_skill "ai-agentic-framework/skills/030-quality-assurance/code-quality-check"
copy_skill "ai-agentic-framework/skills/030-quality-assurance/security-review"
copy_skill "ai-agentic-framework/skills/030-quality-assurance/create-pr"
copy_skill "ai-agentic-framework/skills/040-integrations/fetch-ticket-context"
copy_skill "ai-agentic-framework/skills/040-integrations/jira"
copy_skill "ai-agentic-framework/skills/040-integrations/mastering-github-agent-skill"

# LANGUAGE-SPECIFIC SKILLS (copy for ALL detected languages)
for lang in "${DETECTED_LANGS[@]}"; do
  case "$lang" in
    typescript)
      copy_skill "ai-agentic-framework/skills/050-language-frameworks/mastering-typescript"
      copy_skill "ai-agentic-framework/skills/030-quality-assurance/pr-reviewer-skill"
      ;;
    python)
      copy_skill "ai-agentic-framework/skills/050-language-frameworks/mastering-python-skill"
      ;;
    go)
      copy_skill "ai-agentic-framework/skills/050-language-frameworks/mastering-go-skill"
      ;;
    rust)
      copy_skill "ai-agentic-framework/skills/050-language-frameworks/mastering-rust-skill"
      ;;
    java)
      copy_skill "ai-agentic-framework/skills/050-language-frameworks/mastering-java-skill"
      ;;
    ruby)
      copy_skill "ai-agentic-framework/skills/050-language-frameworks/mastering-ruby-skill"
      ;;
    php)
      copy_skill "ai-agentic-framework/skills/050-language-frameworks/mastering-php-skill"
      ;;
  esac
done

# TESTING FRAMEWORK SKILLS
case "$TEST_FRAMEWORK" in
  jest)
    copy_skill "ai-agentic-framework/skills/030-quality-assurance/jest-coverage-automation"
    ;;
  pytest)
    copy_skill "ai-agentic-framework/skills/030-quality-assurance/pytest-patterns"
    ;;
esac

if [ "$E2E_FRAMEWORK" = "playwright" ]; then
  copy_skill "ai-agentic-framework/skills/030-quality-assurance/playwright-e2e-automation"
fi

# FRONTEND FRAMEWORK SKILLS
case "$FRONTEND_FRAMEWORK" in
  react)
    copy_skill "ai-agentic-framework/skills/050-language-frameworks/react-frontend"
    copy_skill "ai-agentic-framework/skills/050-language-frameworks/atomic-design-react"
    ;;
  vue)
    copy_skill "ai-agentic-framework/skills/050-language-frameworks/vue-frontend"
    ;;
  angular)
    copy_skill "ai-agentic-framework/skills/050-language-frameworks/angular-patterns"
    ;;
esac

# INFRASTRUCTURE SKILLS
if [ -f "Dockerfile" ] || [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ]; then
  copy_skill "ai-agentic-framework/skills/070-infrastructure/developing-with-docker"
fi

# Count total skills copied
skill_count=$(ls -1 .claude/.tmp/skills 2>/dev/null | wc -l)
echo ""
echo "✓ $skill_count skills copied to transaction directory"
```

### Step 5.4: Generate Agents

Generate language-specific agent files in `.claude/.tmp/agents/` based on detected stack.

```bash
echo "Generating agents based on detected stack..."

# 1. Planner (language-agnostic)
cat > .claude/.tmp/agents/planner.md << 'EOF'
---
name: planner
model: opus
description: Senior architect planning implementation strategy
subagent_type: Plan
---

# Implementation Planner

## Role
You are a senior software architect responsible for planning implementation strategies.

## Responsibilities
1. Analyze requirements and break down into implementable tasks
2. Identify files that need to be created or modified
3. Consider edge cases and error handling
4. Plan testing strategy
5. Identify potential risks or blockers

## Output Format
Return a detailed implementation plan with:
- List of files to create/modify with file paths
- Step-by-step implementation tasks
- Testing requirements
- Any assumptions or open questions
EOF

# 2. Language-specific Implementers (generate for ALL detected languages)
for lang in "${DETECTED_LANGS[@]}"; do
  case "$lang" in
    typescript)
    cat > .claude/.tmp/agents/implementer-typescript.md << EOF
---
name: implementer-typescript
model: sonnet
description: TypeScript developer implementing features
subagent_type: general-purpose
---

# TypeScript Implementer

## Role
You are a TypeScript developer implementing features in this codebase.

## Tech Stack
- Language: TypeScript
- Backend Framework: $BACKEND_FRAMEWORK
- Frontend Framework: $FRONTEND_FRAMEWORK
- Package Manager: $PKG_MGR
- Test Framework: $TEST_FRAMEWORK

## Common Commands
\`\`\`bash
# Development
$PKG_MGR run dev

# Testing
$PKG_MGR run test

# Linting
$PKG_MGR run lint

# Type Checking
$PKG_MGR run type:check

# Build
$PKG_MGR run build
\`\`\`

## Implementation Guidelines
- Follow TypeScript strict mode
- Write unit tests for all new functions
- Use existing patterns from the codebase
- Run linter before committing
EOF
    ;;
  python)
    # Determine dev command based on framework
    if [ "$BACKEND_FRAMEWORK" = "django" ]; then
      DEV_CMD="python manage.py runserver"
    elif [ "$BACKEND_FRAMEWORK" = "fastapi" ]; then
      DEV_CMD="uvicorn main:app --reload"
    elif [ "$BACKEND_FRAMEWORK" = "flask" ]; then
      DEV_CMD="flask run"
    else
      DEV_CMD="python main.py"
    fi

    # Determine test command based on framework
    if [ "$TEST_FRAMEWORK" = "pytest" ]; then
      TEST_CMD="pytest tests/ -v"
    else
      TEST_CMD="python -m unittest discover tests"
    fi

    cat > .claude/.tmp/agents/implementer-python.md << EOF
---
name: implementer-python
model: sonnet
description: Python developer implementing features
subagent_type: general-purpose
---

# Python Implementer

## Role
You are a Python developer implementing features in this codebase.

## Tech Stack
- Language: Python $LANG_VERSION
- Backend Framework: $BACKEND_FRAMEWORK
- Package Manager: $PKG_MGR
- Test Framework: $TEST_FRAMEWORK

## Common Commands
\`\`\`bash
# Development
$DEV_CMD

# Testing
$TEST_CMD

# Linting
ruff check .
black --check .

# Type Checking
mypy .

# Install Dependencies
$PKG_MGR install
\`\`\`

## Implementation Guidelines
- Follow PEP 8 style guide
- Write docstrings for all functions
- Add type hints
- Write unit tests for all new functions
- Use existing patterns from the codebase
EOF
    ;;
  go)
    cat > .claude/.tmp/agents/implementer-go.md << EOF
---
name: implementer-go
model: sonnet
description: Go developer implementing features
subagent_type: general-purpose
---

# Go Implementer

## Role
You are a Go developer implementing features in this codebase.

## Tech Stack
- Language: Go $LANG_VERSION
- Backend Framework: $BACKEND_FRAMEWORK
- Package Manager: go mod

## Common Commands
\`\`\`bash
# Development
go run cmd/server/main.go

# Testing
go test ./... -v

# Linting
golangci-lint run

# Format
gofmt -w .

# Build
go build -o bin/server cmd/server/main.go

# Dependencies
go mod tidy
go mod download
\`\`\`

## Implementation Guidelines
- Follow Go idioms and conventions
- Use gofmt for formatting
- Write table-driven tests
- Use interfaces for abstraction
- Handle errors explicitly
EOF
    ;;
  rust)
    cat > .claude/.tmp/agents/implementer-rust.md << EOF
---
name: implementer-rust
model: sonnet
description: Rust developer implementing features
subagent_type: general-purpose
---

# Rust Implementer

## Role
You are a Rust developer implementing features in this codebase.

## Tech Stack
- Language: Rust $LANG_VERSION
- Backend Framework: $BACKEND_FRAMEWORK
- Package Manager: cargo

## Common Commands
\`\`\`bash
# Development
cargo run

# Testing
cargo test

# Linting
cargo clippy

# Format
cargo fmt

# Build
cargo build --release

# Dependencies
cargo update
\`\`\`

## Implementation Guidelines
- Follow Rust idioms
- Use rustfmt for formatting
- Write tests for all public APIs
- Use Result for error handling
- Prefer borrowing over cloning
EOF
    ;;
  java)
    cat > .claude/.tmp/agents/implementer-java.md << EOF
---
name: implementer-java
model: sonnet
description: Java developer implementing features
subagent_type: general-purpose
---

# Java Implementer

## Role
You are a Java developer implementing features in this codebase.

## Tech Stack
- Language: Java $LANG_VERSION
- Backend Framework: $BACKEND_FRAMEWORK
- Package Manager: $([ -f "pom.xml" ] && echo "maven" || echo "gradle")

## Common Commands
\`\`\`bash
# Development
$([ -f "pom.xml" ] && echo "mvn spring-boot:run" || echo "gradle bootRun")

# Testing
$([ -f "pom.xml" ] && echo "mvn test" || echo "gradle test")

# Build
$([ -f "pom.xml" ] && echo "mvn clean package" || echo "gradle build")

# Dependencies
$([ -f "pom.xml" ] && echo "mvn dependency:resolve" || echo "gradle dependencies")
\`\`\`

## Implementation Guidelines
- Follow Java naming conventions
- Write unit tests for all public methods
- Use dependency injection
- Handle exceptions appropriately
- Document public APIs with Javadoc
EOF
    ;;
  ruby)
    cat > .claude/.tmp/agents/implementer-ruby.md << EOF
---
name: implementer-ruby
model: sonnet
description: Ruby developer implementing features
subagent_type: general-purpose
---

# Ruby Implementer

## Role
You are a Ruby developer implementing features in this codebase.

## Tech Stack
- Language: Ruby $LANG_VERSION
- Backend Framework: $BACKEND_FRAMEWORK
- Package Manager: $PKG_MGR

## Common Commands
\`\`\`bash
# Development
$([ "$BACKEND_FRAMEWORK" = "rails" ] && echo "rails server" || echo "ruby app.rb")

# Testing
$([ "$TEST_FRAMEWORK" = "rspec" ] && echo "rspec spec/" || echo "rake test")

# Linting
rubocop

# Console
$([ "$BACKEND_FRAMEWORK" = "rails" ] && echo "rails console" || echo "irb -r ./app.rb")

# Dependencies
bundle install
\`\`\`

## Implementation Guidelines
- Follow Ruby style guide
- Write RSpec tests for all features
- Use Ruby idioms
- Keep methods small and focused
EOF
    ;;
  *)
    cat > .claude/.tmp/agents/implementer-${lang}.md << EOF
---
name: implementer-${lang}
model: sonnet
description: ${lang} developer implementing features
subagent_type: general-purpose
---

# ${lang} Implementer

## Role
You are a ${lang} developer implementing features in this codebase.

## Tech Stack
- Language: ${lang} ${LANG_VERSION}
- Package Manager: ${PKG_MGR}

## Implementation Guidelines
- Follow project conventions
- Write tests for all new functionality
- Use existing patterns from the codebase
EOF
    ;;
  esac
done

# 3. Language-specific Testers (generate for ALL detected languages)
for lang in "${DETECTED_LANGS[@]}"; do
  case "$lang" in
    typescript)
    cat > .claude/.tmp/agents/tester-unit-typescript.md << EOF
---
name: tester-unit-typescript
model: sonnet
description: Test engineer writing comprehensive unit tests
subagent_type: general-purpose
---

# TypeScript Unit Tester

## Role
You are a test engineer writing comprehensive unit tests.

## Tech Stack
- Test Framework: $TEST_FRAMEWORK
- Coverage Tool: Jest coverage

## Test Commands
\`\`\`bash
# Run all tests
$PKG_MGR run test

# Run specific test file
$PKG_MGR run test path/to/test.spec.ts

# Run with coverage
$PKG_MGR run test:cov

# Watch mode
$PKG_MGR run test:watch
\`\`\`

## Testing Guidelines
- Aim for 80%+ code coverage
- Test happy paths and edge cases
- Mock external dependencies
- Use descriptive test names (describe/it blocks)
- Follow AAA pattern (Arrange, Act, Assert)
EOF
    ;;
  python)
    if [ "$TEST_FRAMEWORK" = "pytest" ]; then
      TEST_SINGLE="pytest tests/test_file.py"
      TEST_COV="pytest --cov=src tests/"
    else
      TEST_SINGLE="python -m unittest tests.test_file"
      TEST_COV="coverage run -m unittest discover tests && coverage report"
    fi

    cat > .claude/.tmp/agents/tester-unit-python.md << EOF
---
name: tester-unit-python
model: sonnet
description: Test engineer writing comprehensive unit tests
subagent_type: general-purpose
---

# Python Unit Tester

## Role
You are a test engineer writing comprehensive unit tests.

## Tech Stack
- Test Framework: $TEST_FRAMEWORK

## Test Commands
\`\`\`bash
# Run all tests
$TEST_CMD

# Run specific test file
$TEST_SINGLE

# Run with coverage
$TEST_COV
\`\`\`

## Testing Guidelines
- Aim for 80%+ code coverage
- Test happy paths and edge cases
- Use fixtures for test data
- Mock external dependencies
- Follow naming convention: test_*
EOF
    ;;
  go)
    cat > .claude/.tmp/agents/tester-unit-go.md << EOF
---
name: tester-unit-go
model: sonnet
description: Test engineer writing comprehensive unit tests
subagent_type: general-purpose
---

# Go Unit Tester

## Role
You are a test engineer writing comprehensive unit tests.

## Tech Stack
- Test Framework: go test

## Test Commands
\`\`\`bash
# Run all tests
go test ./... -v

# Run specific package tests
go test ./path/to/package -v

# Run with coverage
go test ./... -cover

# Run specific test
go test -run TestName ./path/to/package
\`\`\`

## Testing Guidelines
- Use table-driven tests
- Test happy paths and edge cases
- Use testify/assert for assertions
- Follow naming convention: TestFunctionName
EOF
    ;;
  rust)
    cat > .claude/.tmp/agents/tester-unit-rust.md << EOF
---
name: tester-unit-rust
model: sonnet
description: Test engineer writing comprehensive unit tests
subagent_type: general-purpose
---

# Rust Unit Tester

## Role
You are a test engineer writing comprehensive unit tests.

## Tech Stack
- Test Framework: cargo test

## Test Commands
\`\`\`bash
# Run all tests
cargo test

# Run specific test
cargo test test_name

# Run with output
cargo test -- --nocapture

# Run tests in specific file
cargo test --test test_file_name
\`\`\`

## Testing Guidelines
- Use #[test] attribute
- Test happy paths and edge cases
- Use assert!, assert_eq!, assert_ne!
- Write integration tests in tests/ directory
EOF
    ;;
  *)
    cat > .claude/.tmp/agents/tester-unit-${lang}.md << EOF
---
name: tester-unit-${lang}
model: sonnet
description: Test engineer writing comprehensive unit tests
subagent_type: general-purpose
---

# ${lang} Unit Tester

## Role
You are a test engineer writing comprehensive unit tests.

## Testing Guidelines
- Aim for high code coverage
- Test happy paths and edge cases
- Mock external dependencies
EOF
    ;;
  esac
done

# Calculate total agents generated
agent_count=$((1 + ${#DETECTED_LANGS[@]} * 2))  # 1 planner + (N implementers + N testers)

if [ ${#DETECTED_LANGS[@]} -eq 1 ]; then
  echo "✓ 3 agents generated (planner, implementer-${PRIMARY_LANG}, tester-unit-${PRIMARY_LANG})"
else
  echo "✓ $agent_count agents generated (1 planner, ${#DETECTED_LANGS[@]} implementers, ${#DETECTED_LANGS[@]} testers)"
fi
```

### Step 5.5: Validate Transaction

```bash
echo "Validating transaction files..."

# Validate skills have YAML frontmatter with 'name:' field
skill_count=$(find .claude/.tmp/skills -name "SKILL.md" | wc -l)

# Validate agents have YAML frontmatter
agent_count=$(find .claude/.tmp/agents -name "*.md" | wc -l)

echo "✓ All files validated ($skill_count skills, $agent_count agents)"
```

### Step 5.6: Commit Transaction

```bash
echo "Committing transaction..."

# Ensure target directories exist
mkdir -p .claude/skills
mkdir -p .claude/agents

# Atomic move (preserve project-context from Phase 4)
if [ -d .claude/.tmp/skills ] && [ -n "$(ls -A .claude/.tmp/skills 2>/dev/null)" ]; then
  # Remove old category folders in skills (preserve project-context)
  # Remove numbered category folders but keep project-context
  find .claude/skills -mindepth 1 -maxdepth 1 -type d ! -name "project-context" -exec rm -rf {} + 2>/dev/null || true

  # Copy all category folders from .tmp to .claude
  # Use find to avoid zsh glob expansion issues
  find .claude/.tmp/skills -mindepth 1 -maxdepth 1 -type d -exec cp -r {} .claude/skills/ \;
  echo "  ✓ Skills committed (preserving directory structure)"
fi

# Replace agents
if [ -d .claude/.tmp/agents ] && [ -n "$(ls -A .claude/.tmp/agents 2>/dev/null)" ]; then
  # Remove old agents
  rm -rf .claude/agents/*.md 2>/dev/null || true

  # Copy new agents
  find .claude/.tmp/agents -type f -name "*.md" -exec cp {} .claude/agents/ \;
  echo "  ✓ Agents committed"
fi

# Cleanup
rm -rf .claude/.tmp

echo "✓ Transaction committed successfully"
```

### Step 5.7: Generate Inventory Files

Create `.claude/skills/INDEX.md`:

```markdown
# Skills Inventory

[List all installed skills by category]
```

Create `.claude/agents/INDEX.md`:

```markdown
# Agents Inventory

[List all generated agents with their roles]
```

### Step 5.8: Check MCPs

```bash
echo "Checking MCP requirements..."

# VCS Platform Detection
git_remote=$(git remote get-url origin 2>/dev/null || echo "")
if echo "$git_remote" | grep -q "github.com"; then
  echo "✓ GitHub MCP: Repository uses GitHub"
elif echo "$git_remote" | grep -q "gitlab.com"; then
  echo "✓ GitLab MCP: Repository uses GitLab"
elif echo "$git_remote" | grep -q "bitbucket.org"; then
  echo "✓ Bitbucket MCP: Repository uses Bitbucket"
fi

# Database MCP Detection (from detected databases)
if echo "$DATABASES" | grep -q "postgresql"; then
  echo "✓ PostgreSQL MCP: PostgreSQL detected"
fi
if echo "$DATABASES" | grep -q "mysql"; then
  echo "✓ MySQL MCP: MySQL detected"
fi
if echo "$DATABASES" | grep -q "mongodb"; then
  echo "✓ MongoDB MCP: MongoDB detected"
fi

# E2E Testing MCP Detection
if [ "$E2E_FRAMEWORK" = "playwright" ]; then
  echo "✓ Playwright MCP: E2E testing detected"
fi

echo ""
echo "Note: MCP configuration requires credentials in .env or Claude settings"
```

### Phase 5 Complete ✓

**Update TodoWrite**: Mark Phase 5 as "completed"

```bash
echo "✓ Phase 5 complete - All skills, agents, and MCPs configured"
```

---

## Phase 6: Final Validation & Summary

### Step 6.1: Completion Checklist

Run this checklist to verify all phases completed:

```bash
echo "Running completion checklist..."

checklist=(
  "Phase 1: 4 agent reports received"
  "Phase 2: User questions answered"
  "Phase 3: Architect synthesis completed"
  "Phase 4: CLAUDE.md and project-context written"
  "Phase 5: Skills copied, agents generated"
)

for item in "${checklist[@]}"; do
  echo "  ✓ $item"
done
```

### Step 6.2: Count Total Output

```bash
# Count lines in generated files
wc -l .claude/CLAUDE.md .claude/skills/project-context/SKILL.md .claude/agents/*.md 2>/dev/null | tail -1 > /tmp/wc_output.txt
total_lines=$(awk '{print $1}' /tmp/wc_output.txt)
rm -f /tmp/wc_output.txt

# Count skills and agents
ls -1 .claude/skills/ > /tmp/skills.txt
skill_count=$(wc -l < /tmp/skills.txt | tr -d ' ')
rm -f /tmp/skills.txt

ls -1 .claude/agents/ > /tmp/agents.txt
agent_count=$(wc -l < /tmp/agents.txt | tr -d ' ')
rm -f /tmp/agents.txt
```

### Step 6.3: Display Final Summary

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PROJECT INITIALIZATION COMPLETE! 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Display comprehensive summary:

```markdown
## 📋 Generated Files

### Core Configuration

✓ .claude/CLAUDE.md ([X] lines) - Commands, conventions, stack
✓ .claude/skills/project-context/SKILL.md ([Y] lines) - Hard-to-discover flows

### Skills ([N] skills installed)

✓ .claude/skills/INDEX.md - Skill inventory
[List skills by category]

### Agents ([M] agents generated)

✓ .claude/agents/INDEX.md - Agent inventory
✓ planner.md (Opus) - Implementation planning
✓ implementer-[language].md (Sonnet) - Development
✓ tester-unit-[language].md (Sonnet) - Test coverage

### Stack Detected

- Language: [language]
- Backend: [framework] [version]
- Frontend: [framework] [version]
- Database: [databases]
- Testing: [frameworks]
- Package Manager: [package manager]

## 🚀 Next Steps

1. Load project context: `/project-context`
2. Start working on tickets: `/implement-ticket <ticket-id>`
3. Review skills: `ls .claude/skills/`
4. Review agents: `ls .claude/agents/`

Total Configuration: [total_lines] lines of project-specific knowledge
```

### Phase 6 Complete ✓

**ALL PHASES COMPLETED SUCCESSFULLY.**

Ask: "Would you like me to explain any section, or start working on a ticket?"

---

## Core Philosophy

**Only document what's hard to discover.** The AI can `ls`, `grep`, and `read` files instantly.

- **DO NOT include**: endpoint lists, entity field lists, module directories, env var tables, Docker service tables, component inventories
- **DO include**: multi-step flows (auth pipelines, real-time chains), non-obvious conventions (guard stacking, sort prefix), patterns where wrong approach causes bugs

**Maintenance test**: If adding an endpoint/entity/env var requires updating the file, that content should NOT be in the file.

---

## Core Rules

- **NEVER assume** - Report only what you find in code
- **Quote exact values** - Versions from package.json, patterns from tsconfig
- **Ask the engineer** for anything that cannot be determined from code
- **No hallucinated paths** - Verify every path with Glob or Read

---

## Error Handling

| Error                    | Resolution                                        |
| ------------------------ | ------------------------------------------------- |
| Subagent timeout         | Retry with focused scope                          |
| No package.json found    | Ask engineer for language/framework               |
| Conflicting reports      | Present both, ask which is correct                |
| Engineer skips questions | Proceed with available data, mark `<!-- TODO -->` |
| Stack detection fails    | Ask user: `--stack typescript\|python`            |
| Skill doesn't exist      | Log to MISSING_SKILLS.md                          |
| Agent template missing   | Create from scratch with stack-specific commands  |
