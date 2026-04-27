#!/usr/bin/env bash
# Resolve the framework + project paths deterministically from this lib's own
# location. Single source of truth for bash scripts under scripts/.
#
# The framework is always laid out as <framework>/scripts/lib/resolve-paths.sh.
# The framework is, in turn, always at <project>/qubika-agentic-framework/, except
# in dogfooding mode where it sits at the project root via a self-symlink
# `qubika-agentic-framework -> .`.
#
# Usage (in another script under scripts/):
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/resolve-paths.sh"
#   FRAMEWORK_PATH="$(framework_path)"
#   PROJECT_PATH="$(project_path)"
#
# Variables produced from these helpers are LOCALLY SCOPED — never `export` them.
# The single allowed env injection is FRAMEWORK_PATH (and FRAMEWORK_PROJECT_PATH)
# into spawned Claude/Codex CLI subprocesses, performed in the TypeScript
# orchestration's agent-factory, marked explicitly there.
#
# Dogfooding detection: when the framework directory's physical path (via `pwd -P`)
# equals its logical parent directory, the framework was invoked through the
# self-symlink and the framework IS the project. project_path() returns that
# physical path. In normal mode it returns the parent of the framework directory.

# Resolve this lib file's own directory once at source time. We cd into it (rather
# than its parent) to get the canonical absolute path, even when sourced via a
# relative path like "./scripts/lib/resolve-paths.sh".
__resolve_paths_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

framework_path() {
  # The lib lives at <framework>/scripts/lib/resolve-paths.sh.
  # Grandparent of the lib dir = <framework>.
  ( cd "$__resolve_paths_lib_dir/../.." && pwd )
}

project_path() {
  local fw fw_real fw_parent
  fw="$(framework_path)"
  fw_real="$(cd "$fw" && pwd -P)"
  fw_parent="$(cd "$fw/.." && pwd)"

  # Dogfooding: framework's physical path equals its logical parent → the
  # `qubika-agentic-framework -> .` self-symlink is in effect.
  if [ "$fw_real" = "$fw_parent" ]; then
    printf '%s' "$fw_real"
  else
    printf '%s' "$fw_parent"
  fi
}
