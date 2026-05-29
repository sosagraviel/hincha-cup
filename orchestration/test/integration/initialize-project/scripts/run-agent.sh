#!/usr/bin/env bash
# Spawn a single agent in isolation against a fixture.
#
# This is the iteration-loop entry point. Single invocation runs:
#   1. clean-fixture.sh <fixture>                  (unless --keep-dirty)
#   2. stage-upstream.sh <fixture> <phase>         (when --stage <phase>)
#   3. Invoke run-single-agent CLI with --provider=claude --tier=fast
#   4. Print debug-bucket location + 5-line outcome summary.
#
# MODEL_TIER=fast is set unconditionally so every agent (including
# service-detail-extractor) resolves to haiku-latest.
#
# Usage:
#   scripts/run-agent.sh <fixture-name> <agent-name> \
#       [--stage <phase>] [--service-id <id>] [--keep-dirty] [--keep-runs <N>]
#
# Examples:
#   # Iterate on tech-stack analyzer in isolation:
#   run-agent.sh mini-monorepo tech-stack-dependencies-analyzer --stage phase0
#
#   # Iterate on service-detail-extractor with Phase 1 staged:
#   run-agent.sh mini-microservices service-detail-extractor \
#       --stage phase1 --service-id productcatalogservice
#
#   # Iterate on synthesizer with everything before Phase 3 staged:
#   run-agent.sh mini-serverless architect-synthesizer --stage phase2

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage:
  run-agent.sh <fixture-name> <agent-name>
               [--stage <phase>]
               [--service-id <id>]            (required when agent-name=service-detail-extractor)
               [--keep-dirty]                 (skip clean-fixture before run)
               [--keep-runs <N>]              (passed through to run-single-agent)
EOF
}

if [ $# -lt 2 ]; then
  usage
  exit 64
fi

FIXTURE_NAME="$1"
AGENT_NAME="$2"
shift 2

STAGE_PHASE=""
SERVICE_ID=""
KEEP_DIRTY="0"
KEEP_RUNS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --stage)         STAGE_PHASE="$2"; shift 2 ;;
    --service-id)    SERVICE_ID="$2"; shift 2 ;;
    --keep-dirty)    KEEP_DIRTY="1"; shift ;;
    --keep-runs)     KEEP_RUNS="$2"; shift 2 ;;
    --help|-h)       usage; exit 0 ;;
    *)               echo "ERROR: unknown flag: $1" >&2; usage; exit 64 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# ROOT_DIR = …/orchestration/test/integration/initialize-project
# up 4 → framework repo root (which contains the orchestration/ workspace)
FRAMEWORK_ROOT="$(cd "$ROOT_DIR/../../../.." && pwd)"
FIXTURE_DIR="$ROOT_DIR/projects/$FIXTURE_NAME"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "ERROR: fixture not found: $FIXTURE_DIR" >&2
  echo "available fixtures:" >&2
  ls -1 "$ROOT_DIR/projects" 2>/dev/null || echo "  (none yet)" >&2
  exit 65
fi

# Symlink sanity check — the framework's dogfooding code paths require
# <fixture>/qubika-agentic-framework to resolve to the framework root.
SYMLINK="$FIXTURE_DIR/qubika-agentic-framework"
if [ ! -L "$SYMLINK" ]; then
  echo "ERROR: missing symlink: $SYMLINK" >&2
  echo "recreate with:" >&2
  echo "  ln -s ../../../../.. \"$SYMLINK\"" >&2
  exit 67
fi

# Step 1 — wipe artefacts unless --keep-dirty.
if [ "$KEEP_DIRTY" = "0" ]; then
  "$SCRIPT_DIR/clean-fixture.sh" "$FIXTURE_NAME"
fi

# Step 2 — stage upstream.
if [ -n "$STAGE_PHASE" ]; then
  "$SCRIPT_DIR/stage-upstream.sh" "$FIXTURE_NAME" "$STAGE_PHASE"
fi

# Step 3 — invoke run-single-agent CLI via tsx.
TSX_BIN="$FRAMEWORK_ROOT/orchestration/node_modules/.bin/tsx"
RUN_SINGLE_AGENT_TS="$FRAMEWORK_ROOT/orchestration/src/cli/run-single-agent.ts"

if [ ! -x "$TSX_BIN" ]; then
  echo "ERROR: tsx not found at $TSX_BIN" >&2
  echo "run 'pnpm install' at the framework root first" >&2
  exit 68
fi
if [ ! -f "$RUN_SINGLE_AGENT_TS" ]; then
  echo "ERROR: run-single-agent.ts missing at $RUN_SINGLE_AGENT_TS" >&2
  exit 68
fi

export MODEL_TIER=fast

CLI_ARGS=(
  --project-path "$FIXTURE_DIR"
  --framework-path "$FRAMEWORK_ROOT"
  --agent-name "$AGENT_NAME"
)
if [ -n "$SERVICE_ID" ]; then
  CLI_ARGS+=(--service-id "$SERVICE_ID")
fi
if [ -n "$KEEP_RUNS" ]; then
  CLI_ARGS+=(--keep-runs "$KEEP_RUNS")
fi

echo "----------------------------------------------------------------"
echo "fixture:     $FIXTURE_NAME"
echo "agent:       $AGENT_NAME"
echo "tier:        fast (haiku-latest)"
echo "stage:       ${STAGE_PHASE:-(none)}"
echo "service-id:  ${SERVICE_ID:-(none)}"
echo "----------------------------------------------------------------"

# Step 3 — run and capture exit code.
set +e
"$TSX_BIN" "$RUN_SINGLE_AGENT_TS" "${CLI_ARGS[@]}"
RC=$?
set -e

# Step 4 — outcome summary.
DEBUG_BUCKET="$FIXTURE_DIR/.claude-temp/initialize-project/debug/runs/latest"
echo "----------------------------------------------------------------"
echo "exit code:   $RC"
if [ -d "$DEBUG_BUCKET" ]; then
  echo "debug:       $DEBUG_BUCKET"
else
  echo "debug:       (none created — agent did not reach the spawn step)"
fi
echo "----------------------------------------------------------------"

exit $RC
