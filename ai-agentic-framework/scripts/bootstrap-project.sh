#!/usr/bin/env bash
# ==============================================================================
# Bootstrap Project with AI Framework
# ==============================================================================
# Creates minimal .claude/ directory so /initialize-project can be run
# from within the project directory.
#
# Must be run from ai-agentic-framework directory. Auto-detects project root (parent dir).
#
# Usage:
#   cd /path/to/project/ai-agentic-framework
#   ./scripts/bootstrap-project.sh
# ==============================================================================

set -euo pipefail

AI_STORE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$(cd "$AI_STORE_DIR/.." && pwd)"

# Validate we're in ai-agentic-framework
if [[ ! -d "$AI_STORE_DIR/skills" ]] || [[ ! -d "$AI_STORE_DIR/commands" ]]; then
    echo "❌ Error: This script must be run from ai-agentic-framework directory"
    echo "   Current directory doesn't look like ai-agentic-framework (missing skills/ or commands/)"
    exit 1
fi

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}AI Framework Project Bootstrap${NC}"
echo ""
echo "  AI Store:  $AI_STORE_DIR"
echo "  Project:   $PROJECT_PATH"
echo ""

# Validate project path
if [[ ! -d "$PROJECT_PATH" ]]; then
    echo -e "${YELLOW}Error: Project directory does not exist: $PROJECT_PATH${NC}"
    exit 1
fi

# Check if already initialized
if [[ -d "$PROJECT_PATH/.claude" ]]; then
    echo -e "${YELLOW}Warning: .claude/ directory already exists${NC}"
    echo ""
    read -p "Overwrite? (y/N): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled"
        exit 0
    fi

    # Backup existing
    BACKUP_DIR="$PROJECT_PATH/.claude.backup.$(date +%Y%m%d_%H%M%S)"
    echo "  Creating backup: $BACKUP_DIR"
    mv "$PROJECT_PATH/.claude" "$BACKUP_DIR"
fi

# Create minimal .claude/ structure
echo -e "${BLUE}Creating .claude/ directory...${NC}"
mkdir -p "$PROJECT_PATH/.claude/skills"
mkdir -p "$PROJECT_PATH/.claude/commands"

# Copy initialize-project skill
echo "  Copying initialize-project skill..."
cp -r "$AI_STORE_DIR/skills/010-foundation/initialize-project" \
      "$PROJECT_PATH/.claude/skills/"

# Copy initialize-project command
echo "  Copying initialize-project command..."
cp "$AI_STORE_DIR/commands/initialize-project.md" \
   "$PROJECT_PATH/.claude/commands/"

# Create .gitignore for .claude/
cat > "$PROJECT_PATH/.claude/.gitignore" <<'EOF'
# AI Framework - Ignore generated files
*.tmp
*.log
.cache/
EOF

echo ""
echo -e "${GREEN}✅ Bootstrap Complete!${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Navigate to project:"
echo "     cd $PROJECT_PATH"
echo ""
echo "  2. Start Claude Code:"
echo "     claude code"
echo ""
echo "  3. Initialize project:"
echo "     /initialize-project"
echo ""
echo "This will complete the setup by:"
echo "  • Detecting your tech stack"
echo "  • Copying stack-specific skills"
echo "  • Generating customized agents"
echo "  • Configuring MCP integrations"
echo ""
