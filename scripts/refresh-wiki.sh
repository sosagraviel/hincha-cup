#!/bin/bash
# ============================================================================
# REFRESH-WIKI SCRIPT
# ============================================================================
# Incrementally refreshes the LLM wiki at docs/llm-wiki/ after code changes.
#
# Usage:
#   ./ai-agentic-framework/scripts/refresh-wiki.sh [OPTIONS]
#
# Options:
#   --provider PROVIDER    AI provider: claude or codex (auto-detected)
#   --since SHA            Refresh pages affected since this commit
#   --force                Full regeneration regardless of .state.json
#   --pages GLOBS          Comma-separated glob patterns to filter pages
#   --dry-run              Print planned refresh set without writing files
#   --help, -h             Show this help
# ============================================================================

set -e
set -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

show_help() {
    cat << EOF
${CYAN}AI Agentic Framework — Wiki Refresh${NC}

${BLUE}USAGE:${NC}
    $0 [OPTIONS]

${BLUE}OPTIONS:${NC}
    --provider PROVIDER    AI provider: claude or codex
                           Default: auto-detected from project config
    --since SHA            Refresh only pages affected since this commit SHA
                           Default: read from docs/llm-wiki/.state.json
    --force                Force full regeneration (ignore .state.json)
    --pages GLOBS          Comma-separated page glob patterns to restrict scope
                           Example: --pages "services/auth,ARCHITECTURE"
    --dry-run              Print planned refresh set without writing any files
    --help, -h             Show this help message

${BLUE}EXAMPLES:${NC}
    # Incremental refresh (uses .state.json to detect last commit)
    $0

    # Refresh pages affected since a specific commit
    $0 --since abc1234

    # Force full regeneration
    $0 --force

    # Preview what would be refreshed (no writes)
    $0 --dry-run

    # Refresh only service pages
    $0 --pages "wiki/services/"

    # Refresh for a specific project path
    $0 --force

${BLUE}WHAT THIS DOES:${NC}
    1. Reads docs/llm-wiki/.state.json to find last indexed commit
    2. Runs git diff to find changed files
    3. Updates the code graph incrementally
    4. Computes the minimum set of wiki pages to refresh
    5. Regenerates affected pages using the wiki-generator agent
    6. Appends entries to CHANGELOG.md and log.md
    7. Runs wiki-lint (stub in Phase D; full checks in Phase E)
    8. Updates .state.json if lint passes

    Files are LEFT UNCOMMITTED. Review diffs and commit manually or via Phase 8.5.

${BLUE}REQUIREMENTS:${NC}
    - Project initialized (run initialize-project.sh first)
    - docs/llm-wiki/ must exist
    - .code-review-graph/graph.db must exist
    - node (v18+) and pnpm

EOF
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

PROVIDER_ARG=""
SINCE_ARG=""
FORCE_ARG=""
PAGES_ARG=""
DRY_RUN_ARG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --provider)
            PROVIDER_ARG="$2"
            shift 2
            ;;
        --since)
            SINCE_ARG="$2"
            shift 2
            ;;
        --force)
            FORCE_ARG="--force"
            shift
            ;;
        --pages)
            PAGES_ARG="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN_ARG="--dry-run"
            shift
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

# ============================================================================
# PATH RESOLUTION (single source of truth — see scripts/lib/resolve-paths.sh)
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/resolve-paths.sh
source "$SCRIPT_DIR/lib/resolve-paths.sh"
FRAMEWORK_PATH="$(framework_path)"
PROJECT_PATH="$(project_path)"

if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    exit 1
fi

if [ "$PROJECT_PATH" = "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework is not inside a project directory${NC}"
    echo "The framework must be cloned at your project root."
    exit 1
fi

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  AI AGENTIC FRAMEWORK — WIKI REFRESH${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo ""
echo -e "${BLUE}Framework: $FRAMEWORK_PATH${NC}"
echo -e "${BLUE}Project:   $PROJECT_PATH${NC}"
echo ""

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: node not found${NC}"
    exit 1
fi

if [ ! -d "$FRAMEWORK_PATH/orchestration/node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    cd "$FRAMEWORK_PATH/orchestration" || exit 1
    if ! pnpm install --silent 2>&1; then
        echo -e "${RED}Error: Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}Dependencies installed${NC}"
fi

TSX_BIN="$FRAMEWORK_PATH/orchestration/node_modules/.bin/tsx"
ORCHESTRATION_CLI="$FRAMEWORK_PATH/orchestration/src/cli/refresh-wiki.ts"

if [ ! -f "$TSX_BIN" ]; then
    echo -e "${RED}Error: tsx binary not found at $TSX_BIN${NC}"
    exit 1
fi

if [ ! -f "$ORCHESTRATION_CLI" ]; then
    echo -e "${RED}Error: CLI not found at $ORCHESTRATION_CLI${NC}"
    exit 1
fi

# ============================================================================
# BUILD COMMAND
# ============================================================================

CMD_ARGS=(
    "$TSX_BIN"
    "$ORCHESTRATION_CLI"
)

[ -n "$PROVIDER_ARG" ] && CMD_ARGS+=(--provider "$PROVIDER_ARG")
[ -n "$SINCE_ARG" ] && CMD_ARGS+=(--since "$SINCE_ARG")
[ -n "$FORCE_ARG" ] && CMD_ARGS+=("$FORCE_ARG")
[ -n "$PAGES_ARG" ] && CMD_ARGS+=(--pages "$PAGES_ARG")
[ -n "$DRY_RUN_ARG" ] && CMD_ARGS+=("$DRY_RUN_ARG")

# ============================================================================
# RUN
# ============================================================================

START_TIME=$(date +%s)

trap '' SIGINT
"${CMD_ARGS[@]}" &
TSX_PID=$!
wait $TSX_PID
TSX_EXIT_CODE=$?

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

if [ $TSX_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================================================${NC}"
    echo -e "${GREEN}  WIKI REFRESH COMPLETE ✓${NC}"
    echo -e "${GREEN}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Review the wiki diffs: git diff docs/llm-wiki/"
    echo "  2. Commit the wiki changes: git add docs/llm-wiki/ && git commit -m 'docs(wiki): refresh'"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}========================================================================${NC}"
    echo -e "${RED}  WIKI REFRESH FAILED ✗${NC}"
    echo -e "${RED}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo "Exit code: $TSX_EXIT_CODE"
    echo ""
    exit $TSX_EXIT_CODE
fi
