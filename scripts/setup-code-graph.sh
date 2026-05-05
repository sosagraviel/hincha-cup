#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/bootstrap-uv.sh
source "$SCRIPT_DIR/lib/bootstrap-uv.sh"
# shellcheck source=lib/resolve-paths.sh
source "$SCRIPT_DIR/lib/resolve-paths.sh"

# PROJECT_PATH is locally scoped — never exported. Single source of truth is the
# helper, which detects dogfooding via the qubika-agentic-framework -> . self-symlink.
PROJECT_PATH="$(project_path)"
FRAMEWORK_PATH="$(framework_path)"
# Single canonical graph DB path. The legacy `.code-graph.db` snapshot at the
# project root has been retired (see retired Phase 2 of init-refactor): no
# `copy_graph_db_if_needed` step exists anymore, and any existing legacy file
# is harmless — it's never read or written by this codepath.
CODE_GRAPH_DB_PATH="$PROJECT_PATH/.code-review-graph/graph.db"
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
  if [ "${FORCE_REINSTALL:-0}" = "1" ]; then
    log_info "FORCE_REINSTALL=1 — skipping on-PATH check, re-resolving from scratch"
  elif command -v code-review-graph >/dev/null 2>&1; then
    log_info "code-review-graph found: $(code-review-graph --version 2>&1 | head -n 1)"
    CODE_GRAPH_CMD=(code-review-graph)
    return 0
  fi

  if command -v uvx >/dev/null 2>&1; then
    log_info "Using code-review-graph through uvx (no persistent install)"
    CODE_GRAPH_CMD=(uvx code-review-graph)
    return 0
  fi

  if command -v uv >/dev/null 2>&1; then
    log_info "Installing code-review-graph with uv tool install"
    if uv tool install code-review-graph; then
      export PATH="$HOME/.local/bin:$PATH"
      if command -v code-review-graph >/dev/null 2>&1; then
        CODE_GRAPH_CMD=(code-review-graph)
        return 0
      fi
    fi
    log_info "uv tool install failed; trying uvx"
    CODE_GRAPH_CMD=(uvx code-review-graph)
    return 0
  fi

  # Attempt to bootstrap uv from scratch when nothing else is available.
  if bootstrap_uv_if_needed && command -v uvx >/dev/null 2>&1; then
    log_info "Using code-review-graph through bootstrapped uvx"
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
  log_info "Output: $CODE_GRAPH_DB_PATH"

  if "${CODE_GRAPH_CMD[@]}" build --repo "$PROJECT_PATH"; then
    return 0
  fi

  log_info "Retrying graph build from project directory"
  if (cd "$PROJECT_PATH" && "${CODE_GRAPH_CMD[@]}" build); then
    return 0
  fi

  return 1
}

update_graph() {
  log_info "Incrementally updating graph for $PROJECT_PATH"
  log_info "Output: $CODE_GRAPH_DB_PATH"

  if "${CODE_GRAPH_CMD[@]}" update --repo "$PROJECT_PATH"; then
    return 0
  fi

  log_info "Retrying graph update from project directory"
  if (cd "$PROJECT_PATH" && "${CODE_GRAPH_CMD[@]}" update); then
    return 0
  fi

  return 1
}

# Reads `Built at commit:` from `code-review-graph status --repo <project>` and
# echoes the SHA on stdout. Empty stdout when the tool fails or the field is
# absent. Suppresses stderr to keep the log tidy on edge cases.
graph_built_at_commit() {
  local out
  if ! out="$("${CODE_GRAPH_CMD[@]}" status --repo "$PROJECT_PATH" 2>/dev/null)"; then
    echo ""
    return
  fi
  echo "$out" | awk -F': ' '/^Built at commit:/ {print $2; exit}' | tr -d '[:space:]'
}

# Returns the current `git rev-parse HEAD` for the project, or empty when not
# in a git repo / git unavailable. Suppresses stderr.
git_head_commit() {
  (cd "$PROJECT_PATH" && git rev-parse HEAD 2>/dev/null) || echo ""
}

