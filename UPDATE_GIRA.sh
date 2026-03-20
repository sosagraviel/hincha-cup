#!/bin/bash
# Script to update the gira project with the latest framework
# IMPORTANT: Excludes node_modules to prevent corruption issues

set -e

FRAMEWORK_SOURCE="/Users/ignaciobarreto/itIsHere/projects/ai-agentic-framework"
GIRA_TARGET="/Users/ignaciobarreto/itIsHere/projects/gira/ai-agentic-framework"

echo "🔄 Updating gira framework from main repository..."
echo ""
echo "Source: $FRAMEWORK_SOURCE"
echo "Target: $GIRA_TARGET"
echo ""

# Check source exists
if [ ! -d "$FRAMEWORK_SOURCE" ]; then
    echo "❌ Error: Source framework not found at $FRAMEWORK_SOURCE"
    exit 1
fi

# Backup existing framework in gira
if [ -d "$GIRA_TARGET" ]; then
    BACKUP_NAME="ai-agentic-framework.backup.$(date +%Y%m%d-%H%M%S)"
    echo "📦 Backing up existing framework to: $BACKUP_NAME"
    mv "$GIRA_TARGET" "/Users/ignaciobarreto/itIsHere/projects/gira/$BACKUP_NAME"
    echo ""
fi

# Copy updated framework (EXCLUDING node_modules, dist, .claude-temp)
echo "📋 Copying updated framework (excluding node_modules, dist, .claude-temp)..."
rsync -av \
    --exclude='node_modules' \
    --exclude='package-lock.json' \
    --exclude='dist' \
    --exclude='.claude-temp' \
    --exclude='orchestration-checkpoints.db' \
    "$FRAMEWORK_SOURCE/" "$GIRA_TARGET/"

echo ""
echo "✅ Framework updated successfully!"
echo ""
echo "Next steps:"
echo "  cd /Users/ignaciobarreto/itIsHere/projects/gira"
echo "  ./ai-agentic-framework/scripts/initialize-project.sh"
echo ""
echo "The script will automatically install fresh dependencies on first run."
