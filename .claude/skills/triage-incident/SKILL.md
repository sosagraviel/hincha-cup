---
name: triage-incident
description: Triage an infrastructure or application incident. Paste the issue and get a root cause analysis grounded in Datadog signals, AWS data, Confluence history, and the project codebase, plus a step-by-step runbook a DevOps/SRE can execute, saved to a markdown document. Use when user says "/triage-incident", pastes an error, alert, or describes an outage.
argument-hint: "[paste your incident description, error, or alert here]"
disable-model-invocation: true
---

# /triage-incident

**Incident to triage:**
$ARGUMENTS

---

> **MCP Setup:** See [docs/mcp-setup.md](docs/mcp-setup.md) for Datadog, AWS, and Confluence MCP installation instructions. All MCPs are optional — the skill degrades gracefully when any are absent.

---

You are a senior SRE performing incident triage. You have access to Datadog, AWS, Confluence via MCP and the project codebase. Follow each phase in order. Do not skip phases. Do not ask clarifying questions before starting — begin immediately and ask at the end if needed.

## Phase 0: Load project context

Invoke the `project-context` skill to get architecture, stack, services, and data flows.

If `project-context` is not available, read `.claude/framework-config.json` and `.claude/CLAUDE.md` directly to extract the same information.

If neither source exists, note it and continue — analysis will rely on codebase exploration and observability data only.

Expected outputs: project stack, service list, or a note that context is missing.

## Phase 1: Parse the incident

From the pasted description, extract and list:

- **Error messages** — exact strings, stack traces, exit codes
- **Affected service / component** — name as it appears in the description
- **Symptom type** — e.g. high CPU, OOM, 5xx errors, latency spike, pod crash, DB timeout
- **Environment** — prod, staging, region
- **When it started** — absolute time if mentioned, or relative (e.g. "after deploy at 14:30")
- **What changed recently** — deploys, config changes, traffic spikes, migrations

State what you extracted before moving to Phase 2.

Expected outputs: structured list of incident signals extracted from the description.

## Phase 2: Query observability data via MCP

### 2a. CloudWatch Alarms (AWS MCP)
- List alarms in ALARM state for the affected service / environment
- Note alarm name, metric, threshold, and time it triggered

### 2b. CloudWatch Metrics (AWS MCP)
- Query the key metric named in the incident (CPU, memory, error rate, latency, connection count) for the last 2 hours
- Include the metric values at alert time vs. baseline

### 2c. CloudWatch Logs (AWS MCP)
- Search log groups for the affected service
- Filter by error messages extracted in Phase 1
- Show the 10 most recent matching log lines with timestamps

### 2d. Service status (AWS MCP)
Depending on what the project uses (check `.claude/framework-config.json` or `.claude/CLAUDE.md`):
- **ECS**: describe services and tasks — show running count vs desired, recent task stop reasons
- **EKS / k8s**: describe pods — show status, restart count, OOMKilled events
- **Lambda**: recent error count and duration metrics
- **RDS / Aurora**: connection count, CPU, freeable memory, replica lag

### 2e. Recent events (AWS MCP)
- CloudTrail: any config changes, deployments, or IAM changes in the last 24h for the affected service
- EC2 / ECS / EKS events: scaling events, task replacements, node issues

### 2f. Confluence context (Atlassian MCP)
If `confluence` or `mcp__claude_ai_Atlassian__*` is available, skip silently if not.

- Search for `[service-name] runbook` — existing runbooks for this service
- Search for `[service-name] incident` — past incident reports and resolutions
- Search for `[service-name] architecture` — service design, dependencies, known limitations

Use findings to enrich root cause analysis — e.g. "previous incident in Oct 2024 had same symptom, root cause was X".

### 2g. Datadog (Datadog MCP)
If `datadog-mcp` is available, skip silently if not.

- **Active monitors** — search for monitors in ALERT or WARN state for the affected service name and tags
- **Open incidents** — list incidents matching the service or team, filtered to the incident time window
- **Logs** — search log stream for the exact error message from Phase 1, within ±1h of incident start — show 10 most recent with timestamps
- **APM traces** — search spans for the affected service filtered by `error:true` in the same time window — note operation name, error type, duration for top 5 error spans
- **Deployment events** — search Datadog events for deploy markers (`source:github`, `source:jenkins`, `deployment`) within 2h before incident start
- **Watchdog insights** — check for anomaly or outlier stories for the affected service

Cross-reference Datadog findings with AWS data from 2a–2e. If both available, note whether they agree or contradict.

State a brief summary of what all observability sources returned before moving to Phase 3.

Expected outputs: observability data from each available MCP sub-phase, plus a summary paragraph.

## Phase 3: Explore the codebase

Use Read, Grep, and Glob to find evidence in the project:

1. **Grep for the exact error string** — find where it originates in code
2. **Find config for the affected service** — connection pool size, timeout values, memory limits, replica counts, autoscaling policy
3. **Check infrastructure definitions** — k8s manifests, ECS task definitions, Terraform/CDK, `docker-compose.yml`
4. **Look for the specific resource limits** relevant to the symptom type:
   - OOM → memory limits in task def / k8s manifest / Node.js `--max-old-space-size`
   - DB timeout → pool size, query timeout, max connections
   - High CPU → compute allocation, inefficient queries, missing indexes
   - 5xx spike → downstream dependency timeouts, circuit breaker config
