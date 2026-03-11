#!/bin/bash

# Claude Implement Ticket
# Purpose: Run implement-ticket skill in Docker for a specific Jira ticket
# Usage: ./claude-implement.sh JIRA-KEY

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}🎫 Claude Implement Ticket${NC}"
echo ""

# Check if JIRA key provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: JIRA key required${NC}"
    echo ""
    echo "Usage: $0 JIRA-KEY"
    echo ""
    echo "Example:"
    echo "  $0 PROJ-123"
    exit 1
fi

JIRA_KEY="$1"

echo -e "${GREEN}🎫 Ticket:${NC} $JIRA_KEY"

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

# Validate required credentials
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
    echo -e "${RED}❌ Error: Missing required credentials:${NC}"
    for cred in "${MISSING_CREDS[@]}"; do
        echo "  - $cred"
    done
    echo ""
    echo "Please set these in $DOCKER_DIR/.env"
    exit 1
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

echo -e "${GREEN}📂 Project:${NC} $PROJECT_PATH"

# Check if Docker image exists
echo ""
echo -e "${GREEN}🔍 Checking Docker image...${NC}"
cd "$DOCKER_DIR"

if ! docker images | grep -q "claude-runtime"; then
    echo -e "${YELLOW}Image not found, building...${NC}"
    docker-compose build
fi

# Run implement-ticket skill in Docker
echo ""
echo -e "${GREEN}🚀 Running implement-ticket skill for $JIRA_KEY...${NC}"
echo ""
echo "This will:"
echo "  1. Fetch ticket from Jira"
echo "  2. Analyze requirements"
echo "  3. Create implementation plan"
echo "  4. Implement code"
echo "  5. Run tests"
echo "  6. Create pull request"
echo ""
echo -e "${YELLOW}⚠️  This may take 30-60 minutes depending on ticket complexity${NC}"
echo ""

docker-compose run --rm claude-runtime \
    claude --dangerously-skip-permissions /implement-ticket "$JIRA_KEY"
