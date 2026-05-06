# Plan 17 — Catch self-contradicting `needs_verification` questions

**Status:** awaiting confirmation. Do NOT implement until approved.
**Author:** assistant, 2026-05-06
**Triggered by:** gira run 2026-05-06 produced 6
`needs_verification` questions; the operator skipped or answered
"no" on 4 of them because the answer was already in the
`attempted_resolution` evidence.

---

## A. Diagnosis — exact pattern Plan 14 missed

Plan 14's quality gates (≥2 attempted_resolution entries, ≥40-char
impact, no graph internals, no fabricated numbers) all PASSED for
these 6 items. The items have well-formed evidence and concrete
impact text. What Plan 14 does not check is whether the
**evidence already answers the question**.

Two distinct failure shapes:

### A.1 — "Found-No-Evidence" (Q1, Q2, Q4 in the gira run)

The agent runs a negative search, gets zero results, and emits a
"is X installed?" question whose answer is provably "no" from the
search results.

| # | attempted_resolution evidence (verbatim) | question (verbatim) |
|---|-------------------------------------------|---------------------|
| Q1 | `Grep "aws-sdk" services/backend/package.json — zero matches; no AWS SDK declared` | "Is an AWS S3 client library installed for the attachment storage feature?" |
| Q2 | `Glob {.github/workflows/*.yml, ... } — returned zero matches`<br>`Grep "deploy" package.json — only keycloak:export-realm script found` | "Is there a CI/CD pipeline configured for this project, and if so where is it defined?" |
| Q4 | `Read services/backend/jest.config.mjs — collectCoverageFrom present, no coverageThreshold key found`<br>`Grep "coverageThreshold" services/backend/ — zero matches` | "Is a minimum Jest code-coverage threshold enforced for the backend service?" |

Each `attempted_resolution` literally contains "zero matches" / "no
X found" / "no X declared." The question asks "is X present?" The
answer is established by the evidence; asking the operator to
confirm is noise.

These items should have been **findings**, not
`needs_verification`. The wiki page can record "no AWS SDK is
installed" as a fact, not a question.

### A.2 — "Confessed Incomplete Search" (Q3)

The agent admits in `attempted_resolution` that it didn't actually
do the search the question requires.

| # | attempted_resolution evidence | question |
|---|-------------------------------|----------|
| Q3 | `Glob .husky/* — found commit-msg, pre-push, pre-commit but **file contents were not read**` | "What commands do the husky git hooks (commit-msg, pre-push, pre-commit) actually execute?" |

The hook files exist, are short shell scripts, and the agent had
`Read` available. "File contents were not read" is the agent
confessing to a search gap. The fix isn't to ask the operator —
it's to read the files.

### A.3 — Legitimate questions (Q5, Q6 — NOT to be flagged)

The remaining two are legitimate:

- Q5 (Keycloak production env vars) — `attempted_resolution`
  proves the vars are required at startup; whether production has
  the right values can't be verified from source.
- Q6 (Redis production deployment) — same shape; the code's
  defaults are localhost-ephemeral, but whether production runs
  persistent Redis is operator-only.

Both pass the test "no absence-evidence in attempted_resolution"
and "no confessed-incomplete-search." Neither rule below would
flag them.

---

## B. Stack-agnosticism contract

Both new rules are pure text-shape checks. Token vocabulary stays
language-neutral:

- "zero matches", "no X found", "not installed", "not declared",
  "0 matches", "returned zero", "no result" — generic search
  vocabulary.
- "not read", "was not (read|searched|inspected|opened)",
  "contents were not", "did not (read|inspect|search)",
  "unknown because we did not" — generic "I didn't try" vocabulary.

No language-family or framework token appears. Works equally on
Python (`Grep "from sentry_sdk"`), Go (`Grep "import \"github.com/aws/aws-sdk-go\""`),
Java, Rust, etc.

---

## C. Two new deterministic rules

### C.1. "Found-No-Evidence" rule

