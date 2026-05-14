---
name: security-review
version: 2.0.0
last-updated: 2026-05-14
description: Performs hybrid SAST + LLM-adjudicator security analysis across all detected languages, emitting per-repo SARIF 2.1.0, structured JSON, and a human-readable report. Triggered by /implement-ticket Phase 10 once per PR URL; also user-invocable standalone or in multi-repo mode with --repos.
argument-hint: '[--pr-url <URL>] [--jira-key <KEY>] [--repos <abs1>,<abs2>,...] [--baseline <path>] [--aggregate]'
allowed-tools: Bash, Read, Write, Glob, Grep
user-invocable: true
disable-model-invocation: false
---

# Security Review

Input: $ARGUMENTS

Parse flags from the input above:
- `--pr-url <URL>` — GitHub PR URL providing diff context for LLM triage
- `--jira-key <KEY>` — Jira ticket key used for artifact path namespacing
- `--repos <abs1>,<abs2>,...` — comma-separated absolute paths; each is scanned independently
- `--baseline <path>` — JSON findings file; only new fingerprints appear in output
- `--aggregate` — after per-repo scans, run cross-repo aggregator agent

When `--repos` is absent, treat the current workspace root as the single target.
When `--jira-key` is absent, derive a slug from the PR URL or use `adhoc-<date>`.

## Codex Execution Notes

Codex CLI invokes sub-agents via `$skill-name` syntax and lists available skills with `/skills`. Tool calls are issued directly; sub-agent `.md` files are read as plain files via `Read` and their instructions followed inline. The pipeline below is identical to the Claude variant; only the sub-agent invocation mechanics differ.

For each sub-agent step below, use `Read` to load the agent prompt from `{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/agents/<agent>.md`, then follow its instructions as an inline agent turn.

## Artifact Paths

**Single-repo:**
```
.claude/artifacts/<JIRA_KEY>/security/
  sarif.json
  security-results.json
  security-report.md
  scanner-outputs/
```

**Multi-repo (one entry per repo):**
```
.claude/artifacts/<JIRA_KEY>/security/<repo-basename>/
  sarif.json
  security-results.json
  security-report.md
  scanner-outputs/
```

**Cross-repo summary (only with --aggregate):**
```
.claude/artifacts/<JIRA_KEY>/security/cross-repo-summary.json
.claude/artifacts/<JIRA_KEY>/security/cross-repo-summary.md
```

## Stack Detection Table

| Language | Detection Markers | Scanners |
|---|---|---|
| Python | `pyproject.toml`, `requirements*.txt`, `Pipfile.lock`, `poetry.lock`, `uv.lock` | bandit, pip-audit, semgrep |
| JS/TS | `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | npm/pnpm audit, eslint-plugin-security, semgrep |
| Go | `go.mod` | gosec, govulncheck, osv-scanner |
| Rust | `Cargo.toml` | cargo-audit, cargo-deny, clippy |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts` | spotbugs + findsecbugs, OWASP dep-check, semgrep |
| Ruby | `Gemfile`, `Gemfile.lock` | brakeman, bundle-audit |
| PHP | `composer.json` | psalm-security, composer audit |
| .NET | `*.csproj`, `packages.lock.json` | security-code-scan, dotnet list package --vulnerable |
| C/C++ | `CMakeLists.txt`, `Makefile`, `*.h`, `*.c` | cppcheck, flawfinder |
| IaC | `Dockerfile`, `*.tf`, `k8s/*.yaml` | trivy, checkov |
| Universal | always | gitleaks, trufflehog, semgrep |

When a language is detected but its scanner is not installed, emit a `scanner-missing` finding with the recommended install command. Never fall back to generic checks silently.

## Pipeline

Run this pipeline for each target repo.

---

### Step 1 — Detect Stack

```bash
python3 "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/detect_stack.py" \
  --repo-path "$REPO_PATH" \
  --out-dir "$SCANNER_OUT"
```

