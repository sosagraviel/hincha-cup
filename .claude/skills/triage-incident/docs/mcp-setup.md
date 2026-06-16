# MCP Setup for /triage-incident

All MCPs are optional. The skill degrades gracefully — any unavailable MCP is skipped and noted in the report. For richest analysis configure all three.

> Run `claude mcp list` to check which servers are already connected before setting up.

---

## Datadog MCP (Phase 2g — monitors, incidents, logs, APM)

Official Datadog MCP — remote hosted, no local install needed.

**Add with API key auth (recommended):**
```bash
claude mcp add --transport http datadog-mcp \
  "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp?toolsets=all" \
  -H "DD-API-KEY: your-api-key" \
  -H "DD-APPLICATION-KEY: your-app-key"
```

Get keys from:
- API key: `https://app.datadoghq.com/organization-settings/api-keys`
- Application key: `https://app.datadoghq.com/organization-settings/application-keys`

**Add with OAuth (browser login on first use):**
```bash
claude mcp add --transport http datadog-mcp \
  "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp?toolsets=all"
```

**Scope options** — append to either command:
- _(none)_ → local only, writes to `.claude/settings.local.json`
- `--scope project` → shared with team via `.mcp.json`
- `--scope user` → global across all projects via `~/.claude/settings.json`

**Regional endpoints:**
| Site | Endpoint |
|------|----------|
| `app.datadoghq.com` (US1) | `https://mcp.datadoghq.com/api/unstable/mcp-server/mcp` |
| `us3.datadoghq.com` (US3) | `https://mcp.us3.datadoghq.com/api/unstable/mcp-server/mcp` |
| `us5.datadoghq.com` (US5) | `https://mcp.us5.datadoghq.com/api/unstable/mcp-server/mcp` |
| `app.datadoghq.eu` (EU1) | `https://mcp.datadoghq.eu/api/unstable/mcp-server/mcp` |
| `ap1.datadoghq.com` (AP1) | `https://mcp.ap1.datadoghq.com/api/unstable/mcp-server/mcp` |

**Verify:** `claude mcp list` → `datadog-mcp: ✓ Connected`

> **Rate limits:** 50 req/10s · 5 000 tool calls/day · 50 000/month

---

## AWS MCP (Phases 2a–2e — CloudWatch, ECS/EKS, RDS, CloudTrail)

**Step 1 — Install uv:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Step 2 — Add AWS MCP servers:**
```bash
claude mcp add \
  -e AWS_PROFILE=your-profile-name \
  -e AWS_REGION=us-east-1 \
  -e FASTMCP_LOG_LEVEL=ERROR \
  awslabs.core-mcp-server -- uvx awslabs.core-mcp-server@latest

claude mcp add \
  -e AWS_PROFILE=your-profile-name \
  -e AWS_REGION=us-east-1 \
  -e FASTMCP_LOG_LEVEL=ERROR \
  awslabs.cloudwatch-logs-mcp-server -- uvx awslabs.cloudwatch-logs-mcp-server@latest
```

Replace `your-profile-name` (`default` if using default credentials) and `us-east-1` with your region.

For team sharing add `--scope project`; for global use add `--scope user`.

**Step 3 — Verify AWS credentials:**
```bash
aws sts get-caller-identity --profile your-profile-name
```
If it fails: run `aws configure` or `aws sso login --profile your-profile-name`.

**Step 4 — Restart Claude Code** (MCP servers load at startup).

**Verify:** `claude mcp list` → `awslabs.core-mcp-server: ✓ Connected`

---

## Confluence MCP (Phase 2f — runbooks, past incidents, architecture docs)

> Already have `mcp__claude_ai_Atlassian__*` tools in `/mcp`? Phase 2f uses those automatically — skip this section.

**Step 1 — Get Atlassian API token:**
1. Go to `https://id.atlassian.com/manage-profile/security/api-tokens`
2. Click **Create API token** → copy the token

**Step 2 — Add Confluence MCP:**
```bash
claude mcp add \
  -e ATLASSIAN_SITE_NAME=your-company \
  -e ATLASSIAN_USER_EMAIL=you@company.com \
  -e ATLASSIAN_API_TOKEN=your-api-token \
  confluence -- npx -y @aashari/mcp-server-atlassian-confluence
```

Replace `your-company` with your Atlassian subdomain (e.g. `acme` for `acme.atlassian.net`).

**Step 3 — Restart Claude Code.**

**Verify:** `claude mcp list` → `confluence: ✓ Connected`

---

## Degraded mode — what runs without MCP

| MCP missing | Phases skipped | Impact |
|-------------|---------------|--------|
| Datadog | 2g | No monitor/incident/APM data. AWS fills gap if configured. |
| AWS | 2a–2e | No CloudWatch/ECS/RDS data. Root cause from codebase only. Confidence LOW–MEDIUM. |
| Confluence | 2f | No historical runbooks or past incident context. |
| All missing | 2a–2g | Full report from codebase + incident description. Confidence LOW–MEDIUM. |
