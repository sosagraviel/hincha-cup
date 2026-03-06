#!/bin/bash

# Claude Code Runtime Stopper
# Purpose: Stop and remove Claude Code runtime container
# Usage: ./stop-claude.sh [--volumes]

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}🛑 Stopping Claude Code Runtime${NC}"
echo ""

cd "$DOCKER_DIR"

# Check if --volumes flag provided
if [ "$1" = "--volumes" ]; then
    echo -e "${YELLOW}⚠️  Removing volumes (cache will be deleted)${NC}"
    docker-compose down -v
else
    echo "Stopping containers (volumes preserved)..."
    docker-compose down
fi

echo ""
echo -e "${GREEN}✅ Claude runtime stopped${NC}"
echo ""
echo "To restart: ./run-claude.sh /path/to/project"
