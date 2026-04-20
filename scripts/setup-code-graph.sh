#!/bin/bash
set -euo pipefail

PROJECT_PATH="${PROJECT_PATH:-$(pwd)}"
CODE_GRAPH_DB_PATH="${CODE_GRAPH_DB_PATH:-$PROJECT_PATH/.code-graph.db}"
DEFAULT_CODE_GRAPH_DB_PATH="$PROJECT_PATH/.code-review-graph/graph.db"
MIN_PYTHON_VERSION="3.10"
CODE_GRAPH_CMD=()

log_info() { echo "[code-graph] $1"; }
log_error() { echo "[code-graph] ERROR: $1" >&2; }

python_version() {
  "$1" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))'
}

find_python() {
  local candidates=(
    python3.13
    python3.12
    python3.11
    python3.10
    python3
    python
  )

  for candidate in "${candidates[@]}"; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi

    local version
    version="$(python_version "$candidate")"

    if "$candidate" - "$MIN_PYTHON_VERSION" <<'PY'
import sys
minimum = tuple(int(part) for part in sys.argv[1].split("."))
current = sys.version_info[:len(minimum)]
sys.exit(0 if current >= minimum else 1)
PY
    then
      log_info "Using Python $version ($candidate)"
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

ensure_pip() {
  local python_cmd="$1"

  if "$python_cmd" -m pip --version >/dev/null 2>&1; then
    return 0
  fi

  log_info "pip not found for $python_cmd; attempting ensurepip"
  "$python_cmd" -m ensurepip --upgrade >/dev/null
}

ensure_code_review_graph() {
  if command -v code-review-graph >/dev/null 2>&1; then
    log_info "code-review-graph found: $(code-review-graph --version 2>&1 | head -n 1)"
    CODE_GRAPH_CMD=(code-review-graph)
    return 0
  fi

  if command -v uvx >/dev/null 2>&1; then
    log_info "Using code-review-graph through uvx (no persistent install)"
    CODE_GRAPH_CMD=(uvx code-review-graph)
    return 0
  fi

  if command -v pipx >/dev/null 2>&1; then
    log_info "Installing code-review-graph with pipx"
    if pipx install code-review-graph; then
      export PATH="$HOME/.local/bin:$PATH"
      command -v code-review-graph >/dev/null 2>&1
      CODE_GRAPH_CMD=(code-review-graph)
      return 0
    fi
    log_info "pipx install failed; falling back to Python/pip"
  fi

  local python_cmd
  if ! python_cmd="$(find_python)"; then
    log_error "Python $MIN_PYTHON_VERSION+ is required to install code-review-graph"
    log_error "Install a newer Python, for example: brew install python@3.12"
    return 1
  fi

  if ! ensure_pip "$python_cmd"; then
    log_error "pip is required for $python_cmd to install code-review-graph"
    return 1
  fi

  log_info "Installing code-review-graph with $python_cmd -m pip"
  "$python_cmd" -m pip install --user --upgrade code-review-graph

  export PATH="$HOME/.local/bin:$PATH"
  if ! command -v code-review-graph >/dev/null 2>&1; then
    log_error "code-review-graph was installed but is not available on PATH"
    return 1
  fi

  CODE_GRAPH_CMD=(code-review-graph)
}

build_graph() {
  log_info "Building graph for $PROJECT_PATH"
  log_info "Native output: $DEFAULT_CODE_GRAPH_DB_PATH"
  log_info "Compatibility output: $CODE_GRAPH_DB_PATH"

  if "${CODE_GRAPH_CMD[@]}" build --repo "$PROJECT_PATH"; then
    copy_graph_db_if_needed
    return 0
  fi

  log_info "Retrying graph build from project directory"
  if (cd "$PROJECT_PATH" && "${CODE_GRAPH_CMD[@]}" build); then
    copy_graph_db_if_needed
    return 0
  fi

  return 1
}

copy_graph_db_if_needed() {
  if [ -f "$DEFAULT_CODE_GRAPH_DB_PATH" ] && [ "$DEFAULT_CODE_GRAPH_DB_PATH" != "$CODE_GRAPH_DB_PATH" ]; then
    cp "$DEFAULT_CODE_GRAPH_DB_PATH" "$CODE_GRAPH_DB_PATH"
  fi
}

main() {
  if [ ! -d "$PROJECT_PATH" ]; then
    log_error "Project path does not exist: $PROJECT_PATH"
    exit 1
  fi

  ensure_code_review_graph
  build_graph

  if [ ! -f "$CODE_GRAPH_DB_PATH" ]; then
    log_error "Expected graph database was not created: $CODE_GRAPH_DB_PATH"
    exit 1
  fi

  log_info "Code graph ready"
}

main "$@"
