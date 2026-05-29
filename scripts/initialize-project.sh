#!/bin/bash
# ============================================================================
# STANDALONE INITIALIZE PROJECT SCRIPT
# ============================================================================
# Entry point for the AI Agentic Framework project initialization
# Can run WITHOUT an active Claude CLI session (standalone mode)
# Spawns agents directly using: claude --model X --dangerously-skip-permissions
# ============================================================================

set -e
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# HELP MESSAGE
# ============================================================================

show_help() {
    cat << EOF
${CYAN}AI Agentic Framework - Project Initialization${NC}

${BLUE}SETUP:${NC}
    This framework must be cloned at the root of your project:

    cd /path/to/your/project
    git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework

    Then run from the framework directory:
    ./qubika-agentic-framework/scripts/initialize-project.sh

${BLUE}USAGE:${NC}
    $0 [OPTIONS]

${BLUE}OPTIONS:${NC}
    --skip-gap-questions  Skip gap analysis questions (fully automated mode)
                         Default: false (pauses if gaps detected)

    --start-phase N      Start from phase N (1-6) instead of phase 1
                         Default: 1 (run all phases)
                         Example: --start-phase 4 (skip phases 1-3)

    --timeout SECONDS    Maximum execution time in seconds
                         Default: 3600 (60 minutes)
                         Sum of per-phase max timeouts:
                           Phase 1 parallel analyzers: 30 min
                           Phase 2 question consolidator: 10 min
                           Phase 3 synthesis: 15 min
                           Phase 4-6 generation/validation: 5 min buffer

    --clean              Remove temporary files after completion
                         Default: false (keeps .claude-temp/initialize-project for re-running phases)

    --provider PROVIDER  AI provider to use: claude or codex
                         Default: auto-detect (checks API keys then CLI availability)

    --ignore PATH        Extra directory or relative path to exclude from
                         analysis. Additive to .gitignore + framework defaults.
                         Two equivalent forms — pick whichever is easier:
                           Repeatable: --ignore PATH1 --ignore PATH2
                           CSV:        --ignore PATH1,PATH2,PATH3
                         Example (repeatable):
                           --ignore orchestration/test/integration --ignore website/build
                         Example (CSV):
                           --ignore orchestration/test/integration,website/build

    --help, -h           Show this help message

${BLUE}ENVIRONMENT VARIABLES:${NC}
    MODEL_TIER           Model tier to use for all agents
                         Default: standard
                         Options: fast, standard, advanced, openai, gemini
                         Example: MODEL_TIER=fast ./scripts/initialize-project.sh

    PROVIDER             AI provider override (claude or codex)
    ANTHROPIC_API_KEY    API key for Anthropic (Claude) provider
    OPENAI_API_KEY       API key for OpenAI (GPT) provider
    GOOGLE_API_KEY       API key for Google (Gemini) provider

${BLUE}EXAMPLES:${NC}
    # Basic usage (run from project root)
    cd /path/to/your/project
    ./qubika-agentic-framework/scripts/initialize-project.sh

    # Use fast tier (haiku models for speed/cost)
    MODEL_TIER=fast ./qubika-agentic-framework/scripts/initialize-project.sh

    # Fully automated (skip gap questions)
    ./qubika-agentic-framework/scripts/initialize-project.sh --skip-gap-questions

    # Re-run from phase 4 (skip AI analysis phases 1-3)
    ./qubika-agentic-framework/scripts/initialize-project.sh --start-phase 4

    # With custom timeout (90 minutes)
    ./qubika-agentic-framework/scripts/initialize-project.sh --timeout 5400

${BLUE}WHAT THIS DOES:${NC}
    1. Phase 1: Parallel analysis (4 agents with retry/feedback)
    2. Phase 2: Consolidation & gap analysis
    3. Phase 3: Opus synthesis (comprehensive project understanding)
    4. Phase 4: File writing (CLAUDE.md, project-context, etc.)
    5. Phase 5: Resource copying (skills, agents, commands)
    6. Phase 6: Final validation

${BLUE}OUTPUT:${NC}
    claude provider:
    - .claude/CLAUDE.md              Quick reference guide
    - .claude/skills/project-context/ Comprehensive project knowledge
    - .claude/skills/*               Language-specific skills
    - .claude/agents/*               Generated agents
    - .claude/commands/*             Project commands

    codex provider:
    - .codex/AGENTS.md               Quick reference guide
    - .codex/skills/project-context/ Comprehensive project knowledge
    - .codex/skills/*                Language-specific skills
    - .codex/agents/*                Generated agents
    - .codex/commands/*              Project commands

${BLUE}REQUIREMENTS:${NC}
    - claude CLI or codex CLI (installed and in PATH)
    - node (v14+)
    - npm
    - bash 4.0+

${BLUE}MORE INFO:${NC}
    See: docs/INITIALIZE_PROJECT.md for comprehensive documentation

EOF
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

SKIP_GAP_QUESTIONS="false"
START_PHASE=1
TIMEOUT=3600
CLEAN_TEMP="false"
PROVIDER=""
IGNORE_PATHS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-gap-questions)
            SKIP_GAP_QUESTIONS="true"
            shift
            ;;
        --start-phase)
            START_PHASE="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --clean)
            CLEAN_TEMP="true"
            shift
            ;;
        --provider)
            PROVIDER="$2"
            shift 2
            ;;
        --ignore)
            # Repeatable flag. Comma-separated values also accepted — the TS
            # CLI normalises and validates each entry.
            IFS=',' read -r -a _ignore_tokens <<< "$2"
            for _ignore_token in "${_ignore_tokens[@]}"; do
                [ -n "$_ignore_token" ] && IGNORE_PATHS+=("$_ignore_token")
            done
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown argument: $1${NC}"
            echo ""
            echo "This script no longer accepts path arguments."
            echo "The framework must be cloned at your project root:"
            echo ""
            echo "  cd /path/to/your/project"
            echo "  git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework"
            echo "  ./qubika-agentic-framework/scripts/initialize-project.sh"
            echo ""
            echo "Use --help for more information"
            exit 1
            ;;
    esac
done

# Validate start phase
if ! [[ "$START_PHASE" =~ ^[1-6]$ ]]; then
    echo -e "${RED}Error: --start-phase must be between 1 and 6${NC}"
    exit 1
fi

# Validate provider if explicitly set
if [ -n "$PROVIDER" ] && [ "$PROVIDER" != "claude" ] && [ "$PROVIDER" != "codex" ]; then
    echo -e "${RED}Error: --provider must be 'claude' or 'codex'${NC}"
    exit 1
fi

# Auto-detect provider if not explicitly set
if [ -z "$PROVIDER" ]; then
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        PROVIDER="claude"
    elif [ -n "$OPENAI_API_KEY" ]; then
        PROVIDER="codex"
    elif command -v claude &> /dev/null && claude --version &> /dev/null 2>&1; then
        PROVIDER="claude"
    elif command -v codex &> /dev/null && codex --version &> /dev/null 2>&1; then
        PROVIDER="codex"
    else
        PROVIDER="claude"
    fi
fi

# ============================================================================
# VALIDATION
# ============================================================================

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  AI AGENTIC FRAMEWORK - PROJECT INITIALIZATION${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo ""

# Resolve FRAMEWORK_PATH and PROJECT_PATH via the canonical helper.
# Both are LOCALLY scoped — never `export`. The agent-factory in TS is the only
# legitimate point that injects FRAMEWORK_PATH into a child process's env.
# shellcheck source=lib/resolve-paths.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/resolve-paths.sh"
FRAMEWORK_PATH="$(framework_path)"
PROJECT_PATH="$(project_path)"

# Validate framework path exists
if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    echo ""
    echo "This script must be run from the framework's scripts/ directory."
    echo "Expected to find framework at: $FRAMEWORK_PATH"
    echo ""
    exit 1
fi

# Surface dogfooding mode for the user (helper handled the actual detection).
# In dogfooding, the framework's physical path equals its logical parent because the
# `qubika-agentic-framework -> .` self-symlink redirects in-place.
if [ "$(cd "$FRAMEWORK_PATH" && pwd -P)" = "$(cd "$FRAMEWORK_PATH/.." && pwd)" ]; then
    echo -e "${YELLOW}🔄 Dogfooding mode detected (framework developing itself)${NC}"
elif [ "$PROJECT_PATH" = "$FRAMEWORK_PATH" ]; then
    # Normal mode but framework is NOT inside a target project — bail out.
    echo -e "${RED}Error: Framework is not inside a project directory${NC}"
    echo ""
    echo "The framework must be cloned at your project root:"
    echo ""
    echo "  cd /path/to/your/project"
    echo "  git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework"
    echo "  ./qubika-agentic-framework/scripts/initialize-project.sh"
    echo ""
    exit 1
fi

echo -e "${BLUE}ℹ Framework location: $FRAMEWORK_PATH${NC}"
echo -e "${BLUE}ℹ Project location:   $PROJECT_PATH${NC}"
echo ""

# ============================================================================
# MINIMAL PREREQUISITE CHECKS (Infrastructure Only)
# ============================================================================
# NOTE: All business logic validations (Node version, Claude CLI, auth mode,
# paths, .gitignore) are now handled by TypeScript preflight checks.
# Bash script only ensures the minimum to launch TypeScript.
# ============================================================================

echo -e "${BLUE}Checking infrastructure prerequisites...${NC}"
echo ""

# Check node (basic check - version validated by TypeScript)
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ node not found${NC}"
    echo ""
    echo "Node.js is required to launch the TypeScript orchestration."
    echo "Install it from: https://nodejs.org/"
    echo ""
    exit 1
fi

# Check npm (basic check - version validated by TypeScript)
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    echo ""
    echo "npm is required to install dependencies."
    echo "It typically comes with Node.js."
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Node.js and npm found${NC}"
echo ""

# ============================================================================
# DISPLAY CONFIGURATION
# ============================================================================

echo -e "${BLUE}Configuration:${NC}"
echo "  Project Path:       $PROJECT_PATH"
echo "  Framework Path:     $FRAMEWORK_PATH"
echo "  Provider:           $PROVIDER"
echo "  Start Phase:        $START_PHASE"
echo "  Skip Gap Questions: $SKIP_GAP_QUESTIONS"
echo "  Timeout:            ${TIMEOUT}s ($(($TIMEOUT / 60)) minutes)"
echo "  Clean Temp Files:   $CLEAN_TEMP"
echo ""

# ============================================================================
# CONFIRMATION (if not in CI/CD)
# ============================================================================

if [ -t 0 ] && [ -z "$CI" ]; then
    echo -e "${YELLOW}This will initialize the AI Agentic Framework in:${NC}"
    echo "  $PROJECT_PATH"
    echo ""
    echo -e "${YELLOW}The following will be created:${NC}"
    if [ "$PROVIDER" = "codex" ]; then
        echo "  - .codex/AGENTS.md"
        echo "  - .codex/skills/project-context/"
        echo "  - .codex/skills/* (language-specific)"
        echo "  - .codex/agents/*"
        echo "  - .codex/commands/*"
    else
        echo "  - .claude/CLAUDE.md"
        echo "  - .claude/skills/project-context/"
        echo "  - .claude/skills/* (language-specific)"
        echo "  - .claude/agents/*"
        echo "  - .claude/commands/*"
    fi
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
fi

# ============================================================================
# RUN ORCHESTRATION
# ============================================================================

# Track start time
START_TIME=$(date +%s)

# ============================================================================
# TYPESCRIPT ORCHESTRATION
# ============================================================================

# Always use TypeScript orchestration
if true; then
    echo -e "${BLUE}🚀 Running TypeScript orchestration...${NC}"
    echo ""

    # Check if CLI file exists (infrastructure check only)
    ORCHESTRATION_CLI="$FRAMEWORK_PATH/orchestration/src/cli/initialize.ts"
    if [ ! -f "$ORCHESTRATION_CLI" ]; then
        echo -e "${RED}❌ Error: TypeScript CLI not found${NC}"
        echo "  Expected: $ORCHESTRATION_CLI"
        echo ""
        echo "The orchestration module may not be set up correctly."
        echo ""
        exit 1
    fi

    # Check if node_modules exists and is valid
    NEED_INSTALL=false

    if [ ! -d "$FRAMEWORK_PATH/orchestration/node_modules" ]; then
        echo -e "${YELLOW}⚠️  Node modules not found${NC}"
        NEED_INSTALL=true
    else
        # Verify tsx binary exists and is valid
        if [ ! -f "$FRAMEWORK_PATH/orchestration/node_modules/.bin/tsx" ]; then
            echo -e "${YELLOW}⚠️  tsx binary not found (corrupted node_modules)${NC}"
            NEED_INSTALL=true
        else
            # Test if tsx can execute (detect corruption)
            if ! cd "$FRAMEWORK_PATH/orchestration" || ! npx tsx --version &> /dev/null; then
                echo -e "${YELLOW}⚠️  tsx binary is corrupted${NC}"
                NEED_INSTALL=true
            fi
        fi
    fi

    # Install or reinstall dependencies if needed
    if [ "$NEED_INSTALL" = true ]; then
        echo -e "${YELLOW}Installing/reinstalling dependencies...${NC}"
        echo ""

        # Clean install to fix corruption
        if ! cd "$FRAMEWORK_PATH/orchestration"; then
            echo -e "${RED}❌ Error: Cannot access orchestration directory${NC}"
            exit 1
        fi

        # Remove corrupted node_modules if it exists
        if [ -d "node_modules" ]; then
            echo "  Removing corrupted node_modules..."
            rm -rf node_modules package-lock.json
        fi

        # Install fresh
        echo "  Running npm install..."
        if ! npm install --silent; then
            echo ""
            echo -e "${RED}❌ Error: Failed to install dependencies${NC}"
            echo ""
            echo "Please install manually:"
            echo "  cd $FRAMEWORK_PATH/orchestration"
            echo "  rm -rf node_modules package-lock.json"
            echo "  npm install"
            echo ""
            exit 1
        fi

        echo ""
        echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
        echo ""
    fi

    # Build TypeScript to ensure code is up to date
    cd "$FRAMEWORK_PATH/orchestration" || exit 1
    echo "  Building TypeScript..."
    if ! npm run build --silent; then
        echo ""
        echo -e "${RED}❌ Error: Failed to build TypeScript${NC}"
        echo ""
        echo "Please build manually:"
        echo "  cd $FRAMEWORK_PATH/orchestration"
        echo "  npm run build"
        echo ""
        exit 1
    fi
    echo -e "${GREEN}✓ Build completed successfully${NC}"
    echo ""

    echo "  Using TypeScript CLI: $ORCHESTRATION_CLI"
    echo "  Node.js version: $(node --version)"
    echo ""

    # Run TypeScript orchestration
    # Note: cd to orchestration directory so npx can find tsx in node_modules
    # Run tsx in foreground (NOT using exec) so CTRL+C signal handling works correctly
    # When user presses CTRL+C, both bash and tsx receive SIGINT, tsx handles it properly
    cd "$FRAMEWORK_PATH/orchestration" || exit 1

    # Export only what tsx genuinely needs to receive via env. PROJECT_PATH and
    # FRAMEWORK_PATH are NOT exported — tsx uses paths.service to derive them
    # locally from import.meta.url (single source of truth).
    export MODEL_TIER="${MODEL_TIER:-standard}"
    export PROVIDER

    # Run tsx in foreground - CTRL+C will send SIGINT to tsx which has proper handlers
    # CRITICAL: Use node_modules/.bin/tsx directly, NOT npx (npx adds another process layer)
    TSX_BIN="$FRAMEWORK_PATH/orchestration/node_modules/.bin/tsx"

    if [ ! -f "$TSX_BIN" ]; then
        echo -e "${RED}❌ Error: tsx binary not found at $TSX_BIN${NC}"
        exit 1
    fi

    # Run TypeScript orchestration with --start-phase support
    # NOTE: tsx must run in foreground to preserve stdin access for interactive prompts
    # The gap questions feature requires stdin to be connected to the terminal

    # Build common tsx arguments. --project-path / --framework-path are no longer
    # passed: paths.service.ts derives them from import.meta.url.
    TSX_ARGS=(
        "$ORCHESTRATION_CLI"
        --provider "$PROVIDER"
    )

    # Forward each user-supplied --ignore path. TS-side parseIgnoreFlag()
    # validates absolute / glob / parent-escape input before workflow starts.
    if [ "${#IGNORE_PATHS[@]}" -gt 0 ]; then
        for _ignore_path in "${IGNORE_PATHS[@]}"; do
            TSX_ARGS+=(--ignore "$_ignore_path")
        done
    fi

    # Build tsx command with optional start-phase parameter
    if [ "$START_PHASE" -gt 1 ]; then
        echo -e "${BLUE}Starting from Phase $START_PHASE...${NC}"
        echo ""
        "$TSX_BIN" "${TSX_ARGS[@]}" --start-phase "$START_PHASE"
        TSX_EXIT_CODE=$?
    else
        "$TSX_BIN" "${TSX_ARGS[@]}"
        TSX_EXIT_CODE=$?
    fi

    # Calculate duration
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    MINUTES=$((DURATION / 60))
    SECONDS=$((DURATION % 60))

    # Exit with the same code tsx used
    exit $TSX_EXIT_CODE
fi

# ============================================================================
# COMPLETION
# ============================================================================

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================================================${NC}"
    echo -e "${GREEN}  INITIALIZATION COMPLETE ✓${NC}"
    echo -e "${GREEN}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo "Project:  $PROJECT_PATH"
    if [ "$START_PHASE" -gt 1 ]; then
        echo "Phases:   $START_PHASE-6 (started from phase $START_PHASE)"
    else
        echo "Phases:   1-6 (complete initialization)"
    fi
    echo ""
    echo -e "${GREEN}Generated files:${NC}"
    if [ "$PROVIDER" = "codex" ]; then
        echo "  ✓ .codex/AGENTS.md"
        echo "  ✓ .codex/skills/project-context/SKILL.md"
        echo "  ✓ .codex/skills/* (language-specific)"
        echo "  ✓ .codex/agents/*"
        echo "  ✓ .codex/commands/*"
    else
        echo "  ✓ .claude/CLAUDE.md"
        echo "  ✓ .claude/skills/project-context/SKILL.md"
        echo "  ✓ .claude/skills/* (language-specific)"
        echo "  ✓ .claude/agents/*"
        echo "  ✓ .claude/commands/*"
    fi
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. cd $PROJECT_PATH"
    if [ "$PROVIDER" = "codex" ]; then
        echo "  2. codex  # Start Codex CLI"
        echo "  3. /project-context  # Load project knowledge"
        echo "  4. /start-task  # Begin working on tasks"
        echo ""
        echo "For quick reference, see: .codex/AGENTS.md"
    else
        echo "  2. claude  # Start Claude CLI"
        echo "  3. /project-context  # Load project knowledge"
        echo "  4. /start-task  # Begin working on tasks"
        echo ""
        echo "For quick reference, see: .claude/CLAUDE.md"
    fi
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}========================================================================${NC}"
    echo -e "${RED}  INITIALIZATION FAILED ✗${NC}"
    echo -e "${RED}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo "Exit code: $EXIT_CODE"
    echo ""
    if [ "$PROVIDER" = "codex" ]; then
        TEMP_DIR=".codex-temp"
    else
        TEMP_DIR=".claude-temp"
    fi
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  1. Check logs in: $PROJECT_PATH/$TEMP_DIR/initialize-project/"
    echo "  2. Review phase outputs: $PROJECT_PATH/$TEMP_DIR/initialize-project/phase*"
    echo "  3. Re-run with more verbose output"
    echo "  4. Verify provider CLI is installed: $PROVIDER --version"
    if [ "$PROVIDER" = "codex" ]; then
        echo "  5. Verify OPENAI_API_KEY is set (codex provider)"
    else
        echo "  5. Verify ANTHROPIC_API_KEY is set or claude CLI is authenticated"
    fi
    echo ""
    echo "For help, see: $FRAMEWORK_PATH/docs/INITIALIZE_PROJECT.md"
    echo ""
    exit $EXIT_CODE
fi
