# 070 Infrastructure Skills

**Category**: Infrastructure and DevOps

**Purpose**: Skills for container orchestration, deployment, CI/CD, and infrastructure management.

## Skills in This Category

- **developing-with-docker**: Docker patterns and best practices for containerized development
- **triage-incident**: AI-powered incident triage — queries Datadog, AWS, and Confluence via MCP, greps the codebase for evidence, and produces a root cause report with a copy-pasteable runbook

## When to Use

These skills are automatically copied when:
- Docker or Docker Compose is detected in the project
- CI/CD configuration files are present
- Infrastructure-as-code is used

## Detection Patterns

- `Dockerfile` exists
- `docker-compose.yml` exists
- `.github/workflows/` directory exists
- `Makefile` with docker commands

## Related Skills

- **080-cloud-platforms**: Cloud-specific infrastructure (AWS, GCP, Azure)
- **020-development-workflow**: Development workflow integration
