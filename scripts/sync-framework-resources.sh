#!/usr/bin/env bash
# Framework Resource Sync Wrapper Script
# Migrated to use orchestration TypeScript module

# ============================================================================
# sync-framework-resources.sh
# ============================================================================
#
# Idempotent script to sync framework skills and agents to a project.
# Can be run multiple times safely - only updates what changed.
#
# Features:
# - Hash-based change detection for skills and agents
# - User modification detection and preservation
# - Framework version detection and upgrade handling
# - New language/framework detection from config changes
# - Timestamped backups before replacements
#
# Setup:
#   The framework must be cloned at your project root:
#
#   cd /path/to/your/project
#   git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework
#
# Usage:
#   ./qubika-agentic-framework/scripts/sync-framework-resources.sh [--provider claude|codex]
#
# If --provider is omitted, the script auto-detects from the existing
# config dir in the project (`.claude/` or `.codex/`). Pass --provider
# explicitly when both dirs exist or when neither exists yet.
#
# ============================================================================

# Resolve paths via the canonical helper. PROJECT_PATH and FRAMEWORK_PATH are NOT
# exported — the orchestration TypeScript layer uses paths.service for both, which
# derives them from import.meta.url (single source of truth).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/resolve-paths.sh
source "$SCRIPT_DIR/lib/resolve-paths.sh"
FRAMEWORK_PATH="$(framework_path)"
PROJECT_PATH="$(project_path)"

# Validate framework path exists
if [ ! -d "$FRAMEWORK_PATH" ]; then
  echo "❌ Error: Framework path does not exist: $FRAMEWORK_PATH"
  echo ""
  echo "This script must be run from the framework's scripts/ directory."
  exit 1
fi

# Seed `.code-review-graphignore` idempotently. setup-code-graph.sh does the
# same; we duplicate the check here so a sync-only run (no graph rebuild)
# still produces a portable target.
ignore_target="$PROJECT_PATH/.code-review-graphignore"
ignore_source="$FRAMEWORK_PATH/templates/code-review-graphignore"
if [ ! -f "$ignore_target" ] && [ -f "$ignore_source" ]; then
  cp "$ignore_source" "$ignore_target"
fi

# Run from the framework's orchestration directory. We use the framework's physical
# path (via `pwd -P`) so dogfooding's self-symlink doesn't confuse `cd`.
cd "$(cd "$FRAMEWORK_PATH" && pwd -P)/orchestration" && npm run sync-framework-resources -- "$@"
