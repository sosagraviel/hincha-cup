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
#   ./qubika-agentic-framework/scripts/sync-framework-resources.sh
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

# Navigate to orchestration module and run TypeScript script
cd "$FRAMEWORK_PATH/orchestration" && npm run sync-framework-resources
