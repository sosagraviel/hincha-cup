#!/bin/bash
# ============================================================================
# ENSURE-CONTEXT — deterministic preflight for /create-sdd-ticket and /implement-ticket
# ============================================================================
#
# Single bash entry point that both skills call as their literal first phase.
# Idempotent. Auto-installs every dependency it needs. Production-ready for
# 6000+ devs: no manual config, no env vars, no "make sure X is installed."
#
# Usage:
#   bash $FRAMEWORK_PATH/scripts/ensure-context.sh \
#     [--artifacts-dir <path>] \
#     [--force-graph] [--force-wiki] [--skip-wiki] [--quiet]
#
# What it does (in order):
#   1. Auto-install code-review-graph if missing (existing setup-code-graph.sh
#      fallback chain: uv → uvx → uv tool install → bootstrap_uv → pipx → pip).
#   2. Build / incrementally update / no-op the graph based on the
#      state-first tier check in setup-code-graph.sh::decide_graph_tier.
#   3. Override .code-review-graph/.gitignore with the framework allowlist.
#   4. Re-emit .mcp.json (Claude) or .codex/config.toml (Codex) with the
#      machine's local absolute paths.
#   5. Compare wiki frontmatter (.state.json::graph_sha + last_indexed_commit)
#      against the freshly-built graph. When stale: invoke refresh-wiki.sh.
#   6. Write a JSON success marker at <artifacts-dir>/.preflight-ok carrying
#      git_head + graph_sha + wiki state, so subsequent skill phases can
#      verify the preflight ran for THIS run (not a stale earlier one).
#
# Exit code:
#   0  – preflight succeeded; the marker is written.
#   non-zero – something the preflight cannot fix on its own (e.g. wiki
#              never initialised; no Python on host AND offline). The
#              skill body STOPs and surfaces our stderr to the user.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/resolve-paths.sh
source "$SCRIPT_DIR/lib/resolve-paths.sh"

PROJECT_PATH="$(project_path)"
FRAMEWORK_PATH="$(framework_path)"

# ---------- option parsing ----------
ARTIFACTS_DIR=""
FORCE_GRAPH=0
FORCE_WIKI=0
SKIP_WIKI=0
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --artifacts-dir)
      ARTIFACTS_DIR="$2"; shift 2 ;;
    --artifacts-dir=*)
      ARTIFACTS_DIR="${1#*=}"; shift ;;
    --force-graph)
      FORCE_GRAPH=1; shift ;;
    --force-wiki)
      FORCE_WIKI=1; shift ;;
    --skip-wiki)
      SKIP_WIKI=1; shift ;;
    --quiet)
      QUIET=1; shift ;;
    --help|-h)
      sed -n '2,32p' "$0"; exit 0 ;;
    *)
      echo "[ensure-context] ERROR: unknown argument: $1" >&2
      exit 2 ;;
  esac
done

# Default artifacts dir: <project>/.claude-temp/preflight (or .codex-temp/).
# Skills override this with their per-ticket artefacts dir.
if [ -z "$ARTIFACTS_DIR" ]; then
  if [ -d "$PROJECT_PATH/.codex" ] && [ ! -d "$PROJECT_PATH/.claude" ]; then
    ARTIFACTS_DIR="$PROJECT_PATH/.codex-temp/preflight"
  else
    ARTIFACTS_DIR="$PROJECT_PATH/.claude-temp/preflight"
  fi
fi

# ---------- logging ----------
log_info() {
  if [ "$QUIET" -eq 0 ]; then
    echo "[ensure-context] $1"
  fi
}
log_warn() { echo "[ensure-context] WARN: $1" >&2; }
log_error() { echo "[ensure-context] ERROR: $1" >&2; }

# ---------- helpers ----------

# Detect active provider: claude (default) or codex. Mirrors the framework's
# `getActiveProvider()` heuristic — .codex/ exists and .claude/ does not.
detect_provider() {
  if [ -d "$PROJECT_PATH/.codex" ] && [ ! -d "$PROJECT_PATH/.claude" ]; then
    echo "codex"
  else
    echo "claude"
  fi
}

# Compute sha256 of a file. Tries `sha256sum` (Linux) then `shasum -a 256` (macOS).
# Echoes the hex digest, or empty on failure.
file_sha256() {
  local f="$1"
  if [ ! -f "$f" ]; then
    echo ""
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  else
    echo ""
  fi
}

# Read a JSON string field from a file. POSIX-awk parser — works on both
# macOS BSD awk and GNU awk; no jq dependency. Returns empty when absent.
#
# Caveats: only top-level scalar string fields. The wiki state file is flat,
# which is exactly the surface we need.
read_json_string() {
  local file="$1"
  local field="$2"
  [ -f "$file" ] || { echo ""; return; }
  awk -v f="$field" '
    {
      key = "\"" f "\""
      idx = index($0, key)
      if (idx <= 0) next
      rest = substr($0, idx + length(key))
      colon = index(rest, ":")
      if (colon <= 0) next
      tail = substr(rest, colon + 1)
      # Trim leading whitespace.
      while (length(tail) > 0 && (substr(tail, 1, 1) == " " || substr(tail, 1, 1) == "\t")) {
        tail = substr(tail, 2)
      }
      # Must be a quoted string.
      if (substr(tail, 1, 1) != "\"") next
      tail = substr(tail, 2)
      quote = index(tail, "\"")
      if (quote <= 0) next
      print substr(tail, 1, quote - 1)
      exit
    }
  ' "$file" 2>/dev/null
}

