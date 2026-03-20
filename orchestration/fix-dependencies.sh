#!/bin/bash
# Quick fix script for corrupted node_modules

set -e

echo "🔧 Fixing corrupted dependencies..."
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

echo "📂 Working directory: $SCRIPT_DIR"
echo ""

# Remove corrupted files
if [ -d "node_modules" ]; then
    echo "🗑️  Removing corrupted node_modules..."
    rm -rf node_modules
fi

if [ -f "package-lock.json" ]; then
    echo "🗑️  Removing package-lock.json..."
    rm -f package-lock.json
fi

echo ""
echo "📦 Installing dependencies (this may take a minute)..."
npm install

echo ""
echo "✅ Dependencies fixed successfully!"
echo ""
echo "You can now run:"
echo "  npm run initialize -- --project-path /path/to/project"
echo "  OR"
echo "  cd /path/to/project && ./ai-agentic-framework/scripts/initialize-project.sh"
