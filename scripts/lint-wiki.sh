#!/bin/bash
# ============================================================================
# LINT-WIKI SCRIPT
# ============================================================================
# Runs structural and semantic lint checks over docs/llm-wiki/wiki/.
#
# Usage:
#   ./ai-agentic-framework/scripts/lint-wiki.sh [OPTIONS]
#
# Options:
#   --project-path PATH    Project root containing docs/llm-wiki/ (default: parent of framework dir)
#   --framework-path PATH  Framework root (default: auto-detected)
#   --graph-db PATH        Path to .code-graph.db (default: <project-path>/.code-graph.db)
#   --changed-pages LIST   Comma-separated wiki page paths for contradiction checks
#   --skip-semantic        Skip semantic (warn-only) checks
#   --artifacts-dir PATH   Directory for lint report output
#   --json-only            Suppress all output except the JSON summary line
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
${CYAN}AI Agentic Framework — Wiki Lint${NC}

${BLUE}USAGE:${NC}
    $0 [OPTIONS]

${BLUE}OPTIONS:${NC}
    --project-path PATH    Project root containing docs/llm-wiki/
                           Default: parent directory of the framework
    --framework-path PATH  Framework root
                           Default: auto-detected from script location
    --graph-db PATH        Path to .code-graph.db for graph_version checks
                           Default: <project-path>/.code-graph.db
    --changed-pages LIST   Comma-separated wiki page paths for semantic
                           contradiction checks (e.g. "wiki/ARCH.md,wiki/SERVICES.md")
    --skip-semantic        Skip semantic (warn-only) checks entirely
    --artifacts-dir PATH   Write lint reports here (JSON + Markdown)
                           Default: <project-path>/.claude-temp/wiki-lint/
    --json-only            Suppress all log output; print only the summary line
    --help, -h             Show this help message

${BLUE}EXIT CODES:${NC}
    0    No structural failures (semantic warnings do not fail)
    1    One or more structural failures detected
    130  Interrupted (SIGINT / SIGTERM)

${BLUE}EXAMPLES:${NC}
    # Full check
    $0

    # Skip semantic checks (fast, CI-safe gate)
    $0 --skip-semantic

    # Check after implementing a ticket (scoped contradiction checks)
    $0 --changed-pages "docs/llm-wiki/wiki/ARCHITECTURE.md,docs/llm-wiki/wiki/services/auth.md"

    # Check a specific project
    $0 --project-path /path/to/my-project

${BLUE}WHAT THIS CHECKS:${NC}
    Structural (fail):
      - broken-wikilinks    — [text](path) and [[wikilink]] targets must exist
      - dead-sources        — sources[].path must exist in project or raw/
      - missing-frontmatter — every page must have document_type, graph_version,
                              generated_at, summary, sources, confidence
      - graph-version-mismatch — WARN: page graph_version vs sha256(.code-graph.db)
      - graph-commit-mismatch  — WARN: page graph_commit vs git HEAD

    Semantic (warn):
      - orphans             — pages with no inbound links and absent from index.md
      - stale-claims        — sources older than 90 days with modified source files
      - dispatch-blind      — backtick symbols with 0 graph callers but ≥3 grep hits
      - contradictions      — LLM check across changed-pages + 1-hop backlinks

${BLUE}REQUIREMENTS:${NC}
    - Project initialized (run initialize-project.sh first)
    - docs/llm-wiki/ must exist and contain wiki/ subdirectory
    - node (v18+) and pnpm

EOF
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

PROJECT_PATH_ARG=""
FRAMEWORK_PATH_ARG=""
GRAPH_DB_ARG=""
CHANGED_PAGES_ARG=""
SKIP_SEMANTIC_ARG=""
ARTIFACTS_DIR_ARG=""
JSON_ONLY_ARG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --project-path)
            PROJECT_PATH_ARG="$2"
            shift 2
            ;;
        --framework-path)
            FRAMEWORK_PATH_ARG="$2"
            shift 2
            ;;
        --graph-db)
            GRAPH_DB_ARG="$2"
            shift 2
            ;;
        --changed-pages)
            CHANGED_PAGES_ARG="$2"
            shift 2
            ;;
        --skip-semantic)
            SKIP_SEMANTIC_ARG="--skip-semantic"
            shift
            ;;
        --artifacts-dir)
            ARTIFACTS_DIR_ARG="$2"
            shift 2
            ;;
        --json-only)
            JSON_ONLY_ARG="--json-only"
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
# PATH RESOLUTION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_PATH="${FRAMEWORK_PATH_ARG:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    exit 1
fi