git_head() {
  (cd "$PROJECT_PATH" && git rev-parse HEAD 2>/dev/null) || echo ""
}

# ---------- mcp config writers (provider-aware, idempotent) ----------

# Writes/refreshes `.mcp.json` (Claude) with the local code_graph MCP server
# block. Compare-then-write: skips the syscall when content matches.
write_claude_mcp_config() {
  local target="$PROJECT_PATH/.mcp.json"
  local launcher="$FRAMEWORK_PATH/scripts/code-review-graph-mcp.sh"

  # Build the expected JSON. Preserve other top-level keys when an existing
  # config carries them — we only own the `mcpServers.code_graph` slot.
  if command -v node >/dev/null 2>&1; then
    # Use node for safe JSON merge; bash heredoc would clobber sibling servers.
    local expected
    expected="$(node -e '
      const fs = require("fs");
      const path = process.argv[1];
      const launcher = process.argv[2];
      const project = process.argv[3];
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(path, "utf-8")); } catch {}
      if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) cfg = {};
      cfg.mcpServers = cfg.mcpServers || {};
      cfg.mcpServers.code_graph = {
        command: "bash",
        args: [launcher, "serve", "--repo", project],
      };
      process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
    ' "$target" "$launcher" "$PROJECT_PATH")" || {
      log_warn "node failed while emitting .mcp.json — falling back to bash heredoc"
      expected=""
    }
    if [ -n "$expected" ]; then
      if [ -f "$target" ] && [ "$(cat "$target")" = "$expected" ]; then
        return 0
      fi
      printf '%s' "$expected" > "$target"
      return 0
    fi
  fi

  # Bash fallback: write a minimal valid config when no existing file or when
  # node is unavailable. This loses sibling mcpServers; the framework's TS
  # writer is the canonical path for full preservation, but at preflight time
  # we'd rather have a valid local file than nothing.
  if [ ! -f "$target" ]; then
    cat > "$target" << EOF
{
  "mcpServers": {
    "code_graph": {
      "command": "bash",
      "args": [
        "$launcher",
        "serve",
        "--repo",
        "$PROJECT_PATH"
      ]
    }
  }
}
EOF
  fi
}

# Writes/refreshes `.codex/config.toml` (Codex) with the local code_graph MCP
# server block. Compare-then-write semantics: only touches the
# `[mcp_servers.code_graph]` block, preserves siblings.
#
# Strategy: python3 is the primary path (always present on macOS + most
# Linux distros — the framework already requires it for refresh-wiki.sh).
# If python3 is somehow missing, we degrade to a bash-only writer that
# REPLACES the whole file. This is safe because Codex projects normally
# only have the code_graph block here.
write_codex_mcp_config() {
  local target="$PROJECT_PATH/.codex/config.toml"
  local launcher="$FRAMEWORK_PATH/scripts/code-review-graph-mcp.sh"
  mkdir -p "$PROJECT_PATH/.codex"

  if command -v python3 >/dev/null 2>&1; then
    if python3 - "$target" "$launcher" "$PROJECT_PATH" <<'PY'
import sys, re, os

target, launcher, project = sys.argv[1:4]
existing = ""
if os.path.exists(target):
    with open(target, "r", encoding="utf-8") as f:
        existing = f.read()

block = (
    "[mcp_servers.code_graph]\n"
    "command = \"bash\"\n"
    "args = [\n"
    f"    \"{launcher}\",\n"
    "    \"serve\",\n"
    "    \"--repo\",\n"
    f"    \"{project}\",\n"
    "]\n"
)

# Strip any existing [mcp_servers.code_graph] section + its body, up to the
# next section header or EOF.
pattern = re.compile(r'^\[mcp_servers\.code_graph\][^\[]*', re.MULTILINE)
without = pattern.sub('', existing).rstrip()
new_content = (without + "\n\n" + block) if without else block

if new_content != existing:
    with open(target, "w", encoding="utf-8") as f:
        f.write(new_content)
PY
    then
      return 0
    fi
    log_warn "python3 codex-toml writer failed — falling back to bash heredoc"
  fi

  _write_codex_bash_fallback "$target" "$launcher" "$PROJECT_PATH"
}

_write_codex_bash_fallback() {
  local target="$1" launcher="$2" project="$3"
  local expected
  expected=$(cat << EOF
[mcp_servers.code_graph]
command = "bash"
args = [
    "$launcher",
    "serve",
    "--repo",
    "$project",
]
EOF
)
  if [ -f "$target" ] && [ "$(cat "$target")" = "$expected" ]; then
    return 0
  fi
  printf '%s\n' "$expected" > "$target"
}

# ---------- main flow ----------