Read the output `$SCANNER_OUT/stack.json` to determine which scanners to invoke.

Also check `$REPO_PATH/.claude/framework-config.json` if present; prefer its `by_service` language map as it is authoritative.

---

### Step 2 — Run Scanners

Run applicable scanner scripts. Capture non-zero exits as `scanner-missing` findings rather than aborting.

**Secrets:**
```bash
bash "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/run_secrets.sh" \
  --repo-path "$REPO_PATH" \
  --out-dir "$SCANNER_OUT" \
  ${BASELINE:+--baseline "$BASELINE"}
```

**SAST:**
```bash
python3 "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/run_sast.py" \
  --repo-path "$REPO_PATH" \
  --out-dir "$SCANNER_OUT" \
  --languages "$(jq -r '.languages | join(",")' "$SCANNER_OUT/stack.json")"
```

**Dependency audit:**
```bash
python3 "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/run_deps.py" \
  --repo-path "$REPO_PATH" \
  --out-dir "$SCANNER_OUT" \
  --languages "$(jq -r '.languages | join(",")' "$SCANNER_OUT/stack.json")"
```

**IaC:**
```bash
bash "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/run_iac.sh" \
  --repo-path "$REPO_PATH" \
  --out-dir "$SCANNER_OUT"
```

---

### Step 3 — Consolidate SARIF

```bash
python3 "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/consolidate_sarif.py" \
  --sarif-dir "$SCANNER_OUT" \
  --out "$ARTIFACTS_DIR/sarif.json" \
  ${BASELINE:+--baseline "$BASELINE"}
```

Merges all SARIF files, deduplicates by `fingerprints.primaryLocation`, applies suppressions, and removes baseline-matching fingerprints when `--baseline` is set.

---

### Step 4 — Reachability Filter

```bash
python3 "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/reachability_filter.py" \
  --sarif "$ARTIFACTS_DIR/sarif.json" \
  --repo-path "$REPO_PATH" \
  --out "$ARTIFACTS_DIR/sarif-filtered.json"
```

Passes through unchanged when code-graph MCP is not available.

---

### Step 5 — LLM Triage

Normalize findings:
```bash
python3 "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/normalize_findings.py" \
  --sarif "$ARTIFACTS_DIR/sarif-filtered.json" \
  --out "$ARTIFACTS_DIR/normalized-findings.json"
```

For each OWASP group with findings, read the corresponding agent prompt file and follow it inline:

| Group | Agent file |
|---|---|
| Access Control / SSRF | `agents/triage-A01-broken-access.md` |
| Security Misconfiguration | `agents/triage-A02-config.md` |
| Supply Chain / Dependencies | `agents/triage-A03-supply-chain.md` |
| Cryptographic Failures | `agents/triage-A04-crypto.md` |
| Injection | `agents/triage-A05-injection.md` |
| Insecure Design | `agents/triage-A06-insecure-design.md` |
| Authentication Failures | `agents/triage-A07-authn.md` |
| Integrity Failures | `agents/triage-A08-integrity.md` |
| Logging / Monitoring | `agents/triage-A09-logging.md` |
| Unhandled Exceptions | `agents/triage-A10-exceptions.md` |
| Secrets | `agents/triage-secrets.md` |
| Deserialization | `agents/triage-deserialization.md` |

**LLM must not invent CVE IDs.** Only scanner-sourced CVE IDs may appear.

Merge outputs into `$ARTIFACTS_DIR/triaged-findings.json`.

---

### Step 6 — Devil's Advocate Critic

Read `agents/devils-advocate-critic.md` and follow it inline for all `severity: HIGH | CRITICAL` findings only. One round. The critic must produce at least one alternate hypothesis per finding considered.

---

### Step 7 — Fix Suggester

Read `agents/fix-suggester.md` and follow it inline for all `classification: TP` findings. Use `Read` to verify each cited `file:line` before suggesting a fix.

---

