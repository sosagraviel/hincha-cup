#!/usr/bin/env bash
# Full end-to-end initialize-project run against an integration fixture.
#
# Burns ~30-40K Haiku tokens and ~5-10 min wall-clock per fixture.
# Default behaviour prints the cost projection and requires --confirm.
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
FRAMEWORK_ROOT="$(cd "$ROOT_DIR/../../../.." && pwd)"
FIXTURE_DIR="$ROOT_DIR/projects/$FIXTURE_NAME"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "ERROR: fixture not found: $FIXTURE_DIR" >&2
  exit 65
fi

SYMLINK="$FIXTURE_DIR/qubika-agentic-framework"
if [ ! -L "$SYMLINK" ]; then
  echo "ERROR: missing symlink: $SYMLINK" >&2
  echo "recreate with: ln -s ../../../../.. \"$SYMLINK\"" >&2
  exit 67
fi

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

if [ "$KEEP_DIRTY" = "0" ]; then
  "$SCRIPT_DIR/clean-fixture.sh" "$FIXTURE_NAME"
fi

INIT_SCRIPT="$FRAMEWORK_ROOT/scripts/initialize-project.sh"
if [ ! -x "$INIT_SCRIPT" ]; then
  echo "ERROR: framework's initialize-project.sh not found / not executable: $INIT_SCRIPT" >&2
  exit 68
fi

export MODEL_TIER=fast
if [ -n "$KEEP_RUNS" ]; then
  export KEEP_RUNS
fi

# Fixtures live INSIDE the framework directory tree at
# `framework/orchestration/test/integration/initialize-project/projects/<fixture>`.
# Without this explicit override `resolve-paths.sh` would resolve the
# framework's parent (~60K+ unrelated files) and code-review-graph would
# scan the wrong tree.
export PROJECT_PATH="$FIXTURE_DIR"

cd "$FIXTURE_DIR"
"$INIT_SCRIPT"
