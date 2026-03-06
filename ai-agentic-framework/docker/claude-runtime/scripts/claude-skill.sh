#!/bin/bash

# Claude Run Skill
# Purpose: Run a specific Claude skill in Docker
# Usage: ./claude-skill.sh <skill-name> [args...]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}⚙️  Claude Run Skill${NC}"
echo ""

# Check if skill name provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Skill name required${NC}"
    echo ""
    echo "Usage: $0 <skill-name> [args...]"
    echo ""
    echo "Examples:"
    echo "  $0 create-sdd-ticket \"Add user profile page\""
    echo "  $0 initialize-project"
    echo "  $0 code-quality-check"
    echo "  $0 security-review"
    echo ""
    echo "Common skills:"
    echo "  - initialize-project      Initialize Claude config for a project"
    echo "  - create-sdd-ticket       Create a Specification-Driven Development ticket"
    echo "  - implement-ticket        Implement a Jira ticket (use claude-implement.sh)"
    echo "  - code-quality-check      Run code quality checks"
    echo "  - security-review         Run security review"
    echo "  - update-project-context  Re-analyze project architecture"
    exit 1
fi

SKILL_NAME="$1"
shift  # Remove skill name from arguments
SKILL_ARGS=("$@")

echo -e "${GREEN}⚙️  Skill:${NC} $SKILL_NAME"
if [ ${#SKILL_ARGS[@]} -gt 0 ]; then
    echo -e "${GREEN}📋 Args:${NC} ${SKILL_ARGS[*]}"
fi

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

# Run skill in Docker
echo ""
echo -e "${GREEN}🚀 Running /$SKILL_NAME skill...${NC}"
echo ""

# Build command with arguments
CMD="claude --dangerously-skip-permissions /$SKILL_NAME"
for arg in "${SKILL_ARGS[@]}"; do
    CMD="$CMD \"$arg\""
done

docker-compose run --rm claude-runtime bash -c "$CMD"
