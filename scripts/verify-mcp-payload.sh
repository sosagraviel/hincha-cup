#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/docs/mcp-user-questions"
FIXTURES_DIR="$HOOKS_DIR/fixtures"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required. Install jq (see README §MCP integrations)." >&2
  exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

STUB_PROJECT_DIR="/stub/project"
mkdir -p "$WORK_DIR/.claude-temp/sessions"

cat > "$WORK_DIR/session.json" <<'SESSION'
{
  "session_id": "00000000-0000-0000-0000-000000000001",
  "transcript_path": "/stub/project/.claude/projects/stub/transcript.jsonl",
  "source": "startup",
  "started_at": "2026-01-01T00:00:00.000Z"
}
SESSION

PAYLOAD_SCRIPT_PATH="$WORK_DIR/build-mcp-payload.sh"
cp "$HOOKS_DIR/build-mcp-payload.sh" "$PAYLOAD_SCRIPT_PATH"
chmod +x "$PAYLOAD_SCRIPT_PATH"

STUB_SESSION_FILE="$WORK_DIR/session.json"
sed -i.bak "s|\${CLAUDE_PROJECT_DIR:-\$PWD}/.claude-temp/sessions/session.json|$STUB_SESSION_FILE|g" "$PAYLOAD_SCRIPT_PATH"
rm -f "$PAYLOAD_SCRIPT_PATH.bak"

uuidgen() { echo "00000000-0000-0000-0000-000000000002"; }
export -f uuidgen 2>/dev/null || true

date() {
  if [[ "${1:-}" == "-u" ]]; then
    echo "2026-01-01T00:01:00.000Z"
  else
    command date "$@"
  fi
}
export -f date 2>/dev/null || true

pwd() { echo "/stub/project"; }
export -f pwd 2>/dev/null || true

basename() {
  if [[ "${1:-}" == "/stub/project" ]]; then
    echo "stub-project"
  else
    command basename "$@"
  fi
}
export -f basename 2>/dev/null || true

uname() {
  if [[ "${1:-}" == "-s" ]]; then
    echo "Linux"
  else
    command uname "$@"
  fi
}
export -f uname 2>/dev/null || true

git() {
  local cmd
  if [[ "${1:-}" == "-C" ]]; then
    cmd="${3:-}"
  else
    cmd="${1:-}"
  fi
  case "$cmd" in
    remote) echo "git@github.com:stub/stub-project.git" ;;
    rev-parse)
      local arg
      if [[ "${1:-}" == "-C" ]]; then
        arg="${4:-}"
      else
        arg="${2:-}"
      fi
      case "$arg" in
        --abbrev-ref) echo "main" ;;
        HEAD) echo "0000000000000000000000000000000000000001" ;;
        *) echo "" ;;
      esac
      ;;
    status) echo "" ;;
    config)
      local key
      if [[ "${1:-}" == "-C" ]]; then
        key="${4:-}"
      else
        key="${2:-}"
      fi
      case "$key" in
        user.email) echo "stub@example.com" ;;
        user.name) echo "Stub User" ;;
        *) echo "" ;;
      esac
      ;;
    *) echo "" ;;
  esac
}
export -f git 2>/dev/null || true

node() {
  case "${1:-}" in
    -v) echo "v22.0.0" ;;
    -e) echo "00000000-0000-0000-0000-000000000002" ;;
    *) command node "$@" ;;
  esac
}
export -f node 2>/dev/null || true

FAIL=0

run_fixture_check() {
  local fixture_file="$1"
  local fixture_name
  fixture_name=$(command basename "$fixture_file")

  local skill phase ticket_id ticket_source ticket_title ticket_url questions_json

  case "$fixture_name" in
    payload-implement-ticket-phase-4.json)
      skill="implement-ticket"
      phase="phase-4-branch-consent"
      ticket_id="STUB-123"
      ticket_source="jira"
      ticket_title="Stub ticket"
      ticket_url="https://stub.atlassian.net/browse/STUB-123"
      questions_json='[{"id":"phase-4-branch-consent","question":"Which base should this branch use?","options":[{"label":"Use active branch main"},{"label":"Use a different base"}],"multi_select":false}]'
      ;;
    payload-create-sdd-ticket-phase-3-gaps.json)
      skill="create-sdd-ticket"
      phase="phase-3-gaps"
      ticket_id=""
      ticket_source=""
      ticket_title=""
      ticket_url=""
      questions_json='[{"id":"proposedChanges","question":"What specific components will be modified?","context":"Searched the codebase but found multiple possible implementations.","options":[{"label":"Modify UserController"},{"label":"Add AuthService"},{"label":"Update User model"},{"label":"Other"}],"multi_select":true}]'
      ;;
    *)
      echo "SKIP: unknown fixture $fixture_name"
      return 0
      ;;
  esac

  PRODUCED=$(
    export CLAUDE_PROJECT_DIR="$STUB_PROJECT_DIR"
    export MCP_SKILL="$skill"
    export MCP_PHASE="$phase"
    export MCP_ATTEMPT=1
    if [[ -n "$ticket_id" ]]; then export MCP_TICKET_ID="$ticket_id"; else unset MCP_TICKET_ID 2>/dev/null || true; fi
    if [[ -n "$ticket_source" ]]; then export MCP_TICKET_SOURCE="$ticket_source"; else unset MCP_TICKET_SOURCE 2>/dev/null || true; fi
    if [[ -n "$ticket_title" ]]; then export MCP_TICKET_TITLE="$ticket_title"; else unset MCP_TICKET_TITLE 2>/dev/null || true; fi
    if [[ -n "$ticket_url" ]]; then export MCP_TICKET_URL="$ticket_url"; else unset MCP_TICKET_URL 2>/dev/null || true; fi
    unset MCP_TICKET_STATUS MCP_PARENT_BATCH_ID MCP_FLAGS_JSON MCP_PROJECT_BASE_BRANCH 2>/dev/null || true
    bash "$PAYLOAD_SCRIPT_PATH"
  )

  FINAL=$(echo "$PRODUCED" | jq --argjson q "$questions_json" '. + {questions: $q}')
  EXPECTED=$(cat "$fixture_file")

  PRODUCED_NORM=$(echo "$FINAL" | jq -S .)
  EXPECTED_NORM=$(echo "$EXPECTED" | jq -S .)

  if diff_out=$(diff <(echo "$EXPECTED_NORM") <(echo "$PRODUCED_NORM") 2>&1); then
    echo "PASS: $fixture_name"
  else
    echo "FAIL: $fixture_name"
    echo "$diff_out"
    FAIL=1
  fi
}

for fixture in "$FIXTURES_DIR"/*.json; do
  run_fixture_check "$fixture"
done

exit $FAIL
