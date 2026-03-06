#!/bin/bash

# Claude Agent Interactive Shell
# Purpose: Run Claude CLI in Docker with interactive shell
# Usage: ./claude-agent.sh

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}🤖 Claude Agent - Interactive Shell${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$DOCKER_DIR/.env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo ""
    echo "Please create .env file from .env.example:"
    echo "  cd $DOCKER_DIR"
    echo "  cp .env.example .env"
    echo "  # Edit .env with your credentials"
    exit 1
fi

# Load environment variables
set -a
source "$DOCKER_DIR/.env"
set +a

# Validate required MCP credentials
echo -e "${GREEN}🔐 Validating MCP credentials...${NC}"

MISSING_CREDS=()

if [ -z "$CLAUDE_API_KEY" ]; then
    MISSING_CREDS+=("CLAUDE_API_KEY")
fi

if [ -z "$ATLASSIAN_API_TOKEN" ]; then
    MISSING_CREDS+=("ATLASSIAN_API_TOKEN")
fi

if [ -z "$ATLASSIAN_USER_EMAIL" ]; then
    MISSING_CREDS+=("ATLASSIAN_USER_EMAIL")
fi

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    MISSING_CREDS+=("GITHUB_PERSONAL_ACCESS_TOKEN")
fi

if [ ${#MISSING_CREDS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: Missing MCP credentials:${NC}"
    for cred in "${MISSING_CREDS[@]}"; do
        echo "  - $cred"
    done
    echo ""
    echo "Some MCP features may not work."
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Validate PROJECT_PATH
if [ -z "$PROJECT_PATH" ]; then
    echo -e "${RED}❌ Error: PROJECT_PATH not set in .env${NC}"
    exit 1
fi

if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}❌ Error: PROJECT_PATH does not exist: $PROJECT_PATH${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Credentials validated${NC}"
echo ""
echo -e "${GREEN}📂 Project:${NC} $PROJECT_PATH"

# Check if Docker image exists, build if not
echo ""
echo -e "${GREEN}🔍 Checking Docker image...${NC}"
cd "$DOCKER_DIR"

if ! docker images | grep -q "claude-runtime"; then
    echo -e "${YELLOW}Image not found, building...${NC}"
    docker-compose build
else
    echo -e "${GREEN}✅ Image found${NC}"
fi

# Run Claude in Docker with interactive shell
echo ""
echo -e "${GREEN}🚀 Starting Claude agent container...${NC}"
echo ""

docker-compose run --rm claude-runtime bash