PROVIDER="$(detect_provider)"
log_info "provider: $PROVIDER"
log_info "project:  $PROJECT_PATH"

# 1+2. Auto-install + state-first graph build. setup-code-graph.sh handles
#      Tier 0 (skip install when on PATH), Tier 1 (no work on hot path),
#      Tier 2 (incremental update), Tier 3 (full build), and the
#      `.code-review-graph/.gitignore` allowlist.
if [ "$FORCE_GRAPH" -eq 1 ]; then
  export FORCE_REBUILD=1
fi
log_info "ensuring code graph is fresh..."
bash "$FRAMEWORK_PATH/scripts/setup-code-graph.sh" || {
  log_error "code graph build failed; see output above"
  mkdir -p "$ARTIFACTS_DIR"
  cat > "$ARTIFACTS_DIR/.preflight-failed" << EOF
{
  "reason": "graph_build_failed",
  "git_head": "$(git_head)",
  "ran_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
  exit 3
}

# 3. .gitignore allowlist is ensured by setup-code-graph.sh; nothing to do here.

# 4. Local MCP config — re-emitted with the machine's absolute paths.
log_info "syncing MCP config (.mcp.json or .codex/config.toml)..."
case "$PROVIDER" in
  codex) write_codex_mcp_config ;;
  claude|*) write_claude_mcp_config ;;
esac

# 5. Wiki freshness — graph_sha vs current; last_indexed_commit vs HEAD.
WIKI_REFRESHED=0
WIKI_DIR="$PROJECT_PATH/docs/llm-wiki"
WIKI_INDEX="$WIKI_DIR/wiki/index.md"
WIKI_STATE="$WIKI_DIR/.state.json"
GRAPH_DB="$PROJECT_PATH/.code-review-graph/graph.db"
GRAPH_SHA="$(file_sha256 "$GRAPH_DB")"
HEAD_COMMIT="$(git_head)"

if [ "$SKIP_WIKI" -eq 1 ]; then
  log_info "wiki: skipped (--skip-wiki)"
elif [ ! -f "$WIKI_INDEX" ]; then
  log_warn "wiki not initialized (missing $WIKI_INDEX) — run /initialize-project once for this project"
  mkdir -p "$ARTIFACTS_DIR"
  cat > "$ARTIFACTS_DIR/.preflight-failed" << EOF
{
  "reason": "wiki_not_initialized",
  "git_head": "$HEAD_COMMIT",
  "ran_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
  exit 4
else
  WIKI_GRAPH_SHA="$(read_json_string "$WIKI_STATE" graph_sha)"
  WIKI_INDEXED_COMMIT="$(read_json_string "$WIKI_STATE" last_indexed_commit)"
  if [ "$FORCE_WIKI" -eq 1 ] \
     || [ -z "$WIKI_GRAPH_SHA" ] \
     || [ "$WIKI_GRAPH_SHA" != "$GRAPH_SHA" ] \
     || [ -z "$WIKI_INDEXED_COMMIT" ] \
     || [ "$WIKI_INDEXED_COMMIT" != "$HEAD_COMMIT" ]; then
    log_info "wiki: stale (graph_sha mismatch or HEAD moved); refreshing..."
    REFRESH_ARGS=()
    if [ -n "$WIKI_INDEXED_COMMIT" ] && [ "$WIKI_INDEXED_COMMIT" != "$HEAD_COMMIT" ]; then
      REFRESH_ARGS+=("--since" "$WIKI_INDEXED_COMMIT")
    fi
    if [ "$FORCE_WIKI" -eq 1 ]; then
      REFRESH_ARGS+=("--force")
    fi
    REFRESH_ARGS+=("--provider" "$PROVIDER")
    if bash "$FRAMEWORK_PATH/scripts/refresh-wiki.sh" "${REFRESH_ARGS[@]}"; then
      WIKI_REFRESHED=1
      log_info "wiki: refreshed"
    else
      log_warn "wiki refresh failed; planner/implementer will work with stale wiki frontmatter — fix with /wiki-refresh"
    fi
  else
    log_info "wiki: fresh (graph_sha matches; HEAD == $HEAD_COMMIT)"
  fi
fi

# 6. Success marker — subsequent phases assert this exists and matches HEAD.
mkdir -p "$ARTIFACTS_DIR"
NEW_WIKI_GRAPH_SHA="$(read_json_string "$WIKI_STATE" graph_sha)"
NEW_WIKI_INDEXED_COMMIT="$(read_json_string "$WIKI_STATE" last_indexed_commit)"

cat > "$ARTIFACTS_DIR/.preflight-ok" << EOF
{
  "git_head": "$HEAD_COMMIT",
  "graph_sha": "$GRAPH_SHA",
  "wiki_last_indexed_commit": "$NEW_WIKI_INDEXED_COMMIT",
  "wiki_graph_sha": "$NEW_WIKI_GRAPH_SHA",
  "wiki_refreshed": $WIKI_REFRESHED,
  "provider": "$PROVIDER",
  "preflight_ran_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "preflight_version": 1
}
EOF

log_info "preflight: ok (marker at $ARTIFACTS_DIR/.preflight-ok)"
