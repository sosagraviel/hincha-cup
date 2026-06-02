---
name: qubika-jira-workflow
description: "Read Jira tickets from the Qubika DE board and translate them into Databricks pipeline tasks, following the standard ticket-to-code workflow"
version: 1.0.0
domain: workflow
owner: data-platform-team
---

# Qubika Jira → Databricks Workflow

Qubika Data Engineering work is tracked in Jira project **DE** (Data Engineering). When a developer asks you to "work on" or "implement" a Jira ticket, follow this skill to read the ticket, understand the task, and generate the right Databricks artifacts.

---

## When to Use This Skill

Use this skill when:
- A developer says "work on DE-123" or "implement ticket DE-456"
- A developer pastes a Jira ticket URL
- You need to understand what to build before generating pipeline code
- You need to update a ticket's status or add a comment after completing work

---

## Jira Project Structure

```
Project key: DE
Board:       Qubika Data Engineering
URL:         https://qubika.atlassian.net/jira/software/projects/DE

Issue types:
  Epic        — large feature area (e.g., "Salesforce Integration")
  Story       — a deliverable pipeline or data product
  Task        — a specific technical subtask (test, schema, infra)
  Bug         — data quality issue or pipeline failure

Labels used by DE board:
  bronze      — Bronze layer ingestion work
  silver      — Silver/curated transformation work
  gold        — Gold/analytics aggregation work
  streaming   — Real-time pipeline work
  quality     — Data quality or constraint work
  governance  — Unity Catalog, permissions, tagging
  testing     — Test coverage work
  infra       — Cluster, warehouse, CI/CD work
```

---

## Quick Start

```
Developer: "Work on DE-123"

You should:
1. Read the ticket with the Jira MCP tool
2. Identify the task type from labels + description
3. Map it to the right Qubika skill(s)
4. Generate the implementation
5. Summarize what you built and ask the developer to review
```

---

## Common Patterns

### Pattern 1: Reading a Ticket and Mapping to Work

**When to use:** Developer says "work on DE-XXX" — first action is always to read the ticket.

```
Step 1: Read the ticket
  → Use jira MCP tool: get_issue(issue_key="DE-123")

Step 2: Extract key fields
  → Summary:      What it is (e.g., "Ingest Salesforce Orders to Bronze")
  → Description:  Acceptance criteria, source details, table names
  → Labels:       Which layer (bronze/silver/gold/streaming)
  → Linked issues: Parent Epic, blocked-by, relates-to
  → Assignee:     Confirm it's assigned to the current developer

Step 3: Map to Qubika skills
  Label "bronze"    → use qubika-medallion-architecture (Bronze patterns)
  Label "silver"    → use qubika-medallion-architecture (Silver/MERGE patterns)
  Label "gold"      → use qubika-medallion-architecture (Gold aggregation)
  Label "streaming" → use qubika-streaming-pipelines
  Label "quality"   → use qubika-data-quality
  Label "governance"→ use qubika-unity-catalog-governance
  Label "testing"   → use qubika-pipeline-testing

Step 4: Ask one clarifying question if the description is ambiguous.
        Do not ask more than one question — make reasonable assumptions for the rest.
```

---

### Pattern 2: Standard Ticket Description Format

**When to use:** Reading a DE ticket that follows the Qubika template.

Qubika DE tickets use this format:

```
## What
[What data product needs to exist — table name, layer, schema]

## Source
[Where data comes from — system name, API, file location, Kafka topic]

## Acceptance Criteria
- [ ] Table exists at qubika_prod.curated.{domain}.{table}
- [ ] Delta constraints are in place (list them)
- [ ] Pipeline runs on schedule: {cron expression}
- [ ] Freshness SLA: {N} hours
- [ ] Tests pass in CI

## Notes
[Any specific business rules, edge cases, PII fields]
```

Extract all of these before generating code. If a field is missing, make a reasonable assumption and tell the developer what you assumed.

---

### Pattern 3: Translating a Ticket into Code

**When to use:** After reading the ticket — generating the actual pipeline.

