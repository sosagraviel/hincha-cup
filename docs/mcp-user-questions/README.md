# MCP user-questions hooks — manual installation

QAF skills can route user-input prompts through an MCP tool instead of console. When opted in, every prompt point emits a structured payload (`session`, `invocation`, `ticket`, `project`, `user`, `runtime`, `flags`) so backends (web UI, Slack, ticketing) can correlate questions to the Claude Code session.

The integration is **opt-in and manual**. QAF does **not** install these hooks for you. If you want the MCP path, install the two bash scripts in this directory into your project as described below.

When `QAF_ASK_USER_MCP_TOOL` is unset, every skill behaves exactly as it did before — no MCP call, no payload, no session file required.

## Contents

| File | Purpose |
|---|---|
| `session-start-write.sh` | Claude Code `SessionStart` hook. Reads the event from stdin and persists `{session_id, transcript_path, source, started_at}` to `.claude-temp/sessions/session.json` so the skill can include `session.session_id` in payloads. |
| `build-mcp-payload.sh` | Sourceable bash helper. Composes the payload (`session` + `invocation` + `project` + `user` + `runtime` + optional `ticket` / `flags`) from `.claude-temp/sessions/session.json`, env vars (`MCP_SKILL`, `MCP_PHASE`, `MCP_TICKET_*`, `MCP_FLAGS_JSON`), and `git` / `node` / `jq`. Emits the payload without `questions[]`; the skill appends its batch. |
| `fixtures/` | Expected payload shapes for `create-sdd-ticket` Phase 3 gaps and `implement-ticket` Phase 4 branch consent. Consumed by `scripts/verify-mcp-payload.sh` in CI to detect builder-shape drift. Engineers installing the hooks normally do not interact with this directory. |

The wire format is defined in [`ask-user-questions-contract.md`](../../ask-user-questions-contract.md). The QAF-side data sources for each payload block are in [`qaf-integration.md`](../../qaf-integration.md).

## Requirements

- `jq` — required at runtime when `QAF_ASK_USER_MCP_TOOL` is set. `build-mcp-payload.sh` fails fast with an actionable error if it is missing.
  - macOS: `brew install jq`
  - Ubuntu / Debian: `sudo apt-get install jq`
- `node` — required for the `runtime.node_version` field. Usually already present in QAF target projects.
- Bash 3.2 or newer.

## Installation

The recommended install path inside each target project is `scripts/hooks/`. The skill bash blocks reference `$MCP_AUQ_HOOKS/build-mcp-payload.sh`, where `MCP_AUQ_HOOKS` points at the directory you installed the scripts into. Setting `MCP_AUQ_HOOKS` lets you install the hooks anywhere without editing the skill blocks.

1. Copy the two scripts into your project:

    ```bash
    mkdir -p "$YOUR_PROJECT/scripts/hooks"
    cp docs/mcp-user-questions/session-start-write.sh "$YOUR_PROJECT/scripts/hooks/"
    cp docs/mcp-user-questions/build-mcp-payload.sh "$YOUR_PROJECT/scripts/hooks/"
    chmod +x "$YOUR_PROJECT/scripts/hooks/"*.sh
    ```

2. Verify `.claude-temp/` is gitignored. Projects initialized by `/initialize-project` already have this entry; only add it manually if the line is missing:

    ```bash
    grep -qxF '.claude-temp/' "$YOUR_PROJECT/.gitignore" \
      || echo '.claude-temp/' >> "$YOUR_PROJECT/.gitignore"
    ```

    The SessionStart hook writes its per-session state under `.claude-temp/sessions/session.json`, so it inherits the gitignore covering the rest of QAF's runtime artifacts.

3. Register the `SessionStart` hook in `$YOUR_PROJECT/.claude/settings.json`. Merge this entry alongside any existing `hooks` block:

    ```json
    {
      "hooks": {
        "SessionStart": [
          {
            "matcher": ".*",
            "hooks": [
              {
                "type": "command",
                "command": "$MCP_AUQ_HOOKS/session-start-write.sh",
                "managedBy": "qaf"
              }
            ]
          }
        ]
      }
    }
    ```

    `managedBy` is an informational tag for your own bookkeeping. Claude Code ignores unknown keys on hook entries.

4. Restart Claude Code in the project so the new hook is picked up. The first SessionStart will create `.claude-temp/sessions/session.json`.

