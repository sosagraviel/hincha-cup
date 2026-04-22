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

# Auto-detect framework path from script's own location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"

# Validate framework path exists
if [ ! -d "$FRAMEWORK_PATH" ]; then
  echo "❌ Error: Framework path does not exist: $FRAMEWORK_PATH"
  echo ""
  echo "This script must be run from the framework's scripts/ directory."
  exit 1
fi

# Detect dogfooding mode: framework directory is a symlink pointing to "."
# When qubika-agentic-framework -> ., doing cd qubika-agentic-framework/.. goes to parent
# We need to detect this case and fix the paths

# Get the real physical path (resolving symlink)
FRAMEWORK_REAL_PATH="$(cd "$FRAMEWORK_PATH" && pwd -P)"

# If framework's real path equals project's logical path, we're in dogfooding mode
# This means qubika-agentic-framework is a symlink to . (self)
if [ "$FRAMEWORK_REAL_PATH" = "$(dirname "$FRAMEWORK_PATH")" ]; then
  # Dogfooding mode detected
  # PROJECT_PATH is the real path (same as framework's real path)
  # FRAMEWORK_PATH stays as the symlink path for proper file operations
  export PROJECT_PATH="$FRAMEWORK_REAL_PATH"
  export FRAMEWORK_PATH="$FRAMEWORK_PATH"
  cd "$FRAMEWORK_REAL_PATH/orchestration" && npm run sync-framework-resources -- "$@"
  exit $?
fi

# Normal mode: Navigate to orchestration module and run TypeScript script
cd "$FRAMEWORK_PATH/orchestration" && npm run sync-framework-resources -- "$@"