```
Example ticket:
  Summary:   "Ingest NetSuite invoices to Bronze"
  Labels:    ["bronze", "streaming"]
  Source:    "Files land in ADLS container landing/netsuite/invoices/ as JSON"
  Target:    "qubika_prod.raw.netsuite.invoice"
  SLA:       "4 hours"

→ Apply qubika-medallion-architecture Bronze + qubika-streaming-pipelines Auto Loader pattern
→ Generated code uses:
    source_path  = "abfss://landing@qubikastorage.../netsuite/invoices/"
    bronze_table = "qubika_prod.raw.netsuite.invoice"
    checkpoint   = "abfss://checkpoints@qubikastorage.../netsuite/invoice/"
    trigger      = availableNow=True  (scheduled job, not continuous)
→ Add _ingested_at, _source_file metadata columns
→ Infer schema from first batch, store in checkpoint/_schema
```

---

### Pattern 4: Updating a Ticket After Work Is Done

**When to use:** After generating code and the developer confirms it looks good.

```
Actions to take via Jira MCP:
  1. Add a comment with a summary of what was built
  2. Transition the issue to "In Review" (not "Done" — that's after PR merge)
  3. If there's a linked PR, attach it to the ticket

Comment template:
  "Implementation complete. Generated:
   - Bronze pipeline: {file_path}
   - Table: {catalog.schema.table}
   - Schedule: {cron}
   - Tests: {test_file}
   PR: {pr_url if known}
   Ready for code review."
```

---

### Pattern 5: Bug Tickets (Data Quality Issues)

**When to use:** Ticket type is Bug and labels include "quality" or "pipeline".

```
Bug ticket fields to check:
  - Affected table: which table has wrong data?
  - Symptom:        row count drop? wrong values? null columns?
  - When started:   which pipeline run first showed the issue?
  - Impact:         which downstream consumers are affected?

Investigation steps to run (using Databricks MCP tools):
  1. Check pipeline run history:
     SELECT * FROM qubika_prod.monitoring.pipeline_runs
     WHERE table_name = '{affected_table}'
     ORDER BY run_at DESC LIMIT 20

  2. Check data quality log:
     SELECT * FROM qubika_prod.monitoring.data_quality_log
     WHERE table_name = '{affected_table}'
     ORDER BY checked_at DESC LIMIT 20

  3. Check Delta history:
     DESCRIBE HISTORY {affected_table} LIMIT 10

  4. Compare row counts before/after the issue started

Report findings to developer before suggesting a fix.
```

---

## Jira MCP Tool Reference

```
Available tools (via jira MCP server):

get_issue(issue_key)
  → Returns full issue details: summary, description, labels, status, assignee, linked issues

search_issues(jql)
  → JQL examples:
    "project = DE AND assignee = currentUser() AND status = 'In Progress'"
    "project = DE AND labels = silver AND sprint in openSprints()"
    "project = DE AND issueType = Bug AND priority = High"

add_comment(issue_key, body)
  → Adds a comment to the ticket

transition_issue(issue_key, transition_name)
  → transition_name options: "Start Progress", "In Review", "Done", "Blocked"

get_sprint(board_id)
  → Returns current sprint tickets
  → DE board_id: 42  (confirm with your team if this changes)
```

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| Starting work before reading the ticket | May build the wrong thing | Always read the ticket first |
| Asking 5 clarifying questions | Slows developer down | Ask 1 question max; assume the rest |
| Marking ticket "Done" yourself | Done is for QA/PM to mark after review | Transition to "In Review" only |
| Ignoring linked Epic context | May violate broader design decisions | Always check parent Epic |
| Generating code without checking label | Wrong layer or pattern | Labels are the primary signal for which skill to use |

---

## FAQ

| Question | Answer |
|----------|--------|
| What's the Jira project key for DE work? | `DE` |
| Where is the Jira board? | https://qubika.atlassian.net/jira/software/projects/DE |
| What if the ticket has no labels? | Ask the developer which layer (bronze/silver/gold) before proceeding |
| Can I create Jira tickets from scratch? | Yes — use `create_issue` MCP tool. Always link to a parent Epic |
| How do I find my current sprint tickets? | JQL: `project = DE AND assignee = currentUser() AND sprint in openSprints()` |

---

## Related Skills

- `qubika-medallion-architecture` — most DE tickets involve this
- `qubika-streaming-pipelines` — for streaming-labeled tickets
- `qubika-data-quality` — for quality and bug tickets
- `qubika-pipeline-testing` — always link tests to the implementation ticket

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-01-01 | Initial version |
