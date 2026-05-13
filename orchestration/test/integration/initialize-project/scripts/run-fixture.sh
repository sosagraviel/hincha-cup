#!/usr/bin/env bash
# Plan v5 §1.4.d — full end-to-end initialize-project against a fixture.
#
# THE BIG HAMMER — only used in plan 2's final integration check (and
# rarely, deliberately, when a developer needs an end-to-end smoke). Burns
# ~30-40K Haiku tokens, ~5-10 min wall-clock per fixture.
#
# Default behaviour: prints the projected cost and requires --confirm to
# proceed. The confirm gate is mechanical — a developer who really wants to
# run it adds the flag; a developer who typed the command by mistake gets
# stopped.
#
# Usage:
#   scripts/run-fixture.sh <fixture-name> --confirm [--keep-dirty] [--keep-runs N]
#
# Examples:
#   run-fixture.sh mini-monorepo --confirm
#   run-fixture.sh mini-microservices --confirm --keep-runs 5

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage:
  run-fixture.sh <fixture-name> [--confirm] [--keep-dirty] [--keep-runs N]

WARNING: full pipeline burns ~30-40K Haiku tokens and ~5-10 min wall-clock.
         Use --confirm to actually run; without it, this prints the cost
         projection and exits.
EOF
}

if [ $# -lt 1 ]; then
  usage
  exit 64
fi

FIXTURE_NAME="$1"
shift

CONFIRM="0"
KEEP_DIRTY="0"
KEEP_RUNS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --confirm)    CONFIRM="1"; shift ;;
    --keep-dirty) KEEP_DIRTY="1"; shift ;;
    --keep-runs)  KEEP_RUNS="$2"; shift 2 ;;
    --help|-h)    usage; exit 0 ;;
    *)            echo "ERROR: unknown flag: $1" >&2; usage; exit 64 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# ROOT_DIR = …/orchestration/test/integration/initialize-project
# up 4 → framework repo root (containing the orchestration/ workspace)
FRAMEWORK_ROOT="$(cd "$ROOT_DIR/../../../.." && pwd)"
FIXTURE_DIR="$ROOT_DIR/projects/$FIXTURE_NAME"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "ERROR: fixture not found: $FIXTURE_DIR" >&2
  exit 65
fi

# Symlink sanity — same check as run-agent.sh.
SYMLINK="$FIXTURE_DIR/qubika-agentic-framework"
if [ ! -L "$SYMLINK" ]; then
  echo "ERROR: missing symlink: $SYMLINK" >&2
  echo "recreate with: ln -s ../../../../.. \"$SYMLINK\"" >&2
  exit 67
fi

# Read .fixture-meta.json to print the projection up front.
META_PATH="$FIXTURE_DIR/.fixture-meta.json"
if [ -f "$META_PATH" ]; then
  EXPECTED_FILES=$(grep -E '"expected_file_count_max"' "$META_PATH" | grep -oE '[0-9]+' | head -1 || echo "?")
  SERVICES=$(grep -E '"services_count"' "$META_PATH" | grep -oE '[0-9]+' | head -1 || echo "?")
else
  EXPECTED_FILES="?"
  SERVICES="?"
fi

cat <<EOF
================================================================
FULL INITIALIZE-PROJECT (haiku tier)
fixture:           $FIXTURE_NAME
fixture path:      $FIXTURE_DIR
expected files:    $EXPECTED_FILES
expected services: $SERVICES
projected cost:    ~30-40 K Haiku input + output tokens
projected time:    ~5-10 min wall-clock
debug bucket:      $FIXTURE_DIR/.claude-temp/initialize-project/debug/runs/latest
================================================================
EOF

if [ "$CONFIRM" != "1" ]; then
  cat >&2 <<'EOF'

(dry-run — no --confirm flag)

Add --confirm to actually run. Example:
  scripts/run-fixture.sh <fixture-name> --confirm
EOF
  exit 0
fi

# Clean unless --keep-dirty.
if [ "$KEEP_DIRTY" = "0" ]; then
  "$SCRIPT_DIR/clean-fixture.sh" "$FIXTURE_NAME"
fi

# Hand off to the framework's initialize-project script. That script
# exports MODEL_TIER from the env var, so we set it here.
INIT_SCRIPT="$FRAMEWORK_ROOT/scripts/initialize-project.sh"
if [ ! -x "$INIT_SCRIPT" ]; then
  echo "ERROR: framework's initialize-project.sh not found / not executable: $INIT_SCRIPT" >&2
  exit 68
fi

export MODEL_TIER=fast
if [ -n "$KEEP_RUNS" ]; then
  export KEEP_RUNS
fi

# Plan v5 §1 — explicit PROJECT_PATH override for fixtures.
# Fixtures live INSIDE the framework directory at
# `framework/orchestration/test/integration/initialize-project/projects/<fixture>`.
# `resolve-paths.sh` would otherwise return the framework's parent
# (`~/itIsHere/projects/`, 60K+ unrelated files) and code-review-graph
# would spend 2-5 minutes scanning the wrong tree before failing.
export PROJECT_PATH="$FIXTURE_DIR"

cd "$FIXTURE_DIR"
"$INIT_SCRIPT"
