#!/usr/bin/env bash
set -euo pipefail

event=$(cat)
out_dir="${CLAUDE_PROJECT_DIR:-$PWD}/.claude-temp/sessions"
mkdir -p "$out_dir"

started_at=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

if command -v jq >/dev/null 2>&1; then
  printf '%s' "$event" | jq --arg started_at "$started_at" \
    '{session_id, transcript_path, source, started_at: $started_at}' \
    > "$out_dir/session.json"
else
  printf '%s' "$event" > "$out_dir/session.json.raw"
fi

exit 0
