---
name: pr-reviewer
version: 4.0.0
last-updated: 2026-05-14
description: Reviews a GitHub Pull Request using a deterministic-glue plus specialist-agent pipeline. Invoked by /implement-ticket Phase 10 once per PR URL; also user-invocable directly. Supports single-repo and multi-repo modes.
allowed-tools: Bash, Read, Grep, Glob
argument-hint: '[--pr-url <URL>] [--jira-key <KEY>] [--mode automated|manual] [--repos <abs1>,<abs2>,...] [--aggregate]'
user-invocable: true
disable-model-invocation: false
---

# PR Reviewer (Codex)

Input: $ARGUMENTS

Parse the input for these flags:
- `--pr-url <URL>` — GitHub PR URL to review (required unless `--aggregate`)
- `--jira-key <KEY>` — JIRA ticket key for artifact namespacing
- `--mode automated|manual` — automated writes JSON and returns; manual pauses for human edit before posting (default: automated)
- `--repos <abs1>,<abs2>,...` — absolute paths to repo roots in multi-repo mode
- `--aggregate` — skip review pipeline; run cross-repo aggregator over existing per-PR JSONs for this JIRA key

## Execution Model — Codex-specific

Codex does not spawn sub-agents programmatically. You (the agent running this skill) execute every specialist role yourself by loading the corresponding role prompt from the `agents/` directory and internalising it as your active operating persona for that step.

For each specialist step below, read the referenced `.md` file, adopt its `objective` and `output_format`, produce the required JSON artifact, then return to the orchestrator persona for the next step.

Sequence is **strictly linear** (no parallelism). Run all specialists in order: bug-logic → security-style → tests → performance → conventions → coordinator-judge → devils-advocate-critic → verifier.

## Artifact Paths

**Single-repo:**
```
.claude/artifacts/<JIRA_KEY>/pr/review/
  review-results.json
  review.md
  human.md
  inline.md
  iteration-{N}.json
```

**Multi-repo (per PR):**
```
.claude/artifacts/<JIRA_KEY>/pr/<repo-basename>/review/
  review-results.json
  review.md
  human.md
  inline.md
  iteration-{N}.json
```

**Cross-repo summary (--aggregate only):**
```
.claude/artifacts/<JIRA_KEY>/pr/cross-repo-summary.json
.claude/artifacts/<JIRA_KEY>/pr/cross-repo-summary.md
```

## Pipeline Architecture

```
/pr-reviewer --pr-url <URL> --jira-key <KEY>
  1. fetch_pr_data.py                   (deterministic: gh CLI → JSON)
  2. detect-stack (you, inline)         (read manifest files → stack-profile.json)
  3. context-pack builder (you, inline) (diff + grep for neighbor symbols)
  4. specialist-bug-logic.md            (load role; produce bug-findings.json)
  5. specialist-security-style.md       (load role; produce security-findings.json)
  6. specialist-tests.md                (load role; produce tests-findings.json)
  7. specialist-performance.md          (load role; produce perf-findings.json)
  8. specialist-conventions.md          (load role; produce conv-findings.json)
  9. coordinator-judge.md               (load role; produce review-results.json)
 10. devils-advocate-critic.md          (load role if severity >= major; update review-results.json)
 11. verifier (you, inline)             (grep each file:line; drop hallucinations)
 12. generate_review_files.py           (deterministic: results.json → review.md / human.md / inline.md)
 13. add_inline_comment.py              (deterministic: posts to GitHub via gh CLI)
```

When `--aggregate` is passed and multiple per-PR JSONs exist under `.claude/artifacts/<JIRA_KEY>/pr/`, load `agents/cross-repo-aggregator.md` as your role and skip steps 1–13.

## Execution

### Step 1: Fetch PR Data

```bash
REVIEW_DIR=".claude/artifacts/${JIRA_KEY}/pr/${REPO_BASENAME}/review"
mkdir -p "$REVIEW_DIR"

python skills/030-quality-assurance/pr-reviewer/scripts/fetch_pr_data.py \
  "$PR_URL" \
  --output-dir "$REVIEW_DIR"
```