### Step 8 — Emit Outputs

```bash
python3 "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/normalize_findings.py" \
  --triaged "$ARTIFACTS_DIR/triaged-findings.json" \
  --sarif "$ARTIFACTS_DIR/sarif-filtered.json" \
  --repo-path "$REPO_PATH" \
  --jira-key "$JIRA_KEY" \
  --out "$ARTIFACTS_DIR/security-results.json"
```

Use `Write` to produce `$ARTIFACTS_DIR/security-report.md` with:
- Executive summary
- Scanner versions table
- Per-finding sections (file:line, severity, classification, fix)
- OWASP compliance table
- Recommendations

---

### Step 9 — Cross-Repo Aggregator (--aggregate only)

When `--aggregate` is set and more than one repo was scanned, read `agents/cross-repo-aggregator.md` and follow it inline. Write outputs to `.claude/artifacts/<JIRA_KEY>/security/cross-repo-summary.{json,md}`.

---

## SecurityResults JSON Schema

```typescript
interface SecurityResults {
  jiraKey: string;
  timestamp: string;
  languages: string[];
  overallStatus: 'PASS' | 'FAIL';
  summary: string;
  repository: { owner: string; name: string; path: string };
  sarifPath: string;
  scannerVersions: { [tool: string]: string };
  findings: {
    blocking: SecurityFinding[];
    major: SecurityFinding[];
    minor: SecurityFinding[];
  };
  metrics: {
    totalFindings: number;
    blockingCount: number;
    majorCount: number;
    minorCount: number;
    secretsFound: number;
    filesScanned: number;
    linesScanned: number;
  };
  scannerResults: { [scannerName: string]: ScannerSummary };
  owaspCompliance: { [owaspCategory: string]: 'PASS' | 'WARN' | 'CRITICAL' | 'REVIEW' };
  recommendations: string[];
  nextSteps: {
    action: 'PASS' | 'TRIGGER_REVIEW_LOOP';
    reason: string;
    blockingIssueIds?: string[];
  };
}
```

## Cross-Repo Summary Schema

```json
{
  "ticketId": "PROJ-123",
  "repos": [
    { "repo": "my-service", "path": "/abs/path", "blockingCount": 2, "majorCount": 4, "minorCount": 1, "overallStatus": "FAIL", "sarifPath": "..." }
  ],
  "crossCuttingConcerns": [
    { "kind": "shared-dep-cve", "summary": "CVE-2024-1234 in 3 repos", "evidence": ["repo-a/package.json"] }
  ],
  "dependencyOrder": ["shared-lib", "consumer-a"]
}
```

## SARIF Emission Rules

- Level mapping: `CRITICAL`/`HIGH` → `error`; `MEDIUM` → `warning`; `LOW` → `note`
- Each result must carry `fingerprints.primaryLocation`
- Suppressed findings carry `suppressions[].kind: "inSource"` and `state: "accepted"`
- SARIF version `"2.1.0"` with schema URI `https://json.schemastore.org/sarif-2.1.0.json`

## Failure Modes and Recovery

| Failure | Behaviour |
|---|---|
| Scanner binary missing | Emit `scanner-missing` finding listing `install:` command; continue |
| Scanner exits non-zero | Capture stderr in `scanner-outputs/<tool>.stderr`; continue |
| LLM triage times out | Mark group findings as `uncertain`; continue |
| SARIF consolidation fails | Abort with non-zero exit; log to stderr |
| Baseline file not readable | Warn and continue without baseline diff |

## Installing Scanners

```bash
bash "{{CONFIG_DIR}}/skills/030-quality-assurance/security-review/scripts/install_scanners.sh"
```

Idempotent; uses `brew` on macOS, `apt` on Linux, `cargo install` fallbacks.

## References

- OWASP Top 10 2025: `references/owasp-top-10-2025.md`
- SARIF 2.1.0 spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
- Semgrep rules registry: https://semgrep.dev/r
