#!/bin/bash
# ============================================================================
# IMPLEMENT-TICKET SCRIPT
# ============================================================================
# Entry point for the AI Agentic Framework ticket implementation
# Implements a complete ticket through 11 automated phases:
# - Phase 0: Preflight Validation
# - Phase 1: Context Gathering
# - Phase 2: Planning & Architecture
# - Phase 3: Environment Setup
# - Phase 4: Implementation
# - Phase 5: Testing
# - Phase 6: Visual Verification
# - Phase 7: Documentation Update
# - Phase 8: PR Creation
# - Phase 9: Review Loop
# - Phase 10: Cleanup
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
${CYAN}AI Agentic Framework - Ticket Implementation${NC}

${BLUE}PREREQUISITE:${NC}
    Project must be initialized first:
    ./ai-agentic-framework/scripts/initialize-project.sh

    Graph-aware POC requires:
    - .code-graph.db in the project root
    - regenerated .claude/agents/* with mcp__code_graph tools

${BLUE}USAGE:${NC}
    $0 --ticket-id TICKET-123 [INPUT SOURCE] [OPTIONS]

${BLUE}REQUIRED:${NC}
    --ticket-id ID           Ticket ID (e.g., PROJ-123, FEAT-456)

${BLUE}INPUT SOURCE (choose one):${NC}
    --from-jira              Fetch ticket context from Jira + Confluence
    --from-markdown PATH     Read ticket context from markdown file
    --from-input             Read ticket context from stdin

${BLUE}OPTIONS:${NC}
    --start-phase N          Start from phase N (0-10) instead of phase 0
                             Default: 0 (run all phases)
                             Example: --start-phase 5 (skip phases 0-4)

    --resume                 Auto-detect last completed phase and resume
                             Default: false (start from phase 0)

    --model-tier TIER        Model tier to use for all agents
                             Default: sonnet
                             Options: haiku, sonnet, opus, openai, gemini

    --provider PROVIDER      AI provider: claude or codex
                             Default: auto-detect from project config dir

    --help, -h               Show this help message

${BLUE}ENVIRONMENT VARIABLES:${NC}
    MODEL_TIER               Model tier (same as --model-tier)
                             Default: sonnet

    ANTHROPIC_API_KEY        API key for Anthropic (Claude) provider
    OPENAI_API_KEY           API key for OpenAI (GPT) provider
    GOOGLE_API_KEY           API key for Google (Gemini) provider

    CLEANUP_TEMP_FILES       Remove temp files in Phase 10 cleanup
                             Default: false (keeps artifacts for debugging)

${BLUE}EXAMPLES:${NC}
    # Implement from Jira ticket
    ./ai-agentic-framework/scripts/implement-ticket.sh \\
      --ticket-id PROJ-123 \\
      --from-jira

    # Implement from markdown file
    ./ai-agentic-framework/scripts/implement-ticket.sh \\
      --ticket-id FEAT-456 \\
      --from-markdown ticket.md

    # Implement from stdin (paste ticket description)
    ./ai-agentic-framework/scripts/implement-ticket.sh \\
      --ticket-id BUG-789 \\
      --from-input

    # Resume from last completed phase
    ./ai-agentic-framework/scripts/implement-ticket.sh \\
      --ticket-id PROJ-123 \\
      --from-jira \\
      --resume

    # Re-run from Phase 5 (testing) onwards
    ./ai-agentic-framework/scripts/implement-ticket.sh \\
      --ticket-id PROJ-123 \\
      --from-jira \\
      --start-phase 5

    # Use fast tier (haiku models)
    MODEL_TIER=haiku ./ai-agentic-framework/scripts/implement-ticket.sh \\
      --ticket-id PROJ-123 \\
      --from-jira

${BLUE}WHAT THIS DOES:${NC}
    Phase 0:  Validate project initialized, git clean, prerequisites
    Phase 1:  Gather context from Jira/Markdown/stdin
    Phase 2:  Generate implementation plan and test plan
    Phase 3:  Setup isolated environment (Docker, Playwright)
    Phase 4:  Implement code changes
    Phase 5:  Run tests with coverage validation
    Phase 6:  Visual regression testing (screenshots)
    Phase 7:  Update documentation (CLAUDE.md)
    Phase 8:  Create pull request with artifacts
    Phase 9:  Automated PR review loop
    Phase 10: Cleanup environment and archive artifacts

${BLUE}OUTPUT:${NC}
    - Pull request URL
    - Test results with coverage
    - Visual verification screenshots
    - Artifacts archive (.tar.gz)
    - Updated CLAUDE.md

${BLUE}REQUIREMENTS:${NC}
    - Project initialized (run initialize-project.sh first)
    - Code graph initialized (.code-graph.db must exist)
    - Generated agents refreshed after this graph-aware POC update
    - node (v14+)
    - npm
    - git
    - gh CLI (GitHub CLI)
    - docker (optional, for environment isolation)

${BLUE}MORE INFO:${NC}
    See: docs/IMPLEMENT_TICKET.md for comprehensive documentation

EOF
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

TICKET_ID=""
INPUT_SOURCE=""
INPUT_VALUE=""
START_PHASE=""
RESUME="false"
MODEL_TIER="${MODEL_TIER:-sonnet}"
PROVIDER="${PROVIDER:-}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --ticket-id)
            TICKET_ID="$2"
            shift 2
            ;;
        --from-jira)
            INPUT_SOURCE="jira"
            shift
            ;;
        --from-markdown)
            INPUT_SOURCE="markdown"
            INPUT_VALUE="$2"
            shift 2
            ;;
        --from-input)
            INPUT_SOURCE="input"
            shift
            ;;
        --start-phase)
            START_PHASE="$2"
            shift 2
            ;;
        --resume)
            RESUME="true"
            shift
            ;;
        --model-tier)
            MODEL_TIER="$2"
            shift 2
            ;;
        --provider)
            PROVIDER="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown argument: $1${NC}"
            echo ""
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate ticket ID
if [ -z "$TICKET_ID" ]; then
    echo -e "${RED}Error: --ticket-id is required${NC}"
    echo ""
    echo "Example: $0 --ticket-id PROJ-123 --from-jira"
    echo ""
    echo "Use --help for more information"
    exit 1
fi

# Validate input source
if [ -z "$INPUT_SOURCE" ]; then
    echo -e "${RED}Error: Must specify one input source:${NC}"
    echo "  --from-jira        Fetch from Jira + Confluence"
    echo "  --from-markdown    Read from markdown file"
    echo "  --from-input       Read from stdin"
    echo ""
    echo "Use --help for more information"
    exit 1
fi

# Validate markdown file exists if using --from-markdown
if [ "$INPUT_SOURCE" = "markdown" ] && [ ! -f "$INPUT_VALUE" ]; then
    echo -e "${RED}Error: Markdown file not found: $INPUT_VALUE${NC}"
    exit 1
fi

# Validate start phase (if provided)
if [ -n "$START_PHASE" ] && ! [[ "$START_PHASE" =~ ^[0-9]$|^10$ ]]; then
    echo -e "${RED}Error: --start-phase must be between 0 and 10${NC}"
    exit 1
fi

# Validate model tier
case "$MODEL_TIER" in
    haiku|sonnet|opus|openai|gemini) ;;
    *)
        echo -e "${RED}Error: Invalid model tier: $MODEL_TIER${NC}"
        echo "Valid options: haiku, sonnet, opus, openai, gemini"
        exit 1
        ;;
esac

# Validate provider if explicitly set
if [ -n "$PROVIDER" ] && [ "$PROVIDER" != "claude" ] && [ "$PROVIDER" != "codex" ]; then
    echo -e "${RED}Error: --provider must be 'claude' or 'codex'${NC}"
    exit 1
fi

# ============================================================================
# VALIDATION
# ============================================================================

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  AI AGENTIC FRAMEWORK - TICKET IMPLEMENTATION${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo ""

# Resolve framework + project paths via the canonical helper. Both are LOCALLY
# scoped; never `export` them. The agent-factory in TS is the only legitimate
# point that injects FRAMEWORK_PATH into a child process's env.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/resolve-paths.sh
source "$SCRIPT_DIR/lib/resolve-paths.sh"
FRAMEWORK_PATH="$(framework_path)"
PROJECT_PATH="$(project_path)"

# Validate framework path exists
if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    exit 1
fi

# Validate project path is not the same as framework
if [ "$PROJECT_PATH" = "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework is not inside a project directory${NC}"
    echo ""
    echo "The framework must be cloned at your project root."
    exit 1
fi

echo -e "${BLUE}ℹ Framework location: $FRAMEWORK_PATH${NC}"
echo -e "${BLUE}ℹ Project location:   $PROJECT_PATH${NC}"
echo ""

# Auto-detect provider from existing config dir if not explicitly set
if [ -z "$PROVIDER" ]; then
    claude_initialized=false
    codex_initialized=false
    [ -f "$PROJECT_PATH/.claude/framework-config.json" ] && claude_initialized=true
    [ -f "$PROJECT_PATH/.codex/framework-config.json" ] && codex_initialized=true

    if $claude_initialized && $codex_initialized; then
        echo -e "${RED}Error: Both .claude/ and .codex/ config dirs are initialized.${NC}"
        echo "Pass --provider <claude|codex> to disambiguate."
        exit 1
    elif $claude_initialized; then
        PROVIDER="claude"
    elif $codex_initialized; then
        PROVIDER="codex"
    else
        echo -e "${RED}Error: Project not initialized (no framework-config.json found)${NC}"
        echo ""
        echo "You must run initialize-project first:"
        echo "  ./ai-agentic-framework/scripts/initialize-project.sh"
        echo ""
        exit 1
    fi
fi

# Resolve provider-specific paths
if [ "$PROVIDER" = "codex" ]; then
    CONFIG_DIR=".codex"
    TEMP_DIR=".codex-temp"
    INSTRUCTION_FILE="AGENTS.md"
else
    CONFIG_DIR=".claude"
    TEMP_DIR=".claude-temp"
    INSTRUCTION_FILE="CLAUDE.md"
fi

# Validate project is initialized for the requested provider
if [ ! -f "$PROJECT_PATH/$CONFIG_DIR/framework-config.json" ]; then
    echo -e "${RED}Error: Project not initialized for provider '$PROVIDER'${NC}"
    echo "  Expected: $PROJECT_PATH/$CONFIG_DIR/framework-config.json"
    echo ""
    echo "Run: ./ai-agentic-framework/scripts/initialize-project.sh --provider $PROVIDER"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Project is initialized${NC}"

if [ ! -f "$PROJECT_PATH/.code-graph.db" ]; then
    echo -e "${RED}Error: Code graph database not found: $PROJECT_PATH/.code-graph.db${NC}"
    echo ""
    echo "This graph-aware POC requires initialize-project to build the code graph."
    echo "Run:"
    echo "  ./ai-agentic-framework/scripts/initialize-project.sh"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Code graph database found${NC}"
echo ""

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Check node
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ node not found${NC}"
    echo ""
    echo "Node.js is required to run this script."
    echo "Install it from: https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ node found${NC} (${NODE_VERSION})"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    echo ""
    echo "npm is required to run this script."
    exit 1
else
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm found${NC} (v${NPM_VERSION})"
fi

# Check git
if ! command -v git &> /dev/null; then
    echo -e "${RED}✗ git not found${NC}"
    echo ""
    echo "git is required for this workflow."
    exit 1
else
    GIT_VERSION=$(git --version | awk '{print $3}')
    echo -e "${GREEN}✓ git found${NC} (v${GIT_VERSION})"
fi

# Check gh CLI
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ gh CLI not found${NC}"
    echo ""
    echo "GitHub CLI is required to create pull requests."
    echo "Install it from: https://cli.github.com/"
    exit 1
else
    GH_VERSION=$(gh --version | head -n1 | awk '{print $3}')
    echo -e "${GREEN}✓ gh CLI found${NC} (v${GH_VERSION})"
fi

# Check docker (optional)
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
    echo -e "${GREEN}✓ docker found${NC} (v${DOCKER_VERSION})"
else
    echo -e "${YELLOW}⚠ docker not found${NC} (optional - environment isolation disabled)"
fi

echo ""

# ============================================================================
# DISPLAY CONFIGURATION
# ============================================================================

echo -e "${BLUE}Configuration:${NC}"
echo "  Project Path:       $PROJECT_PATH"
echo "  Framework Path:     $FRAMEWORK_PATH"
echo "  Provider:           $PROVIDER ($CONFIG_DIR)"
echo "  Ticket ID:          $TICKET_ID"
echo "  Input Source:       $INPUT_SOURCE"
if [ "$INPUT_SOURCE" = "markdown" ]; then
    echo "  Markdown File:      $INPUT_VALUE"
fi
if [ -n "$START_PHASE" ]; then
    echo "  Start Phase:        $START_PHASE"
elif [ "$RESUME" = "true" ]; then
    echo "  Resume:             true (auto-detect last completed phase)"
else
    echo "  Start Phase:        0 (run all phases)"
fi
echo "  Model Tier:         $MODEL_TIER"
echo ""

# ============================================================================
# CONFIRMATION (if not in CI/CD)
# ============================================================================

if [ -t 0 ] && [ -z "$CI" ]; then
    echo -e "${YELLOW}This will implement ticket ${TICKET_ID} in:${NC}"
    echo "  $PROJECT_PATH"
    echo ""
    echo -e "${YELLOW}The workflow will:${NC}"
    echo "  1. Gather context from $INPUT_SOURCE"
    echo "  2. Generate implementation plan"
    echo "  3. Implement code changes"
    echo "  4. Run tests with coverage"
    echo "  5. Perform visual verification"
    echo "  6. Update documentation"
    echo "  7. Create pull request"
    echo "  8. Run automated review"
    echo "  9. Cleanup and archive"
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
# RUN TYPESCRIPT ORCHESTRATION
# ============================================================================

# Track start time
START_TIME=$(date +%s)

echo -e "${BLUE}🚀 Running TypeScript orchestration...${NC}"
echo ""

# Check if CLI file exists
ORCHESTRATION_CLI="$FRAMEWORK_PATH/orchestration/src/cli/implement.ts"
if [ ! -f "$ORCHESTRATION_CLI" ]; then
    echo -e "${RED}❌ Error: TypeScript CLI not found${NC}"
    echo "  Expected: $ORCHESTRATION_CLI"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "$FRAMEWORK_PATH/orchestration/node_modules" ]; then
    echo -e "${YELLOW}⚠️  Node modules not found, installing...${NC}"
    echo ""

    cd "$FRAMEWORK_PATH/orchestration" || exit 1

    if ! npm install --silent; then
        echo ""
        echo -e "${RED}❌ Error: Failed to install dependencies${NC}"
        exit 1
    fi

    echo ""
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Build TypeScript
cd "$FRAMEWORK_PATH/orchestration" || exit 1
echo "  Building TypeScript..."
if ! npm run build --silent 2>&1 | grep -v "deprecated" | grep -v "npm notice"; then
    echo ""
    echo -e "${RED}❌ Error: Failed to build TypeScript${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

echo "  Using TypeScript CLI: $ORCHESTRATION_CLI"
echo "  Node.js version: $(node --version)"
echo ""

# Export only what tsx genuinely needs via env. PROJECT_PATH and FRAMEWORK_PATH
# are NOT exported — paths.service derives them from import.meta.url (single
# source of truth).
export MODEL_TIER
export PROVIDER

# Build tsx command
TSX_BIN="$FRAMEWORK_PATH/orchestration/node_modules/.bin/tsx"

if [ ! -f "$TSX_BIN" ]; then
    echo -e "${RED}❌ Error: tsx binary not found at $TSX_BIN${NC}"
    exit 1
fi

# Build command arguments. --project-path / --framework-path are no longer
# passed: paths.service.ts derives them from import.meta.url.
CMD_ARGS=(
    "$TSX_BIN"
    "$ORCHESTRATION_CLI"
    --ticket-id "$TICKET_ID"
    --model-tier "$MODEL_TIER"
    --provider "$PROVIDER"
)

# Add input source
case "$INPUT_SOURCE" in
    jira)
        CMD_ARGS+=(--from-jira)
        ;;
    markdown)
        CMD_ARGS+=(--from-markdown "$INPUT_VALUE")
        ;;
    input)
        CMD_ARGS+=(--from-input)
        ;;
esac

# Add start-phase or resume
if [ "$RESUME" = "true" ]; then
    CMD_ARGS+=(--resume)
elif [ -n "$START_PHASE" ]; then
    CMD_ARGS+=(--start-phase "$START_PHASE")
fi

# Run TypeScript orchestration in foreground
# SIGINT handling is done by tsx process
trap '' SIGINT

"${CMD_ARGS[@]}" &
TSX_PID=$!

# Wait for tsx to complete
wait $TSX_PID
TSX_EXIT_CODE=$?

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# ============================================================================
# COMPLETION
# ============================================================================

if [ $TSX_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================================================${NC}"
    echo -e "${GREEN}  TICKET IMPLEMENTATION COMPLETE ✓${NC}"
    echo -e "${GREEN}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo "Ticket:   $TICKET_ID"
    echo "Project:  $PROJECT_PATH"
    echo ""
    echo -e "${GREEN}Outputs:${NC}"
    echo "  ✓ Pull request created"
    echo "  ✓ Tests passed with coverage"
    echo "  ✓ Visual verification complete"
    echo "  ✓ Documentation updated"
    echo "  ✓ Artifacts archived"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Review the pull request"
    echo "  2. Address any manual review comments"
    echo "  3. Merge when ready"
    echo ""
    echo "Outputs saved to: $PROJECT_PATH/$TEMP_DIR/implement-ticket/$TICKET_ID"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}========================================================================${NC}"
    echo -e "${RED}  TICKET IMPLEMENTATION FAILED ✗${NC}"
    echo -e "${RED}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo "Exit code: $TSX_EXIT_CODE"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  1. Check outputs: $PROJECT_PATH/$TEMP_DIR/implement-ticket/$TICKET_ID"
    echo "  2. Review phase outputs: phase*/"
    echo "  3. Resume from last successful phase: --resume"
    echo ""
    echo "For help, see: $FRAMEWORK_PATH/docs/IMPLEMENT_TICKET.md"
    echo ""
    exit $TSX_EXIT_CODE
fi