This populates `$REVIEW_DIR/PRs/<repo>/<PR_NUMBER>/` with:
- `metadata.json` — title, author, state, branches, labels, headSha, baseSha, linesChanged, filesChanged
- `diff.patch` — full PR diff from gh CLI
- `comments.json` — existing review comments
- `commits.json` — commit history
- `related_issues.json` — linked GitHub issues
- `SUMMARY.txt` — human-readable summary

### Step 2: Detect Stack (inline)

Read whichever manifest files exist in the repository root:
`package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `Gemfile`, `composer.json`, `*.csproj`

Produce `$REVIEW_DIR/stack-profile.json`:
```json
{
  "primaryLanguage": "TypeScript",
  "frameworks": ["NestJS"],
  "testRunner": "Jest",
  "packageManagers": ["pnpm"],
  "linters": ["ESLint"]
}
```

### Step 3: Build Context Pack (inline)

Read `$REVIEW_DIR/PRs/<repo>/<PR_NUMBER>/diff.patch`. For each changed file path in the diff:
- Skip: `*.lock`, `*-lock.json`, `*.min.js`, `dist/`, `build/`, `vendor/`, `node_modules/`, `generated/`
- Grep for function/class/type signatures ±20 lines around each changed line range.

If `mcp__code_graph__get_minimal_context_tool` is available, call it once:
```
mcp__code_graph__get_minimal_context_tool({ task: "PR review: <PR_TITLE>", changed_files: [<list>] })
```

Persist to `$REVIEW_DIR/context-pack.json`.

### Step 4–8: Specialist Roles (sequential)

For each specialist, load the role prompt, adopt its persona, produce the findings JSON, then revert to orchestrator persona.

**Step 4** — Load `agents/specialist-bug-logic.md`. Produce `$REVIEW_DIR/bug-findings.json`.

**Step 5** — Load `agents/specialist-security-style.md`. Produce `$REVIEW_DIR/security-findings.json`.

**Step 6** — Load `agents/specialist-tests.md`. Produce `$REVIEW_DIR/tests-findings.json`.

**Step 7** — Load `agents/specialist-performance.md`. Produce `$REVIEW_DIR/perf-findings.json`.

**Step 8** — Load `agents/specialist-conventions.md`. Produce `$REVIEW_DIR/conv-findings.json`.

### Step 9: Coordinator / Judge

Load `agents/coordinator-judge.md`. Adopt its persona. Input: all five findings JSONs, stack profile, `references/review_criteria.md`. Cap: at most 5 nits; additional nits summarised as "plus N similar items". Produce `$REVIEW_DIR/review-results.json`.

### Step 10: Devil's Advocate Critic

If `review-results.json` contains any `severity == "major"` or `severity == "blocking"` findings:

Load `agents/devils-advocate-critic.md`. Adopt its persona. Produce a `CriticReport` JSON. Merge accepted challenges into `review-results.json` (downgrade or drop findings per the critic's verdict). Revert to orchestrator persona.

Skip if all findings are `severity == "minor"`.

### Step 11: Verifier (inline)

For each finding with a non-null `file` and `line` in `review-results.json`:

```bash
grep -n "" "<REPO_PATH>/<finding.file>" | sed -n "${finding.line}p"
```

Drop findings where the file does not exist or the line is absent. Log dropped findings to `$REVIEW_DIR/verifier-drops.json`.

### Step 12: Generate Review Files

```bash
python skills/030-quality-assurance/pr-reviewer/scripts/generate_review_files.py \
  "$REVIEW_DIR" \
  --findings "$REVIEW_DIR/review-results.json" \
  --metadata "$REVIEW_DIR/PRs/<repo>/<PR_NUMBER>/metadata.json"
```

Produces `review.md`, `human.md`, `inline.md` in `$REVIEW_DIR`.

### Step 13: Post Inline Comments

In **automated** mode:

```bash
python skills/030-quality-assurance/pr-reviewer/scripts/add_inline_comment.py \
  <OWNER> <REPO> <PR_NUMBER> <HEAD_SHA> \
  "<finding.file>" <finding.line> "<finding.issue>"
```

In **manual** mode, pause. Present the user with the paths to `human.md` and `inline.md`. Wait for `/send` or `/send-decline`:

```bash
# /send — request changes
gh pr comment <PR_NUMBER> --repo <OWNER>/<REPO> --body-file "$REVIEW_DIR/human.md"
gh pr review <PR_NUMBER> --repo <OWNER>/<REPO> --request-changes