PROJECT_PATH="${PROJECT_PATH_ARG:-$(cd "$FRAMEWORK_PATH/.." && pwd)}"

if [ "$PROJECT_PATH" = "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework is not inside a project directory${NC}"
    echo "The framework must be cloned at your project root."
    exit 1
fi

if [ -z "$JSON_ONLY_ARG" ]; then
    echo -e "${CYAN}========================================================================${NC}"
    echo -e "${CYAN}  AI AGENTIC FRAMEWORK — WIKI LINT${NC}"
    echo -e "${CYAN}========================================================================${NC}"
    echo ""
    echo -e "${BLUE}Framework: $FRAMEWORK_PATH${NC}"
    echo -e "${BLUE}Project:   $PROJECT_PATH${NC}"
    echo ""
fi

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: node not found${NC}"
    exit 1
fi

if [ ! -d "$FRAMEWORK_PATH/orchestration/node_modules" ]; then
    if [ -z "$JSON_ONLY_ARG" ]; then
        echo -e "${YELLOW}Installing dependencies...${NC}"
    fi
    cd "$FRAMEWORK_PATH/orchestration" || exit 1
    if ! pnpm install --silent 2>&1; then
        echo -e "${RED}Error: Failed to install dependencies${NC}"
        exit 1
    fi
    if [ -z "$JSON_ONLY_ARG" ]; then
        echo -e "${GREEN}Dependencies installed${NC}"
    fi
fi

TSX_BIN="$FRAMEWORK_PATH/orchestration/node_modules/.bin/tsx"
ORCHESTRATION_CLI="$FRAMEWORK_PATH/orchestration/src/cli/lint-wiki.ts"

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
    --project-path "$PROJECT_PATH"
)

[ -n "$GRAPH_DB_ARG" ] && CMD_ARGS+=(--graph-db "$GRAPH_DB_ARG")
[ -n "$CHANGED_PAGES_ARG" ] && CMD_ARGS+=(--changed-pages "$CHANGED_PAGES_ARG")
[ -n "$SKIP_SEMANTIC_ARG" ] && CMD_ARGS+=("$SKIP_SEMANTIC_ARG")
[ -n "$ARTIFACTS_DIR_ARG" ] && CMD_ARGS+=(--artifacts-dir "$ARTIFACTS_DIR_ARG")
[ -n "$JSON_ONLY_ARG" ] && CMD_ARGS+=("$JSON_ONLY_ARG")

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

if [ -z "$JSON_ONLY_ARG" ]; then
    if [ $TSX_EXIT_CODE -eq 0 ]; then
        echo ""
        echo -e "${GREEN}========================================================================${NC}"
        echo -e "${GREEN}  WIKI LINT PASSED ✓${NC}"
        echo -e "${GREEN}========================================================================${NC}"
        echo ""
        echo "Duration: ${MINUTES}m ${SECONDS}s"
        echo ""
    else
        echo ""
        echo -e "${RED}========================================================================${NC}"
        echo -e "${RED}  WIKI LINT FAILED ✗${NC}"
        echo -e "${RED}========================================================================${NC}"
        echo ""
        echo "Duration: ${MINUTES}m ${SECONDS}s"
        echo "Exit code: $TSX_EXIT_CODE"
        echo ""
        echo -e "${YELLOW}Remediation: run ${CYAN}/wiki-refresh${YELLOW} to fix stale pages, then address any remaining structural violations manually.${NC}"
        echo ""
    fi
fi

exit $TSX_EXIT_CODE