5. Export the two vars the skill bash blocks need:
    - `QAF_ASK_USER_MCP_TOOL` — the MCP tool name to invoke (e.g. `mcp__qaf__ask_user_questions`). Acts as the opt-in switch: when unset, every skill falls back to console / `AskUserQuestion` / `read -p`.
    - `MCP_AUQ_HOOKS` — absolute path to the directory you installed the hooks into. Used by the `SessionStart` hook command and by every skill bash block that sources `build-mcp-payload.sh`.

    Pick **one** of the strategies below.

    ### Option A — Claude Code project setting (recommended)

    Set the variables inside `<your-project>/.claude/settings.local.json`. Claude Code reads the top-level `env` block and applies it to every session and to every subprocess it spawns (including the `SessionStart` hook). `settings.local.json` is gitignored by default, so the opt-in stays local to your machine without polluting the repo or your shell.

    If the file does not exist yet, create it with exactly this content (replace the `MCP_AUQ_HOOKS` value with the absolute path you installed the hooks to):

    ```json
    {
      "env": {
        "QAF_ASK_USER_MCP_TOOL": "mcp__qaf__ask_user_questions",
        "MCP_AUQ_HOOKS": "/absolute/path/to/your-project/scripts/hooks"
      }
    }
    ```

    If the file already exists, merge the `env` entries alongside whatever you already have:

    ```json
    {
      "permissions": {
        "allow": [
          "..."
        ]
      },
      "env": {
        "QAF_ASK_USER_MCP_TOOL": "mcp__qaf__ask_user_questions",
        "MCP_AUQ_HOOKS": "/absolute/path/to/your-project/scripts/hooks"
      }
    }
    ```

    Restart Claude Code in the project so the new env block is picked up. The variables apply automatically every time you open the project — no shell modification needed.

    Verify from a Claude Code session:

    ```bash
    echo "$QAF_ASK_USER_MCP_TOOL"
    # Expected output: mcp__qaf__ask_user_questions
    echo "$MCP_AUQ_HOOKS"
    # Expected output: the absolute path you set above
    ```

    ### Option B — persistent shell profile

    Use this if you want the variables available outside Claude Code too (e.g. running QAF skills from a plain terminal, or other tooling that reads the same env).

    **zsh** (default on macOS) — edit `~/.zshrc`:

    ```bash
    # ~/.zshrc — final state (only the QAF block is new)

    # ... your existing zsh config (PATH, aliases, plugins, etc.) ...

    # QAF — opt in to the MCP user-questions flow.
    # When QAF_ASK_USER_MCP_TOOL is unset, QAF skills fall back to console / AskUserQuestion / read -p.
    export QAF_ASK_USER_MCP_TOOL="mcp__qaf__ask_user_questions"
    export MCP_AUQ_HOOKS="$HOME/path/to/your-project/scripts/hooks"
    ```

    **bash** — edit `~/.bashrc` (Linux) or `~/.bash_profile` (macOS bash):

    ```bash
    # ~/.bashrc — final state (only the QAF block is new)

    # ... your existing bash config ...

    # QAF — opt in to the MCP user-questions flow.
    export QAF_ASK_USER_MCP_TOOL="mcp__qaf__ask_user_questions"
    export MCP_AUQ_HOOKS="$HOME/path/to/your-project/scripts/hooks"
    ```

    Apply the change to the current shell:

    ```bash
    source ~/.zshrc       # or: source ~/.bashrc
    echo "$QAF_ASK_USER_MCP_TOOL"
    # Expected output: mcp__qaf__ask_user_questions
    echo "$MCP_AUQ_HOOKS"
    # Expected output: the absolute path you set above
    ```

    Open a new terminal in your project and the variables will already be set.

    ### Option C — per-project via `direnv`

    Alternative to Option A if you prefer `direnv` over Claude Code's `env` block (e.g. you already use `.envrc` for other project-scoped vars). Create `<your-project>/.envrc`:

    ```bash
    # <your-project>/.envrc — final state
    export QAF_ASK_USER_MCP_TOOL="mcp__qaf__ask_user_questions"
    export MCP_AUQ_HOOKS="$PWD/scripts/hooks"
    ```

    After creating the file:

    ```bash
    cd <your-project>
    direnv allow .
    echo "$QAF_ASK_USER_MCP_TOOL"
    # Expected output: mcp__qaf__ask_user_questions
    echo "$MCP_AUQ_HOOKS"
    # Expected output: <your-project>/scripts/hooks
    ```

    Add `.envrc` to your project's `.gitignore` if you don't want to commit the opt-in.

    ### Option D — per-session (one-off)

    Export in the current shell only. The variables disappear when the terminal closes.

    ```bash
    export QAF_ASK_USER_MCP_TOOL="mcp__qaf__ask_user_questions"
    export MCP_AUQ_HOOKS="$PWD/scripts/hooks"
    ```

    Useful for trying the MCP path once without committing to a persistent change.

    ### Option E — per-invocation (single command)

    Prefix Claude Code (or any QAF skill invocation) without modifying any file:

    ```bash
    QAF_ASK_USER_MCP_TOOL="mcp__qaf__ask_user_questions" \
      MCP_AUQ_HOOKS="$PWD/scripts/hooks" \
      claude
    ```

    The variables apply to that single process tree only.

    ### Deactivating

    Whatever strategy you picked, deactivation is the inverse:

    - **Option A**: remove the `env` block (or just the `QAF_ASK_USER_MCP_TOOL` / `MCP_AUQ_HOOKS` keys) from `.claude/settings.local.json` and restart Claude Code.
    - **Option B**: remove or comment the export lines in `~/.zshrc` / `~/.bashrc`, then `source` it.
    - **Option C**: delete `.envrc` (or remove the lines), then `direnv reload`.
    - **Option D / E**: nothing — already gone next session.

    Or, regardless of the strategy:

    ```bash
    unset QAF_ASK_USER_MCP_TOOL MCP_AUQ_HOOKS
    ```

    With `QAF_ASK_USER_MCP_TOOL` unset, every QAF skill behaves exactly as before — console / `AskUserQuestion` / `read -p`, no MCP call, no session file read.

