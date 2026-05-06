# Plan 20 — Record absence as finding (don't drop info on the floor)

**Status:** awaiting confirmation. Do NOT implement until approved.
**Author:** assistant, 2026-05-06
**Triggered by:** Plan 17's `found_no_evidence_yesno` rule blocks
yes/no questions when the evidence proves "no", with retry
feedback "Report this as a finding (record absence as a fact in
the relevant `findings.<...>` field)". The agent often takes the
easier escape: drop the item entirely, no finding emitted. Result
on gira: the question "Is a Jest coverage threshold enforced?"
disappeared, AND the fact "backend has no enforced coverage
threshold" never made it into `findings.testing` either. That
information is lost from the wiki / CLAUDE.md.

This plan is **prompt-only**, single-commit, additive. No new
validators, no schema changes, no code changes.

---

## A. Concrete evidence (gira 2026-05-06 run, framework at Plan 17)

`gira/.claude-temp/initialize-project/phase1-outputs/03-code-patterns-testing.json`:

| Topic | Recorded as finding? | Recorded as needs_verification? | Net |
|---|---|---|---|
| Web-frontend test absence | ✓ `findings.testing.web-frontend.unit.notes: "No unit test framework installed; vitest/jest absent from dependencies"` | (none) | preserved |
| Pre-push hook quirk | ✓ `findings.pre_push_enforcement.note: "pre-push hook has unit test and knip runs explicitly disabled via TODO comments"` | (none) | preserved |
| Pre-commit framework | ✓ `findings.code_quality.pre_commit: "husky + commitlint"` | (none) | preserved |
| **Backend coverage threshold absence** | ✗ **NOT recorded anywhere in findings** | (blocked by Plan 17 `found_no_evidence_yesno`) | **lost** |
| **AWS SDK absence (tech-stack)** | ✗ NOT recorded in `findings.dependencies` | (blocked by Plan 17) | **lost** |
| **CI/CD pipeline absence (tech-stack)** | ✓ `findings.ci_cd.provider: none` (already in schema) | (blocked by Plan 17) | preserved |

The agent's behavior is **inconsistent**: some absences become
findings (web-frontend tests, hook quirks), others get dropped
(coverage threshold, AWS SDK). The pattern is roughly "if the
analyzer's schema has an explicit field for the absence, the
agent records it; if it doesn't, the agent drops the item
without recording anywhere."

---

## B. The rule we want to enforce

**Plan 17 principle:** if your evidence proves the answer, don't
ask — record the fact and move on.

**Plan 20 amendment:** "record the fact" is non-negotiable. If
your evidence proves a presence/absence answer, that fact MUST
end up in some `findings.<...>` path BEFORE you drop the
question. Dropping without recording loses information that
should reach the wiki / CLAUDE.md.

---

## C. The fix — three small prompt edits

### C.1. Update each analyzer's execution-instructions (4 files)

Add this paragraph to the `<verification_guidelines>` block in
all four analyzers (`structure-analyzer`, `tech-stack-analyzer`,
`code-patterns-analyzer`, `data-flows-analyzer`). The wording is
identical so the rule is consistent across analyzers:

```md
### Record absence as a finding — NEVER drop information on the floor

When your `attempted_resolution` produces evidence of a yes/no
answer (positive OR negative), record the fact in the right
`findings.<sub-field>` path BEFORE deciding whether to emit a
needs_verification item. The wiki / CLAUDE.md needs the fact
regardless of whether you ask the operator.

**The Plan 17 Stop hook will reject yes/no presence questions
whose evidence proves "no" (`found_no_evidence_yesno`). When
that happens, the right move is NOT to silently drop the item —
it is to record the absence as a finding and then drop the
question.** Otherwise the fact is lost.

Examples (stack-agnostic shapes):

- AR: `Read jest.config.mjs — no coverageThreshold key found`
  → record on the matching service's testing slice (e.g.
  `findings.testing.<service>.unit.coverage_threshold: "not_enforced"`
  OR add a `notes:` line: "no coverageThreshold block; coverage
  is collected but not gated").
- AR: `Grep "aws-sdk" services/backend/package.json — zero matches`
  → omit AWS from the dependency list, OR record an explicit
  `findings.dependencies.<service>.notable_absent: ["aws-sdk"]`
  when the absence is meaningful (env vars reference it but no
  client is installed).
- AR: `Glob {.github/workflows/*.yml,...} — returned zero matches`
  → record `findings.ci_cd.provider: "none"` and
  `findings.ci_cd.config_files: []`.
- AR: `Glob .husky/* — found 3 files but contents were not read`
  → finish the search (Read each file), THEN record what each
  hook actually runs in `findings.pre_commit_enforcement` or
  similar. Don't emit a question.

### When you genuinely need to ask

Only emit a needs_verification item when ALL THREE of the Plan
17/18 gates pass AND the answer is INTENT or BUSINESS DECISION
(not a fact your evidence already proves). Facts go in
`findings.*`; intent/business decisions go in
`needs_verification`.
```

### C.2. Strengthen the Plan 17 retry feedback in the Stop hook

**File:** `orchestration/src/nodes/initialize-project/phase1/shared/hooks/validate-analyzer-json.hook.ts`

Update the `found_no_evidence_yesno` retry-feedback paragraph
from its current shape to:

```
- found_no_evidence_yesno (Plan 17 §C.1): your
  `attempted_resolution` already proves the answer (e.g.
  "Grep aws-sdk — zero matches"), and the question is a yes/no
  presence question. Do NOT just remove the item — that loses
  the fact. RECORD THE ABSENCE in the right `findings.<sub-field>`
  path BEFORE dropping the question. For example:
    - AR has "no coverageThreshold key found" → add the absence
      to `findings.testing.<service>.unit.notes` or
      `coverage_threshold: "not_enforced"`.
    - AR has "Grep X — zero matches" → omit X from the dep list
      OR record `findings.dependencies.<service>.notable_absent`.
    - AR has "Glob workflows — zero matches" → record
      `findings.ci_cd.provider: "none"`.
  The fact still belongs in the wiki. Drop the question, NOT
  the fact.
```

### C.3. Update the `confessed_incomplete_search` retry feedback

Same file, same idea: when the agent confesses "file contents
not read", the fix is to **read** the file and **record what
it found**, not drop the item.

```
- confessed_incomplete_search (Plan 17 §C.2): your
  `attempted_resolution` admits the search was incomplete. The
  fix is to (1) finish the search (Read / Grep / Glob the files
  you skipped) and (2) RECORD what you found in the right
  `findings.<sub-field>` path. Don't drop the item without
  finishing — the fact belongs in the wiki.
```

---

## D. What this plan explicitly does NOT do

- ❌ No new validators
- ❌ No schema changes (no new `findings.*` fields enforced;
  the agent decides where the fact goes within the existing
  schema's `passthrough()` flexibility)
- ❌ No code changes outside the Stop hook's feedback strings
- ❌ No analyzer-specific hardcoded absence-recording rules
- ❌ No Plan 17 / Plan 18 rule changes (those stay as-is)

Single commit. ~40 lines of prompt content added across 4
analyzer files, plus ~15 lines of feedback text in the Stop hook.

---

## E. Tests

No new unit tests are needed — the change is prompt-side
guidance + Stop-hook feedback wording. The existing Plan 17 +
Plan 18 unit tests still pass (we're not changing detector
behavior).

The acceptance check is the next gira run:

- [ ] `findings.testing.<service>.unit` carries either a
      `coverage_threshold` value or a `notes:` entry recording the
      absence when the agent searched and found none.
- [ ] `findings.dependencies` notes any deps that are
      mentioned in the project (env vars, README, docker-compose)
      but not actually installed.
- [ ] No question gets blocked AND has its underlying fact
      lost (the operator-side outcome of the gira-2026-05-06
      run that triggered this plan).

---

## F. Stack-agnostic regression check

The new rule is "if your evidence proves a presence/absence,
record it in `findings.*` before dropping the question." That
holds for any project shape — no language-specific tokens, no
framework assumptions. Single-service / multi-repo / serverless
/ polyglot projects all use the same rule because the rule
operates on the analyzer's evidence shape, not on the project
shape.

---

**Awaiting your confirmation or change requests before I touch
any code.**