# Decides which work tier the standalone bash entry point needs to do, mirroring
# the TS-side `decideGraphTier` in code-graph.service.ts. Single source-of-truth
# discipline: setup-code-graph.sh standalone runs follow the same fast-path tree
# as Phase 0 of initialize-project and the new ensure-context.sh preflight.
#
# Echoes one of:
#   tier1   graph fresh (DB exists + sqlite-valid + status sha == HEAD)  → no work
#   tier2   graph stale (DB exists + sqlite-valid + status sha != HEAD)  → update
#   tier3   graph missing or invalid                                      → full build
decide_graph_tier() {
  if [ "${FORCE_REBUILD:-0}" = "1" ]; then
    echo "tier3"
    return
  fi
  if [ ! -f "$CODE_GRAPH_DB_PATH" ]; then
    echo "tier3"
    return
  fi
  # Cheap SQLite header check (avoid spawning `code-review-graph` for malformed DBs).
  local size
  size="$(wc -c < "$CODE_GRAPH_DB_PATH" 2>/dev/null | tr -d '[:space:]')"
  if [ "${size:-0}" -lt 100 ]; then
    echo "tier3"
    return
  fi
  # SQLite header: 16 bytes "SQLite format 3\0". Bash command-substitution
  # mangles embedded NUL bytes, so compare just the first 15 printable bytes —
  # any non-SQLite file with that exact prefix is a bigger problem upstream.
  local magic_prefix
  magic_prefix="$(head -c 15 "$CODE_GRAPH_DB_PATH" 2>/dev/null)"
  if [ "$magic_prefix" != "SQLite format 3" ]; then
    echo "tier3"
    return
  fi
  local built_at head
  built_at="$(graph_built_at_commit)"
  head="$(git_head_commit)"
  if [ -z "$built_at" ] || [ -z "$head" ]; then
    # Without provable freshness, conservatively rebuild.
    echo "tier3"
    return
  fi
  # built_at may be a short SHA; compare prefix to be safe.
  local prefix_len=${#built_at}
  if [ "${head:0:$prefix_len}" = "$built_at" ]; then
    echo "tier1"
  else
    echo "tier2"
  fi
}

write_local_launcher() {
  mkdir -p "$PROJECT_PATH/.code-review-graph"

  local launcher="$PROJECT_PATH/.code-review-graph/code-review-graph"
  local tmp
  tmp="$(mktemp)"
  {
    echo '#!/bin/bash'
    echo 'set -euo pipefail'
    if [ "${#CODE_GRAPH_CMD[@]}" -eq 1 ] && [ "${CODE_GRAPH_CMD[0]}" = "code-review-graph" ]; then
      local command_path
      command_path="$(command -v code-review-graph)"
      printf 'exec %q "$@"\n' "$command_path"
    else
      echo 'exec uvx code-review-graph "$@"'
    fi
  } > "$tmp"

  # Compare-then-write: skip the syscall when content matches existing launcher.
  if [ -f "$launcher" ] && cmp -s "$launcher" "$tmp"; then
    rm -f "$tmp"
    chmod +x "$launcher"
    return 0
  fi
  mv "$tmp" "$launcher"
  chmod +x "$launcher"
}

write_launcher_json() {
  mkdir -p "$PROJECT_PATH/.code-review-graph"

  local target="$PROJECT_PATH/.code-review-graph/launcher.json"
  local command_name args_json tool_version

  if [ "${#CODE_GRAPH_CMD[@]}" -eq 1 ] && [ "${CODE_GRAPH_CMD[0]}" = "code-review-graph" ]; then
    command_name="code-review-graph"
    args_json="[]"
  else
    command_name="${CODE_GRAPH_CMD[0]}"
    local remaining=("${CODE_GRAPH_CMD[@]:1}")
    args_json="["
    local first=true
    for arg in "${remaining[@]}"; do
      if [ "$first" = true ]; then
        args_json+="\"$arg\""
        first=false
      else
        args_json+=",\"$arg\""
      fi
    done
    args_json+="]"
  fi

  tool_version="unknown"
  if "${CODE_GRAPH_CMD[@]}" --version >/dev/null 2>&1; then
    tool_version="$("${CODE_GRAPH_CMD[@]}" --version 2>&1 | head -n 1)"
  fi

  # Idempotency: preserve resolved_at when nothing else changed (so the
  # committed launcher.json doesn't churn every bootstrap run).
  local resolved_at=""
  if [ -f "$target" ]; then
    local existing_command existing_args existing_tool_version existing_resolved_at
    existing_command="$(awk -F'"' '/"command":/ {print $4; exit}' "$target" 2>/dev/null || echo "")"
    existing_tool_version="$(awk -F'"' '/"tool_version":/ {print $4; exit}' "$target" 2>/dev/null || echo "")"
    existing_resolved_at="$(awk -F'"' '/"resolved_at":/ {print $4; exit}' "$target" 2>/dev/null || echo "")"
    # args is harder to extract via awk reliably; compare the raw JSON line.
    existing_args="$(awk '/"args":/ {sub(/^[^\[]*/, ""); sub(/,?[[:space:]]*$/, ""); print; exit}' "$target" 2>/dev/null || echo "")"
    if [ "$existing_command" = "$command_name" ] \
       && [ "$existing_tool_version" = "$tool_version" ] \
       && [ "$existing_args" = "$args_json" ] \
       && [ -n "$existing_resolved_at" ]; then
      resolved_at="$existing_resolved_at"
    fi
  fi
  if [ -z "$resolved_at" ]; then
    resolved_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"
  fi

  local tmp
  tmp="$(mktemp)"
  cat > "$tmp" << EOF
{
  "version": "1",
  "command": "$command_name",
  "args": $args_json,
  "resolved_at": "$resolved_at",
  "tool_version": "$tool_version"
}
EOF

  if [ -f "$target" ] && cmp -s "$target" "$tmp"; then
    rm -f "$tmp"
    return 0
  fi
  mv "$tmp" "$target"
}

ensure_ignore_file() {
  # `code-review-graph build --repo <project>` reads `.code-review-graphignore`
  # from the project root, not from the framework. Seed it idempotently so
  # fresh targets get sane excludes (.claude/, node_modules, etc.).
  local target="$PROJECT_PATH/.code-review-graphignore"
  local source="$FRAMEWORK_PATH/templates/code-review-graphignore"
  if [ ! -f "$target" ] && [ -f "$source" ]; then
    log_info "Seeding $target from template"
    cp "$source" "$target"
  fi
}

# Override the upstream tool's `.code-review-graph/.gitignore: *` with a
# framework-managed allowlist. The graph DB stays per-developer (binary +
# absolute paths inside SQLite); only the lightweight metadata that lets every
# teammate rebuild quickly is committed. Compare-then-write — idempotent.
ensure_managed_gitignore() {
  local source="$FRAMEWORK_PATH/templates/code-review-graph-gitignore"
  local target="$PROJECT_PATH/.code-review-graph/.gitignore"
  [ -f "$source" ] || return 0
  mkdir -p "$PROJECT_PATH/.code-review-graph"
  if [ -f "$target" ] && cmp -s "$source" "$target"; then
    return 0
  fi
  cp "$source" "$target"
}

# One-time migration: untrack `.code-review-graph/extraction-manifest.json`
# from any project that committed it before 2026-05-05 (when the file was
# allowlisted by the framework template). The upstream `code-review-graph`
# tool stamps a `created_at` timestamp on every build, so a tracked copy
# churns on every preflight regardless of whether the graph content changed.
#
# Idempotent — `git ls-files --error-unmatch` returns non-zero (silently
# swallowed by the `if`) when the file isn't tracked, and `git rm --cached`
# only runs when it IS tracked. Running this on every preflight is safe.
#
# Stack-agnostic: the file is part of the upstream tool's output, not
# project- or language-specific.
migrate_untrack_extraction_manifest() {
  local target_rel=".code-review-graph/extraction-manifest.json"
  # Only attempt the migration when the project directory is a git
  # repository — non-git checkouts skip silently.
  if ! git -C "$PROJECT_PATH" rev-parse --git-dir >/dev/null 2>&1; then
    return 0
  fi
  if git -C "$PROJECT_PATH" ls-files --error-unmatch "$target_rel" >/dev/null 2>&1; then
    git -C "$PROJECT_PATH" rm --cached --quiet "$target_rel" 2>/dev/null || true
    log_info "Untracked $target_rel (now per-build only — see docs/CODE_GRAPH.md)"
  fi
}

main() {
  if [ ! -d "$PROJECT_PATH" ]; then
    log_error "Project path does not exist: $PROJECT_PATH"
    exit 1
  fi

  ensure_ignore_file
  # ensure_code_review_graph short-circuits in <50ms when `code-review-graph`
  # is already on PATH; skips uvx/install probing entirely on that hot path.
  ensure_code_review_graph

  # State-first: pick the cheapest work that gets us to a fresh graph.
  #   tier1 → no rebuild work; just refresh launcher metadata.
  #   tier2 → incremental update (~1s on gira).
  #   tier3 → full rebuild (~4s on gira) or first-time build.
  local tier
  tier="$(decide_graph_tier)"

  case "$tier" in
    tier1)
      log_info "Graph fresh (already at HEAD); skipping rebuild"
      ;;
    tier2)
      if ! update_graph; then
        log_info "Incremental update failed; falling back to full build"
        build_graph
      fi
      ;;
    tier3)
      build_graph
      ;;
    *)
      log_error "decide_graph_tier returned unexpected value: $tier"
      exit 1
      ;;
  esac

  # Launcher metadata is rewritten only when content differs (idempotent
  # writers above). Cheap on Tier 1.
  write_local_launcher
  write_launcher_json
  # Override the tool's auto-emitted `*` gitignore with our allowlist (the
  # tool re-emits `*` on every build, so we re-sync after every tier 2/3 run).
  ensure_managed_gitignore
  # One-time migration for projects bootstrapped before 2026-05-05 — drops
  # `.code-review-graph/extraction-manifest.json` from the git index when
  # it was previously committed. Idempotent: no-op when the file isn't
  # tracked. See migrate_untrack_extraction_manifest above.
  migrate_untrack_extraction_manifest

  if [ ! -f "$CODE_GRAPH_DB_PATH" ]; then
    log_error "Expected graph database was not created: $CODE_GRAPH_DB_PATH"
    exit 1
  fi

  case "$tier" in
    tier1) log_info "Code graph ready (no work needed)" ;;
    tier2) log_info "Code graph ready (incremental update applied)" ;;
    tier3) log_info "Code graph ready (full build complete)" ;;
  esac
}

main "$@"