## Verifying the install

Sanity check the SessionStart hook:

```bash
ls "$YOUR_PROJECT/.claude-temp/sessions/session.json" && \
  jq . "$YOUR_PROJECT/.claude-temp/sessions/session.json"
```

You should see a JSON object with `session_id`, `transcript_path`, `source`, and `started_at`. If the file is missing, the hook either did not fire (restart Claude Code) or `jq` is not installed (in which case the hook will have written `session.json.raw` instead).

Sanity check the payload builder:

```bash
export CLAUDE_PROJECT_DIR="$YOUR_PROJECT"
export MCP_AUQ_HOOKS="$YOUR_PROJECT/scripts/hooks"
export MCP_SKILL="implement-ticket"
export MCP_PHASE="phase-4-branch-consent"
bash "$MCP_AUQ_HOOKS/build-mcp-payload.sh" | jq .
```

You should see a fully composed payload with all the required blocks. If you see `protocol_version: "2"`, `session.session_id`, `invocation.batch_id`, `project.path`, and `runtime.platform`, the install is correct.

## Behavior when `QAF_ASK_USER_MCP_TOOL` is unset

- The SessionStart hook continues to write `session.json` (it is a no-op cost; harmless).
- Every skill bash block falls through to its provider-native prompt (`AskUserQuestion` on Claude, `read -p` on Codex, markdown placeholder for `create-sdd-ticket` Phase 3).
- `build-mcp-payload.sh` is never sourced.

## Uninstall

Manual install means manual uninstall:

```bash
rm "$YOUR_PROJECT/scripts/hooks/session-start-write.sh"
rm "$YOUR_PROJECT/scripts/hooks/build-mcp-payload.sh"
```

Remove the `SessionStart` entry from `.claude/settings.json` and unset `QAF_ASK_USER_MCP_TOOL` / `MCP_AUQ_HOOKS`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Skill prints `QAF_ASK_USER_MCP_TOOL set but SessionStart hook not configured` | `.claude-temp/sessions/session.json` missing | Confirm the hook is registered in `.claude/settings.json`; restart Claude Code; check the session file appears. |
| `ERROR: jq is required` from `build-mcp-payload.sh` | `jq` not on PATH | Install per Requirements above. |
| `git` fields (`branch`, `commit_sha`, `repo_url`) absent from payload | Target is not a git repo or `git` is not installed | Expected — those fields are optional and the payload still validates. |
| `user` block absent | `git config user.email` and `user.name` both unresolved | Set them with `git config --global user.email …` / `…user.name …` or accept that the block is omitted. |
| Two Claude Code sessions in the same project clobber `session.json` | Last-write-wins by design | Known MVP limitation. Run one session per project directory. |
| `SessionStart` fires on `--continue` / `--resume` with a fresh id | Expected — `source: "resume"` will be set | Acceptable; the new id is correct for the resumed session. |