5. **Check recent changes** — `git log --oneline -20` if git is available

State the key findings before moving to Phase 4.

Expected outputs: relevant code locations, config values, and recent git changes.

## Phase 4: Correlate and determine root cause

Combine all observability signals (Datadog + AWS + Confluence) with codebase findings to answer:

1. **What exactly is failing?** (specific resource, service, component)
2. **Why is it failing?** (the actual technical cause — config limit, code bug, infra sizing, cascading failure)
3. **What triggered it?** (deploy, traffic spike, data growth, dependency failure, scheduled job)
4. **Is it still happening?** (based on current monitor/alarm state)
5. **Has this happened before?** (from Confluence or Datadog incident history)

Assign a confidence level: **HIGH** (direct evidence from multiple sources) / **MEDIUM** (strong inference from one source) / **LOW** (hypothesis only).

Expected outputs: root cause statement with confidence level and evidence citations.

## Phase 5: Generate the incident report and runbook

Output the following structured report. Write every step in the runbook as if a junior DevOps engineer with no prior knowledge of this system will execute it — include exact commands, AWS console paths, and expected outputs.

---

## Incident Report

**Date:** [current date/time]
**Severity:** 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW
**Status:** 🔥 ONGOING / ✅ RESOLVED / ⚠️ DEGRADED

---

### Summary
One sentence: what is broken and why.

### Root Cause
Detailed technical explanation. Reference specific evidence:
- Datadog monitor name, incident title, or APM span detail (if Datadog MCP was available)
- AWS metric/alarm name and value (if AWS MCP was available)
- File path and line number from codebase
- Config value that is wrong or insufficient

**Confidence:** HIGH / MEDIUM / LOW — [reason]

**Data sources used:** [list which MCPs returned data — Datadog / AWS / Confluence / codebase only]

### Affected Resources
| Resource | Type | Region | Status |
|----------|------|--------|--------|
| `service-name` | ECS Service / EKS Deployment / RDS | us-east-1 | DEGRADED |

### Timeline
- `HH:MM` — [what happened, based on observability events]
- `HH:MM` — [next event]

---

### Runbook — Step by Step

> ⚠️ **Before you start:** Read all steps first. Steps marked 🔴 are irreversible — double-check before executing.

#### Immediate mitigation (stop the bleeding)

**Step 1 — Verify the issue is still active**
```bash
# Replace <service-name> and <region> with actual values
aws cloudwatch describe-alarms \
  --alarm-names "<alarm-name>" \
  --region <region> \
  --query "MetricAlarms[*].{Name:AlarmName,State:StateValue,Reason:StateReason}"
```
Expected output: `"StateValue": "ALARM"` confirms issue is active. If `"StateValue": "OK"`, issue may have self-resolved — continue monitoring but skip mitigation.

**Step 2 — [first mitigation action]**
```bash
# exact command here
```
What this does: [plain English explanation]
Expected output: [what they should see]

**Step 3 — Verify mitigation worked**
```bash
# verification command
```
Expected output: [what confirms it worked]

#### Root cause fix (permanent)

**Step 4 — [fix action]**

File to change: `[path/to/file]`

Before:
```
[current value]
```
After:
```
[correct value]
```

Why: [plain English explanation of why this fixes it]

**Step 5 — Deploy the fix**
```bash
# deploy command appropriate to the stack
```

**Step 6 — Verify fix in production**
```bash
# verification command
```
Expected output: [what confirms it's fixed]
Watch for: [what to monitor for 15 min after fix]

#### Rollback (if fix makes things worse)

🔴 **Step R1 — Rollback**
```bash
# rollback command
```

---

### Prevention

What to do so this doesn't happen again:
1. **Config change** — [specific value to update, file/path]
2. **Alarm** — [new CloudWatch/Datadog monitor to add, with threshold]
3. **Runbook** — [link this document or note where to store it]

### What to watch after resolution
- **Metric to monitor:** [name and normal range]
- **Log pattern to watch for:** `[log string]`
- **Time to stable:** expect recovery within [N] minutes after fix applied

---

Expected outputs: complete Incident Report with all sections populated from actual data.

## Phase 6: Save report to markdown file

After generating the full report in Phase 5, save it to disk.

1. Output path: `.claude/triage-reports/YYYY-MM-DD-{affected-service}-triage.md`
   - Create directory if it does not exist
   - If service name cannot be determined, use `incident` as the name
2. File content: the complete Incident Report generated in Phase 5
3. Use the Write tool to create the file
4. After writing, output:
```
✅ Triage report saved to: .claude/triage-reports/YYYY-MM-DD-{service}-triage.md
```

Expected outputs: triage report file written to disk, confirmation message printed.

---

## Rules

- Every AWS resource name, Datadog monitor name, metric value, and config value in the report must come from actual data retrieved in Phase 2 or Phase 3 — no invented values
- If a Phase 2 sub-phase returns no data (MCP not configured or no matching resources), state this clearly and continue
- If root cause cannot be determined with confidence, set confidence to LOW and explain what additional data is needed
- Runbook commands must be copy-pasteable — no placeholders left unfilled if the actual value was found
- Phase 6 always runs — the markdown file must always be saved
