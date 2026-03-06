#!/bin/bash

# Claude Code Runtime Launcher
# Purpose: Start Claude Code runtime container for a specific project
# Usage: ./run-claude.sh /path/to/project

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}🚀 Claude Code Runtime Launcher${NC}"
echo ""

# Check if project path provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Project path required${NC}"
    echo ""
    echo "Usage: $0 /path/to/project"
    echo ""
    echo "Example:"
    echo "  $0 ~/projects/my-app"
    exit 1
fi

PROJECT_PATH="$1"

# Validate project path exists
if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}❌ Error: Project path does not exist: $PROJECT_PATH${NC}"
    exit 1
fi

# Convert to absolute path
PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"

echo -e "${GREEN}📂 Project:${NC} $PROJECT_PATH"

# Check if .env file exists
if [ ! -f "$DOCKER_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found${NC}"
    echo ""
    echo "Creating .env from .env.example..."
    cp "$DOCKER_DIR/.env.example" "$DOCKER_DIR/.env"
    echo ""
    echo -e "${YELLOW}Please edit $DOCKER_DIR/.env with your credentials before continuing${NC}"
    echo ""
    read -p "Press Enter when ready, or Ctrl+C to exit..."
fi

# Export PROJECT_PATH for docker-compose
export PROJECT_PATH

echo ""
echo -e "${GREEN}🔧 Building Claude runtime image...${NC}"
cd "$DOCKER_DIR"
docker-compose build

echo ""
echo -e "${GREEN}🐳 Starting Claude runtime container...${NC}"
docker-compose up -d

echo ""
echo -e "${GREEN}✅ Claude runtime is ready!${NC}"
echo ""
echo "Commands:"
echo "  • Enter container:  docker exec -it claude-runtime bash"
echo "  • View logs:        docker logs -f claude-runtime"
echo "  • Stop runtime:     docker-compose -f $DOCKER_DIR/docker-compose.yml down"
echo ""
echo "Inside container, run:"
echo "  • claude-code run                    # Start interactive session"
echo "  • /initialize-project                # Initialize project"
echo "  • /implement-ticket PROJ-123        # Implement a ticket"
echo ""
echo -e "${GREEN}Entering container...${NC}"
docker exec -it claude-runtime bash
