# Claude CLI Runtime Environment
# Purpose: Isolated environment for running Claude CLI with MCP dependencies
# Version: 1.0.0

FROM node:22-slim

LABEL maintainer="AI Team"
LABEL description="Claude CLI runtime with MCP servers and development tools"
LABEL version="1.0.0"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    git \
    make \
    curl \
    jq \
    postgresql-client \
    bash \
    openssh-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm@10.2.1

# Install Claude CLI
# Note: Use official claude package when available
RUN npm install -g claude || echo "Claude CLI installation - check package availability"

# Install MCP server dependencies
RUN npm install -g \
    @modelcontextprotocol/server-atlassian \
    @modelcontextprotocol/server-github \
    @modelcontextprotocol/server-google-sheets \
    @modelcontextprotocol/server-postgres \
    @modelcontextprotocol/server-playwright \
    @modelcontextprotocol/server-notion \
    @modelcontextprotocol/server-pencil

# Install Playwright browsers (for E2E testing MCP)
RUN npx playwright install --with-deps chromium

# Install common Python packages for MCPs
RUN pip3 install --no-cache-dir \
    requests \
    anthropic \
    psycopg2-binary \
    ruff \
    black \
    mypy \
    pytest \
    pytest-cov

# Create workspace directory
WORKDIR /workspace

# Create .claude directory for runtime files
RUN mkdir -p /root/.claude

# Set up git safe directory (for mounted volumes)
RUN git config --global --add safe.directory /workspace

# Configure Claude to skip permissions
ENV CLAUDE_SKIP_PERMISSIONS=1

# Default command: Claude with skip permissions flag
CMD ["claude", "--dangerously-skip-permissions"]
