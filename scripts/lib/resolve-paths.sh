#!/usr/bin/env bash
# Resolve the framework + project paths deterministically.
#
# This file lives in two places at runtime:
#
#   1. The framework checkout itself:
#         <framework>/scripts/lib/resolve-paths.sh
#      The framework is conventionally at <project>/qubika-agentic-framework/, except
#      in dogfooding mode where it sits at the project root via a self-symlink
#      `qubika-agentic-framework -> .`.
#
#   2. A *shim copy* shipped into a project by Phase 5 of initialize-project:
#         <project>/.claude/scripts/lib/resolve-paths.sh
#         <project>/.codex/scripts/lib/resolve-paths.sh
#      The shim exists so engineers can invoke skill preflight without having
#      to export $FRAMEWORK_PATH in their shell — it locates the real framework
#      checkout for them and hands off.
#
# `framework_path()` distinguishes the two modes by sniffing for framework
# markers (scripts/setup-code-graph.sh + orchestration/package.json) at the
# self-resolved location. When the markers are present we are the framework's
# own copy and return the self-resolved path. When they are absent we are the
# shim copy and walk a small fallback chain to find the real checkout.
#
# Usage (in another script):
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/resolve-paths.sh"
#   FRAMEWORK_PATH="$(framework_path)"
#   PROJECT_PATH="$(project_path)"
#
# Variables produced from these helpers are LOCALLY SCOPED — never `export` them.
# The single allowed env injection is FRAMEWORK_PATH (and FRAMEWORK_PROJECT_PATH)
# into spawned Claude/Codex CLI subprocesses, performed in the TypeScript
# orchestration's agent-factory, marked explicitly there.

__resolve_paths_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

__has_framework_markers() {
  local candidate="$1"
  [ -n "$candidate" ] \
    && [ -d "$candidate" ] \
    && [ -f "$candidate/scripts/setup-code-graph.sh" ] \
    && [ -f "$candidate/orchestration/package.json" ]
}

__shim_project_root() {
  # The shim lives at <project>/<config-dir>/scripts/lib/resolve-paths.sh.
  # Walk up until we find a directory whose name is `.claude` or `.codex`; its
  # parent is the project root. Falls back to two levels above lib/ if the
  # shim is ever relocated.
  local dir="$__resolve_paths_lib_dir"
  while [ "$dir" != "/" ] && [ -n "$dir" ]; do
    local base
    base="$(basename "$dir")"
    if [ "$base" = ".claude" ] || [ "$base" = ".codex" ]; then
      ( cd "$dir/.." && pwd )
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  ( cd "$__resolve_paths_lib_dir/../../.." && pwd )
}

framework_path() {
  local self_resolved
  self_resolved="$( cd "$__resolve_paths_lib_dir/../.." && pwd )"

  if __has_framework_markers "$self_resolved"; then
    printf '%s' "$self_resolved"
    return 0
  fi

  if [ -n "${FRAMEWORK_PATH:-}" ] && __has_framework_markers "$FRAMEWORK_PATH"; then
    ( cd "$FRAMEWORK_PATH" && pwd )
    return 0
  fi

  local project_root
  project_root="$(__shim_project_root)"

  local sibling="$project_root/qubika-agentic-framework"
  if __has_framework_markers "$sibling"; then
    ( cd "$sibling" && pwd )
    return 0
  fi

  local parent_sibling="$project_root/../qubika-agentic-framework"
  if __has_framework_markers "$parent_sibling"; then
    ( cd "$parent_sibling" && pwd )
    return 0
  fi

  echo "[resolve-paths] ERROR: could not locate the qubika-agentic-framework checkout." >&2
  echo "[resolve-paths] Searched: \$FRAMEWORK_PATH, $sibling, $parent_sibling" >&2
  echo "[resolve-paths] Remediation: clone the framework at $project_root/qubika-agentic-framework or export FRAMEWORK_PATH=/abs/path/to/framework" >&2
  return 1
}

project_path() {
  local fw fw_real fw_parent

  if [ -n "${PROJECT_PATH:-}" ] && [ -d "$PROJECT_PATH" ]; then
    ( cd "$PROJECT_PATH" && pwd )
    return
  fi

  local self_resolved
  self_resolved="$( cd "$__resolve_paths_lib_dir/../.." && pwd )"

  if ! __has_framework_markers "$self_resolved"; then
    __shim_project_root
    return
  fi

  fw="$self_resolved"
  fw_real="$(cd "$fw" && pwd -P)"
  fw_parent="$(cd "$fw/.." && pwd)"

  if [ "$fw_real" = "$fw_parent" ]; then
    printf '%s' "$fw_real"
  else
    printf '%s' "$fw_parent"
  fi
}