**Detection:**

A `needs_verification` item triggers this rule when BOTH:

1. **At least one `attempted_resolution` entry contains a negative-
   evidence token** (case-insensitive):

   ```
   /(zero matches|0 matches|no [-_/\w]+ (?:found|present|installed|declared|configured|defined|exists|specified)|returned zero|no result|not (?:installed|declared|present|defined|configured)|absent|missing|no .{0,30} (?:package|module|import|dependency|key|file)|does not (?:appear|exist|contain|reference)|no [-_/\w]+\.(?:yml|yaml|json|toml) (?:found|exists))/i
   ```

2. **The question is a yes/no presence question** — the question
   matches:

   ```
   /^\s*(?:is|are|does|do|has|have|is there)\b.*\?\s*$/i
   ```

   (i.e. starts with a yes/no auxiliary AND ends with `?`)

When BOTH conditions match, the item is rejected as a self-
contradicting question. Feedback: *"Your `attempted_resolution`
already proves the answer is no. Report this as a finding (e.g.
add it to the relevant `findings.<...>` field as a fact), not a
needs_verification question. The operator should not be asked to
confirm what the evidence already proves."*

**Why both conditions:** the negative-evidence pattern alone would
over-fire on legitimate questions like "What testing strategy is
enforced?" where the agent searched, found gaps, but the question
is about strategy, not pure presence. Requiring the question to be
a yes/no auxiliary form keeps the rule precise.

### C.2. "Confessed Incomplete Search" rule

**Detection:**

A `needs_verification` item triggers this rule when ANY
`attempted_resolution` entry contains a "didn't search" token
(case-insensitive):

```
/(?:contents? (?:were|was) not (?:read|inspected|opened)|(?:were|was) not (?:read|inspected|searched|opened)|did not (?:read|inspect|search|open)|files? not read|not yet (?:read|inspected|searched)|unknown because (?:we|i) did not)/i
```

When matched, the item is rejected. Feedback: *"Your
`attempted_resolution` admits the search was incomplete (`<matched
phrase>`). Complete the search (Read / Grep / Glob) before
emitting `needs_verification`. The framework cannot ask the
operator to substitute for an unfinished investigation."*

### C.3. Prompt update — self-check section

Add to `verification-format.md` (the shared analyzer prompt
fragment that documents `needs_verification` rules):

```
## Before emitting a needs_verification item — final check

Two anti-patterns the Stop hook will reject:

1. **Self-contradicting question.** If your `attempted_resolution`
   contains "zero matches" / "no X found" / "not installed" / etc.,
   the answer to a yes/no presence question ("Is X installed?",
   "Is there a Y?") is already proven. Do NOT ask the operator —
   record the absence as a finding instead.

   ✗ WRONG: attempted_resolution = ["Grep aws-sdk — zero matches"];
            question = "Is an AWS SDK installed?"
   ✓ RIGHT: report `findings.dependencies.aws_sdk: not_installed`
            (or omit the SDK from the dependency list entirely).

2. **Confessed incomplete search.** If your `attempted_resolution`
   admits a search was skipped ("file contents were not read",
   "did not inspect"), do NOT emit the question — finish the
   search first. The framework cannot substitute the operator for
   work the agent could have done.

   ✗ WRONG: attempted_resolution = ["Glob .husky/* — found 3 files
            but contents were not read"]; question = "What do the
            hooks run?"
   ✓ RIGHT: Read each .husky/* file before deciding whether the
            question is needed. After reading, the answer is
            usually clear and a question is unnecessary.
```

---

## D. Tests

### D.1. New unit tests — `needs-verification-quality.test.ts`

Add 6 cases:

1. **"Found-No-Evidence" — fires on the gira Q1 shape.**
   Fixture: `{ attempted_resolution: ['Grep "aws-sdk" — zero matches'], question: 'Is an AWS S3 client library installed?' }` → violation.
