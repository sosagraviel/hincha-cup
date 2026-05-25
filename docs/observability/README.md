# Langfuse observability

Optional, zero-config-by-default. If the env vars below are not set, QAF behaves identically to a never-enabled install — no SDK is imported, no warnings are emitted.

---

## Configuration scope: global vs project

Before following the steps below, decide where you want to configure the hook:

| | Global | Project-scoped |
|---|---|---|
| **Config file** | `~/.claude/settings.json` | `<project>/.claude/settings.json` |
| **Hook location** | `~/.claude/hooks/langfuse_hook.py` | `<project>/.claude/hooks/langfuse_hook.py` |
| **Active for** | All Claude Code sessions on your machine | Only when Claude Code is opened from that project |
| **Use when** | You want tracing everywhere | Different projects use different Langfuse projects or regions |

**This guide uses the global paths throughout.** If you prefer project-scoped setup, replace every `~/.claude/` with `<project>/.claude/` as you follow the steps — everything else is identical.

> **Note** — regardless of which scope you choose, hook state files (`langfuse_state.json`, `langfuse_hook.log`) are always written to `~/.claude/state/`.

---

## What gets traced

The Claude Code hook captures every QAF workflow turn as a hierarchical Langfuse trace:

```
Claude Code - /implement-ticket
└── implement-ticket  (root span)
    ├── phase:phase-0-preflight-validation:in_progress
    │   ├── [LLM turn + tool calls]
    │   └── phase:phase-0-preflight-validation:completed
    ├── phase:phase-2-planning:in_progress
    │   ├── skill:analyze-requirements:start / :end
    │   ├── subagent:planner:start / :end
    │   ├── [LLM turn]
    │   └── phase:phase-2-planning:completed
    └── …
```

Each phase span groups everything that ran inside it: subagents, skill invocations, and the full LLM conversation (prompts, tool calls, responses).

> **Scope note** — The hook traces the Claude Code layer (skills, subagents, prompts).
> The orchestration-level module (`orchestration/src/observability/langfuse.ts`) exists but is not wired to a CLI entry point yet.

---

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin) running
- Ports **3000, 3030, 5432, 8123, 9090, 6379** free on localhost
- Claude Code installed and `~/.claude/` directory present

---

## Step 1 — Run Langfuse locally

```bash
git clone https://github.com/langfuse/langfuse.git ~/langfuse
cd ~/langfuse
docker compose up -d
docker compose ps   # all containers should be healthy
```

The Langfuse UI is at **http://localhost:3000**.

Reference: https://langfuse.com/self-hosting/docker-compose

---

## Step 2 — Create a project and copy keys

1. Open http://localhost:3000 and sign up (any email/password, local only).
2. Create a new **Project** (e.g. `qaf-dev`).
3. Go to **Settings → API Keys** → **Create new API key**.
4. Copy both keys:
   - **Public key** — starts with `pk-lf-`
   - **Secret key** — starts with `sk-lf-`

---

## Step 3 — Install the Python SDK

The hook script imports `langfuse` at startup, so the library must be importable from whichever Python executable Claude Code finds on `PATH` when it fires the hook — this is the Python environment that is **active when you launch Claude Code**, not necessarily a globally installed one.

**Global install (simplest):**

```bash
pip install langfuse
```

**Isolated env with `uv` (recommended if you prefer not to install globally):**

```bash
uv venv ~/.claude/hooks/.venv
uv pip install --python ~/.claude/hooks/.venv langfuse
```

Then point the hook command at the venv's interpreter (adjust Step 6 accordingly):

```
~/.claude/hooks/.venv/bin/python ~/.claude/hooks/langfuse_hook.py
```

**Activate an existing venv before starting Claude Code:**

```bash
source .venv/bin/activate
claude   # or however you launch Claude Code
```

Verify whichever approach you chose:

```bash
python -c "from langfuse import Langfuse; print('OK')"
```

---

## Step 4 — Copy the hook script

`langfuse_hook.py` in this directory is the source of truth. Copy it to the Claude Code hooks directory:

```bash
mkdir -p ~/.claude/hooks
cp docs/observability/langfuse_hook.py ~/.claude/hooks/langfuse_hook.py
```