# /send-decline — approve
gh pr comment <PR_NUMBER> --repo <OWNER>/<REPO> --body-file "$REVIEW_DIR/human.md"
gh pr review <PR_NUMBER> --repo <OWNER>/<REPO> --approve
```

### Aggregate Mode (--aggregate)

When `--aggregate` is passed:

1. Find all `review-results.json` files under `.claude/artifacts/<JIRA_KEY>/pr/*/review/`
2. If fewer than 2 exist, emit a warning and exit cleanly
3. Load `agents/cross-repo-aggregator.md`. Adopt its persona.
4. Produce:
   - `.claude/artifacts/<JIRA_KEY>/pr/cross-repo-summary.json`
   - `.claude/artifacts/<JIRA_KEY>/pr/cross-repo-summary.md`

## Output Schema

### review-results.json

```json
{
  "jiraKey": "PROJ-123",
  "prUrl": "https://github.com/owner/repo/pull/456",
  "prNumber": 456,
  "reviewIteration": 1,
  "timestamp": "2026-05-14T10:30:00Z",
  "overallStatus": "CHANGES_REQUESTED",
  "summary": "2 blocking issues, 1 major issue, 3 minor issues",
  "repository": {
    "owner": "owner",
    "name": "repo",
    "path": "/abs/path/to/repo"
  },
  "prMetadata": {
    "commitSha": "abc123",
    "baseRef": "main",
    "headRef": "feat/my-feature",
    "linesChanged": 245,
    "filesChanged": 8
  },
  "findings": {
    "blocking": [],
    "major": [],
    "minor": []
  },
  "metrics": {
    "totalFindings": 0,
    "blockingCount": 0,
    "majorCount": 0,
    "minorCount": 0,
    "filesReviewed": 0,
    "linesChanged": 0
  },
  "tokenUsage": {
    "input": 0,
    "output": 0,
    "cached_input": 0,
    "cache_creation": 0
  },
  "recommendations": [],
  "nextSteps": {
    "action": "APPROVE",
    "reason": "No blocking or major issues found",
    "maxIterations": 3,
    "currentIteration": 1
  }
}
```

### cross-repo-summary.json

```json
{
  "ticketId": "PROJ-123",
  "prs": [
    {
      "repo": "shared-lib",
      "url": "https://github.com/org/shared-lib/pull/12",
      "blockingCount": 1,
      "majorCount": 0,
      "minorCount": 2,
      "overallStatus": "CHANGES_REQUESTED"
    }
  ],
  "crossRepoConcerns": [
    {
      "kind": "api-contract-mismatch",
      "summary": "shared-lib exports changed interface but consumer-a still imports old signature",
      "evidence": [
        { "repo": "shared-lib", "file": "src/api.ts", "line": 12 },
        { "repo": "consumer-a", "file": "src/client.ts", "line": 34 }
      ]
    }
  ],
  "mergeOrder": ["shared-lib", "consumer-a"]
}
```

## Severity Definitions

- **blocking** — must be fixed before merge. Real bugs, security vulnerabilities, broken contracts, data loss risk, tests that fail.
- **major** — should be fixed. Missing tests for new public APIs, uncaught error paths, unguarded external inputs, performance regressions with evidence.
- **minor** — optional improvement. At most 5 per review. Additional nits are summarised as "plus N similar items".

## Multi-Repo Behaviour

When invoked by `/implement-ticket` Phase 10 with multiple PR URLs, each invocation of `/pr-reviewer --pr-url <URL>` is independent and writes to its own `.claude/artifacts/<JIRA_KEY>/pr/<repo-basename>/review/` directory.

After all per-PR invocations complete, `/implement-ticket` calls `/pr-reviewer --aggregate --jira-key <KEY>` once. That call reads all per-PR JSONs and produces the cross-repo summary.

## References

- `references/review_criteria.md` — binary rubric (Always / Conditionally / Never flag)
- `references/gh_cli_guide.md` — gh CLI command reference
- `references/scenarios.md` — common review scenarios
- `references/troubleshooting.md` — error patterns and fixes
- `agents/` — role prompts for each specialist and the coordinator
- `scripts/README.md` — deterministic glue script documentation
