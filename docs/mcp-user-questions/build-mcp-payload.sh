#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required. Install jq (see README §MCP integrations)." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required. Install Node.js (see README §MCP integrations)." >&2
  exit 1
fi

SESSION_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.claude-temp/sessions/session.json"

if [[ ! -f "$SESSION_FILE" ]]; then
  if [[ -n "${QAF_ASK_USER_MCP_TOOL:-}" ]]; then
    echo "ERROR: QAF_ASK_USER_MCP_TOOL is set but session.json is missing." >&2
    echo "  Configure the SessionStart hook per ask-user-questions-contract.md §3.3." >&2
    exit 1
  fi
  echo '{}'
  exit 0
fi

SESSION_JSON=$(cat "$SESSION_FILE")

PROJECT_PATH="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROJECT_NAME=$(basename "$PROJECT_PATH")
PROJECT_REPO_URL=$(git -C "$PROJECT_PATH" remote get-url origin 2>/dev/null || true)
PROJECT_BRANCH=$(git -C "$PROJECT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
PROJECT_BASE_BRANCH="${MCP_PROJECT_BASE_BRANCH:-}"
PROJECT_COMMIT_SHA=$(git -C "$PROJECT_PATH" rev-parse HEAD 2>/dev/null || true)
PROJECT_DIRTY=""
if git -C "$PROJECT_PATH" status --porcelain 2>/dev/null | grep -q .; then
  PROJECT_DIRTY="true"
else
  PROJECT_DIRTY="false"
fi

USER_EMAIL=$(git -C "$PROJECT_PATH" config user.email 2>/dev/null || true)
USER_NAME=$(git -C "$PROJECT_PATH" config user.name 2>/dev/null || true)

RUNTIME_PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
RUNTIME_NODE_VERSION=$(node -v 2>/dev/null || echo "")
RUNTIME_CWD=$(pwd)

BATCH_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' 2>/dev/null || node -e "console.log(require('crypto').randomUUID())")
CALLED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

INVOCATION_JSON=$(jq -n \
  --arg skill "${MCP_SKILL:-}" \
  --arg phase "${MCP_PHASE:-}" \
  --arg batch_id "$BATCH_ID" \
  --arg called_at "$CALLED_AT" \
  --argjson attempt "${MCP_ATTEMPT:-1}" \
  --arg parent_batch_id "${MCP_PARENT_BATCH_ID:-}" \
  '{
    skill: $skill,
    phase: $phase,
    batch_id: $batch_id,
    called_at: $called_at,
    attempt: $attempt
  } + (if $parent_batch_id != "" then {parent_batch_id: $parent_batch_id} else {} end)'
)

PROJECT_JSON=$(jq -n \
  --arg path "$PROJECT_PATH" \
  --arg name "$PROJECT_NAME" \
  --arg repo_url "$PROJECT_REPO_URL" \
  --arg branch "$PROJECT_BRANCH" \
  --arg base_branch "$PROJECT_BASE_BRANCH" \
  --arg commit_sha "$PROJECT_COMMIT_SHA" \
  --argjson dirty "$PROJECT_DIRTY" \
  '{path: $path, name: $name}
    + (if $repo_url != "" then {repo_url: $repo_url} else {} end)
    + (if $branch != "" then {branch: $branch} else {} end)
    + (if $base_branch != "" then {base_branch: $base_branch} else {} end)
    + (if $commit_sha != "" then {commit_sha: $commit_sha} else {} end)
    + {dirty: $dirty}'
)

USER_JSON=""
if [[ -n "$USER_EMAIL" || -n "$USER_NAME" ]]; then
  USER_JSON=$(jq -n \
    --arg email "$USER_EMAIL" \
    --arg name "$USER_NAME" \
    '{}
      + (if $email != "" then {email: $email} else {} end)
      + (if $name != "" then {name: $name} else {} end)'
  )
fi

RUNTIME_JSON=$(jq -n \
  --arg platform "$RUNTIME_PLATFORM" \
  --arg node_version "$RUNTIME_NODE_VERSION" \
  --arg cwd "$RUNTIME_CWD" \
  '{platform: $platform, node_version: $node_version, cwd: $cwd}'
)

TICKET_JSON=""
if [[ -n "${MCP_TICKET_ID:-}" ]]; then
  TICKET_JSON=$(jq -n \
    --arg id "${MCP_TICKET_ID}" \
    --arg source "${MCP_TICKET_SOURCE:-inline}" \
    --arg title "${MCP_TICKET_TITLE:-}" \
    --arg url "${MCP_TICKET_URL:-}" \
    --arg status "${MCP_TICKET_STATUS:-}" \
    '{id: $id, source: $source}
      + (if $title != "" then {title: $title} else {} end)
      + (if $url != "" then {url: $url} else {} end)
      + (if $status != "" then {status: $status} else {} end)'
  )
fi

PAYLOAD=$(jq -n \
  --arg protocol_version "2" \
  --argjson session "$SESSION_JSON" \
  --argjson invocation "$INVOCATION_JSON" \
  --argjson project "$PROJECT_JSON" \
  --argjson runtime "$RUNTIME_JSON" \
  '{
    protocol_version: $protocol_version,
    session: $session,
    invocation: $invocation,
    project: $project,
    runtime: $runtime
  }'
)

if [[ -n "$TICKET_JSON" ]]; then
  PAYLOAD=$(echo "$PAYLOAD" | jq --argjson ticket "$TICKET_JSON" '. + {ticket: $ticket}')
fi

if [[ -n "$USER_JSON" ]]; then
  PAYLOAD=$(echo "$PAYLOAD" | jq --argjson user "$USER_JSON" '. + {user: $user}')
fi

if [[ -n "${MCP_FLAGS_JSON:-}" ]]; then
  PAYLOAD=$(echo "$PAYLOAD" | jq --argjson flags "$MCP_FLAGS_JSON" '. + {flags: $flags}')
fi

echo "$PAYLOAD"