---

## Step 5 — Configure env vars

Add the following to the `env` block in `~/.claude/settings.json` — Claude Code injects this block into every hook invocation automatically:

```json
{
  "env": {
    "TRACE_TO_LANGFUSE": "true",
    "LANGFUSE_PUBLIC_KEY": "pk-lf-<your-public-key>",
    "LANGFUSE_SECRET_KEY": "sk-lf-<your-secret-key>",
    "LANGFUSE_BASE_URL": "http://localhost:3000"
  }
}
```

For all supported variables see the official Langfuse docs: https://langfuse.com/docs/sdk/python/sdk-v3

> **Naming note** — The hook reads `LANGFUSE_BASE_URL` (underscore between BASE and URL).
> The orchestration module (`langfuse.ts`) reads `LANGFUSE_BASEURL` (no underscore).

---

## Step 6 — Wire hooks into settings.json

Add the `hooks` block to `~/.claude/settings.json`. If you already have hooks configured, merge the entries:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "python ~/.claude/hooks/langfuse_hook.py" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Task|Skill|TaskUpdate",
        "hooks": [{ "type": "command", "command": "python ~/.claude/hooks/langfuse_hook.py" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Task|Skill|TaskUpdate",
        "hooks": [{ "type": "command", "command": "python ~/.claude/hooks/langfuse_hook.py" }]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [{ "type": "command", "command": "python ~/.claude/hooks/langfuse_hook.py" }]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "python ~/.claude/hooks/langfuse_hook.py" }]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "python ~/.claude/hooks/langfuse_hook.py" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "python ~/.claude/hooks/langfuse_hook.py" }]
      }
    ]
  }
}
```

**Matcher `Task|Skill|TaskUpdate`** — captures subagent spawns, skill invocations, and implement-ticket phase transitions (in_progress / completed).

---

## Step 7 — Verify

Restart Claude Code (settings.json is read at session start), then run any workflow:

```bash
/implement-ticket --from-markdown .tickets/my-ticket.md --skip-pr
```

A trace named `Claude Code - /implement-ticket` should appear in the Langfuse UI within ~5 seconds of completion.

Check hook activity:

```bash
tail -20 ~/.claude/state/langfuse_hook.log
```

Healthy output:

```
2026-05-18 10:01:23 [INFO] Emitted UserPromptSubmit in 0.08s (session=... trace=...)
2026-05-18 10:01:45 [INFO] Emitted PreToolUse in 0.11s (session=... trace=...)
2026-05-18 10:01:46 [INFO] Processed 1 turns in 0.09s (session=...)
```

---

## Switching to Langfuse Cloud

Change exactly three values in the `env` block — no code change, no rebuild, no reinstall:

```json
{
  "env": {
    "TRACE_TO_LANGFUSE": "true",
    "LANGFUSE_PUBLIC_KEY": "pk-lf-<cloud-public-key>",
    "LANGFUSE_SECRET_KEY": "sk-lf-<cloud-secret-key>",
    "LANGFUSE_BASE_URL": "https://cloud.langfuse.com"
  }
}
```

US region: use `https://us.cloud.langfuse.com`.

> Do not mix keys from one project with the base URL of another — that produces 401 errors.

---

## Disabling

Remove `TRACE_TO_LANGFUSE` from the `env` block, or set it to `"false"`. The hook exits immediately — no SDK imported, no network calls.

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| No log entries after a run | `TRACE_TO_LANGFUSE` not set or not `"true"` in `~/.claude/settings.json` |
| `Langfuse disabled: LANGFUSE_PUBLIC_KEY does not start with pk-lf-` | Key copied incorrectly; check for trailing spaces |
| `Langfuse disabled: LANGFUSE_BASEURL is not a valid URL` | `LANGFUSE_BASE_URL` must be a valid `http://` or `https://` URL |
| Hook fires but no trace in UI | `docker compose ps` in `~/langfuse`; check containers are healthy |
| Run fails because of Langfuse | This should not happen — the hook is fail-open; open an issue |

Enable verbose debug logging:

```json
{ "env": { "CC_LANGFUSE_DEBUG": "true" } }
```

Logs at: `~/.claude/state/langfuse_hook.log`
