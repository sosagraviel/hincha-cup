---
name: qa-camunda
description: QA test Wayfinder changes in Camunda staging by starting process instances and validating execution. Use when the user wants to test a Wayfinder branch in Camunda, validate BPMN changes, or start a process instance in staging.
version: 1.0.0
category: quality-assurance
last_updated: 2026-06-10
---

# QA Camunda - Wayfinder Process Testing

Test Wayfinder branch changes against the Camunda staging environment by starting process instances and validating that tasks execute correctly.

## Environment

This skill talks to a Camunda REST API whose host is **project-specific** and must not be
hardcoded. Resolve it once via the `CAMUNDA_REST_BASE` environment variable (see step 0); every
command below uses `${CAMUNDA_REST_BASE}`.

- **Camunda REST base:** `CAMUNDA_REST_BASE` — the engine-rest base URL for your environment, e.g. `https://<your-camunda-host>/engine-rest`

## Instructions

### 0. Resolve the Camunda host

Every REST call below uses the `CAMUNDA_REST_BASE` env var so the skill works on any project with
no hardcoded host. Set it before doing anything else:

```bash
echo "CAMUNDA_REST_BASE=${CAMUNDA_REST_BASE:-UNSET}"
```

If it prints `UNSET`, ask the user for their Camunda engine-rest base URL and export it for the
rest of the session:

```bash
export CAMUNDA_REST_BASE="https://<your-camunda-host>/engine-rest"
```

Never hardcode a real host into this skill — it ships to every Camunda/BPMN project.

### 1. Identify the BPMN and Changes

1. Run `git diff --name-only master..HEAD` to find modified `.bpmn` files
2. Run `git diff master..HEAD -- <file>.bpmn` to understand flow changes
3. Identify which process definition key is affected (e.g., `Process_ErrorHandler`)

### 2. Check the Deployed Version

1. Ask the user which version was deployed or check via:
```bash
curl -s "${CAMUNDA_REST_BASE}/process-definition?key=PROCESS_KEY&latestVersion=true" | python3 -m json.tool
```

### 3. Start a Process Instance

Use the REST API to start an instance. **Critical variable types:**

| Variable | Type | Notes |
|----------|------|-------|
| `category_name` | String | Must be a real category in staging (e.g., `Transcoding`, `XML`, `service`) |
| `sub_category_name` | String | Must be real (e.g., `InletServiceError`, `UpdateXMLServiceError`, `roa`) |
| `error_handler` | String | Error handler identifier |
| `error_handling_task` | **Boolean** | MUST be Boolean `true`/`false`, NOT String. Gates the user task path |
| `error_msg` | String | The error message content |
| `task_name` | String | Task name |
| `process_instance` | String | Parent process instance ID (for `failed_activity_id` resolution) |

**Known valid category/sub_category pairs in staging:**
- `Transcoding` / `InletServiceError`
- `Transcoding` / `TracksErrors`
- `XML` / `UpdateXMLServiceError`
- `service` / `roa`

**Start instance command:**
```bash
curl -s -X POST "${CAMUNDA_REST_BASE}/process-definition/key/PROCESS_KEY/start" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "category_name": {"value": "Transcoding", "type": "String"},
      "sub_category_name": {"value": "InletServiceError", "type": "String"},
      "error_handler": {"value": "test_error_handler", "type": "String"},
      "error_handling_task": {"value": true, "type": "Boolean"},
      "error_msg": {"value": "<html>502 Bad Gateway</html>", "type": "String"},
      "task_name": {"value": "test_task", "type": "String"}
    },
    "businessKey": "TICKET_KEY-manual-test"
  }'
```

### 4. Validate Execution

After starting an instance, validate in this order:

**a) Check activity tree (where is the process now?):**
```bash
curl -s "${CAMUNDA_REST_BASE}/process-instance/INSTANCE_ID/activity-instances" | python3 -m json.tool
```

**b) Check variables were set:**
```bash
curl -s "${CAMUNDA_REST_BASE}/process-instance/INSTANCE_ID/variables/VARIABLE_NAME"
```

**c) Check for failed jobs:**
```bash
curl -s "${CAMUNDA_REST_BASE}/job?processInstanceId=INSTANCE_ID" | python3 -m json.tool
```

**d) Check incidents:**
```bash
curl -s "${CAMUNDA_REST_BASE}/incident?processInstanceId=INSTANCE_ID" | python3 -m json.tool
```

**e) Check history (may be empty for recent deployments due to 7-day TTL):**
```bash
curl -s "${CAMUNDA_REST_BASE}/history/activity-instance?processInstanceId=INSTANCE_ID&activityId=ACTIVITY_ID" | python3 -m json.tool
```

### 5. Common Failure Patterns

| Error | Cause | Fix |
|-------|-------|-----|
| `condition expression returns non-Boolean` | Variable passed as String but gateway expects Boolean | Change type to `"type": "Boolean"` |
| `error_handling_task parameter is required` | Missing `error_handling_task` variable | Add it as Boolean |
| `Category 'X' and subcategory 'Y' not found` (404) | Invalid category/sub_category | Use known valid pairs from the list above |
| Job stuck with 0 retries | Async job failed | Check `exceptionMessage` in job response |
| History API returns empty `[]` | History cleanup (P7D TTL) or different DB partition | Use runtime API instead |

### 6. Test Scenarios Template

For a typical ErrorHandler change, run these scenarios:

1. **Happy path** - all required variables, valid category, expect process to reach `User_Task_ErrorHandling`
2. **Retryable error** - `error_msg` containing `<html>` + `502` or `504` → `activity_retryable = true`
3. **Non-retryable error** - `error_msg` without HTML/502/504 pattern → `activity_retryable = false`
4. **Real parent process** - provide `process_instance` variable pointing to a real running instance to test `failed_activity_id` resolution

### 7. Cleanup

After testing, optionally delete test instances:
```bash
curl -s -X DELETE "${CAMUNDA_REST_BASE}/process-instance/INSTANCE_ID?skipCustomListeners=true&skipIoMappings=true"
```

### 8. Reporting Results

Present a summary table:

| Test | Business Key | Expected | Actual | Status |
|------|-------------|----------|--------|--------|
| Happy path | TICKET-test-1 | Reaches user task | ... | PASS/FAIL |
| Retryable | TICKET-test-2 | `activity_retryable=true` | ... | PASS/FAIL |
| Non-retryable | TICKET-test-3 | `activity_retryable=false` | ... | PASS/FAIL |