2. **"Found-No-Evidence" — fires on the gira Q2 shape.**
   Fixture covers `returned zero matches` + "Is there a CI/CD pipeline?" → violation.
3. **"Found-No-Evidence" — fires on the gira Q4 shape.**
   Fixture covers `no coverageThreshold key found` + "Is a coverage threshold enforced?" → violation.
4. **"Found-No-Evidence" — does NOT fire on legitimate Q5.**
   Fixture: Keycloak vars required + "Are values set correctly in production?" → no violation (no "zero matches" token).
5. **"Found-No-Evidence" — does NOT fire on non-yes/no questions.**
   Fixture: `attempted_resolution: ['Grep X — zero matches']` + question "What testing strategy is enforced?" → no violation (question doesn't start with yes/no auxiliary).
6. **"Confessed Incomplete Search" — fires on the gira Q3 shape.**
   Fixture: `attempted_resolution: ['Glob .husky/* — file contents were not read']` → violation.
7. **"Confessed Incomplete Search" — does NOT fire on completed searches.**
   Fixture: `attempted_resolution: ['Read foo.ts — confirmed X']` → no violation.

### D.2. Hook integration test

`test/unit/nodes/initialize-project/phase1/shared/hooks/validate-analyzer-json-self-contradiction.test.ts`:

End-to-end test that the Stop hook returns blocking feedback
naming the offending question + the violation code when an
analyzer output carries a self-contradicting item.

### D.3. Existing tests

Verify all 2,480 unit tests still pass after the new rules land.
The new rules are additive — they don't change existing assertions.

---

## E. Rollout

| Step | Description | Risk | Commit |
|------|-------------|------|--------|
| 1 | Implement C.1 + C.2 detectors in `phase1/shared/needs-verification-quality.ts`. Two new violation codes: `found_no_evidence_yesno` and `confessed_incomplete_search`. Wire into the existing `validateNeedsVerificationProse` aggregator. Inline retry feedback in the Stop hook. Tests D.1 + D.2. | low | commit 1/1 |
| 2 | Prompt update C.3 — add the self-check section to `verification-format.md`. | low | same commit |

Single commit. Both rules are additive checks on existing fields;
no schema changes; no behavioral changes to existing items that
already pass.

---

## F. Acceptance criteria

After this lands, a fresh `/initialize-project` run on gira (or
any project where the agent generates a "found-no-evidence"
question) must produce:

- [ ] Q1, Q2, Q4 (the gira-shape "is X installed?" questions
      whose evidence proves "no") are rejected at the Stop hook
      with feedback. The agent retries; the items become findings
      or are dropped entirely.
- [ ] Q3 (the gira-shape "what does X do?" question with
      confessed incomplete search) is rejected. The agent reads
      the files and either resolves the question or emits a
      narrower follow-up.
- [ ] Q5 + Q6 (legitimate operator questions) still emit. The
      operator gets a clean list of 2 questions instead of 6.

**Stack-agnostic regression:**

- [ ] A bare-pnpm fixture's `needs_verification` items still
      validate (the new rules are additive — they only fire on
      the two specific anti-patterns).
- [ ] A python-poetry fixture's items still validate.
- [ ] No existing test assertion changes meaning.

---

## G. Open question for confirmation

Rule C.1's regex includes patterns like `no .{0,30}
(?:package|module|import|dependency|key|file)`. This is broad on
purpose — it catches "no @aws-sdk package", "no coverageThreshold
key", "no Jenkinsfile file" etc. But it COULD over-match
legitimate prose like "no obvious refactor opportunity" if such
text ended up in `attempted_resolution`.

**My proposal:** keep the broad pattern. The cost of an over-fire
(agent retries with feedback "your evidence proves the answer; if
that's not what you meant, rephrase the question") is low; the
cost of an under-fire (more noise questions reaching the operator)
is high. Confirm if you'd prefer narrower patterns (only match the
exact tokens the gira run produced) instead.

---

**Awaiting your confirmation or change requests before I touch
any code.**
