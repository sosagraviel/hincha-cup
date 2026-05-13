#!/usr/bin/env bash
# Plan v5 §1.4.b — copy pre-recorded upstream outputs into a fixture so
# a downstream agent can run in isolation without spending tokens on its
# upstream dependencies.
#
# Phases recognised (cumulative — phase1 implies phase0):
#   phase0    project-inspection.json + graph-foundation artefacts
#   phase1    + phase1-outputs/01..04 analyzer JSONs
#   phase1_5  + service-details/_index.json + per-service slices
#   phase2    + phase2-consolidation.json + composer-views/*.input.json
#   phase3    + synthesis-raw.md + architectural-narrative.md
#
# Source: orchestration/test/integration/initialize-project/expected-outputs/<fixture>/
# Target: <fixture>/.claude-temp/initialize-project/
#
# Usage:
#   scripts/stage-upstream.sh <fixture-name> <up-to-phase>
#
# Examples:
#   stage-upstream.sh mini-monorepo phase0
#   stage-upstream.sh mini-monorepo phase1_5
#   stage-upstream.sh mini-serverless phase2

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "ERROR: expected 2 arguments, got $#" >&2
  echo "usage: $0 <fixture-name> <phase0|phase1|phase1_5|phase2|phase3>" >&2
  exit 64
fi

FIXTURE_NAME="$1"
UP_TO_PHASE="$2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE_DIR="$ROOT_DIR/projects/$FIXTURE_NAME"
EXPECTED_DIR="$ROOT_DIR/expected-outputs/$FIXTURE_NAME"
TEMP_DIR="$FIXTURE_DIR/.claude-temp/initialize-project"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "ERROR: fixture not found: $FIXTURE_DIR" >&2
  exit 65
fi
if [ ! -d "$EXPECTED_DIR" ]; then
  echo "ERROR: no expected-outputs recorded for fixture '$FIXTURE_NAME'" >&2
  echo "expected: $EXPECTED_DIR" >&2
  echo "produce them by running the full pipeline against the fixture with" >&2
  echo "  MODEL_TIER=standard then copying the result into expected-outputs/." >&2
  exit 66
fi

# Validate phase argument.
case "$UP_TO_PHASE" in
  phase0|phase1|phase1_5|phase2|phase3) ;;
  *)
    echo "ERROR: unknown phase '$UP_TO_PHASE'" >&2
    echo "expected one of: phase0 phase1 phase1_5 phase2 phase3" >&2
    exit 64
    ;;
esac

mkdir -p "$TEMP_DIR"

stage_file() {
  local rel="$1"
  local src="$EXPECTED_DIR/$rel"
  local dst="$TEMP_DIR/$rel"
  if [ ! -e "$src" ]; then
    echo "WARN: expected-output missing (skipping): $rel" >&2
    return 0
  fi
  mkdir -p "$(dirname "$dst")"
  if [ -d "$src" ]; then
    cp -R -- "$src/." "$dst/"
  else
    cp -- "$src" "$dst"
  fi
  echo "staged: $rel"
}

# Phase 0 — always staged when requested.
stage_file "project-inspection.json"
stage_file "graph-prefetch.json"
stage_file "stack-profile.json"

case "$UP_TO_PHASE" in
  phase0) exit 0 ;;
esac

# Phase 1 — analyzer outputs.
stage_file "phase1-outputs/01-structure-architecture.json"
stage_file "phase1-outputs/02-tech-stack-dependencies.json"
stage_file "phase1-outputs/03-code-patterns-testing.json"
stage_file "phase1-outputs/04-data-flows-integrations.json"

case "$UP_TO_PHASE" in
  phase1) exit 0 ;;
esac

# Phase 1.5 — per-service slices.
stage_file "service-details/_index.json"
# Per-service slice files are staged as a directory copy so any number of
# services round-trip without enumeration.
if [ -d "$EXPECTED_DIR/service-details" ]; then
  for slice in "$EXPECTED_DIR/service-details"/*.json; do
    [ -f "$slice" ] || continue
    name="$(basename "$slice")"
    [ "$name" = "_index.json" ] && continue
    stage_file "service-details/$name"
  done
fi
stage_file "phase1_5.metrics.json"

case "$UP_TO_PHASE" in
  phase1_5) exit 0 ;;
esac

# Phase 2 — consolidation + composer views.
stage_file "phase2-consolidation.json"
stage_file "composer-views/code-conventions.input.json"
stage_file "composer-views/multi-file-workflows.input.json"
stage_file "composer-views/testing-conventions.input.json"
stage_file "composer-views/architecture-narrative.input.json"
stage_file "composer-views/_bundle.json"

case "$UP_TO_PHASE" in
  phase2) exit 0 ;;
esac

# Phase 3 — synthesis raw + narrative.
stage_file "synthesis-raw.md"
stage_file "architectural-narrative.md"
