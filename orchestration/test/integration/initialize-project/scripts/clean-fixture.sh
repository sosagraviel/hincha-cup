#!/usr/bin/env bash
# Wipe a fixture's run artefacts in place.
#
# Removes:
#   - <fixture>/.claude-temp/
#   - <fixture>/.codex-temp/                 (Codex provider counterpart)
#   - <fixture>/.claude/                     (generated CLAUDE.md + skills)
#   - <fixture>/.codex/                      (generated AGENTS.md + skills)
#   - <fixture>/docs/llm-wiki/               (generated wiki)
#   - <fixture>/.code-review-graph/          (graph DB cache)
#
# Preserves:
#   - The fixture source tree itself.
#   - The qubika-agentic-framework symlink.
#   - .git, .gitignore.
#   - .fixture-meta.json (declarative — never wiped).
#
# Idempotent. Re-running is a no-op.
#
# Usage:
#   scripts/clean-fixture.sh <fixture-name>
#
# Examples:
#   scripts/clean-fixture.sh mini-monorepo
#   scripts/clean-fixture.sh mini-serverless

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "ERROR: expected exactly one argument, got $#" >&2
  echo "usage: $0 <fixture-name>" >&2
  exit 64
fi

FIXTURE_NAME="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="$(cd "$SCRIPT_DIR/../projects" && pwd)"
FIXTURE_DIR="$PROJECTS_DIR/$FIXTURE_NAME"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "ERROR: fixture not found: $FIXTURE_DIR" >&2
  echo "available fixtures:" >&2
  ls -1 "$PROJECTS_DIR" >&2 || true
  exit 65
fi

# Symlink protection: never traverse INTO the symlinked framework. We
# only delete known-runtime paths below; the symlink itself stays.
TARGETS=(
  ".claude-temp"
  ".codex-temp"
  ".claude"
  ".codex"
  "docs/llm-wiki"
  ".code-review-graph"
)

REMOVED=0
for rel in "${TARGETS[@]}"; do
  abs="$FIXTURE_DIR/$rel"
  if [ -e "$abs" ] || [ -L "$abs" ]; then
    rm -rf -- "$abs"
    echo "removed: $rel"
    REMOVED=$((REMOVED + 1))
  fi
done

if [ "$REMOVED" -eq 0 ]; then
  echo "fixture '$FIXTURE_NAME' already clean (no run artefacts present)"
fi
