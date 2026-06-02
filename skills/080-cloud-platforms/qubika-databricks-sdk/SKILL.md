---
name: qubika-databricks-sdk
description: "Use the Databricks Python SDK following Qubika conventions — profile-based auth, named catalogs, async-safe call patterns. Foundation skill for any Python code that talks to Databricks (jobs, UC, SQL, serving, secrets)."
version: 1.0.0
domain: foundation
owner: data-platform-team
---

# Qubika Databricks Python SDK

Most Qubika data engineering Python code talks to Databricks through `databricks-sdk` (`WorkspaceClient`). This skill is the foundation other Qubika skills depend on — it teaches *how* to authenticate, *which* SDK method to reach for, and the call patterns that avoid the traps (blocking event loops, swallowed pagination, missed `Wait` objects).

If a teammate's code uses `WorkspaceClient`, `databricks.connect`, or shells out to the `databricks` CLI, this is the skill that informs the review.

**Upstream docs:** https://databricks-sdk-py.readthedocs.io/en/latest/

---

## When to Use This Skill

Use this skill when:
- Writing Python that creates, lists, or mutates Databricks resources (jobs, clusters, warehouses, pipelines, catalogs, schemas, tables, volumes, secrets, serving endpoints, vector indexes)
- Choosing between SDK / Databricks Connect / CLI / raw REST for a given operation
- Wrapping SDK calls inside a FastAPI / async service (this is where most Qubika SDK bugs live)
- Building an internal tool that needs Qubika's profile-based authentication
- Reviewing code that authenticates with a bare PAT instead of a profile

Do NOT use this skill when:
- Authoring `databricks.yml` or `resources/*.yml` bundle files — that's [[qubika-databricks-bundles]] (skill not yet shipped — see backlog Tier 1)
- Writing DLT pipeline code (`@dlt.table` decorators) — that's `qubika-dlt-meta`
- Authoring dbt models — that's `qubika-dbt-integration`
- Migrating SQL dialects — that's `qubika-lakebridge`

---

## Quick Start

The canonical "am I connected" snippet — drop into any Python file or notebook:

```python
from databricks.sdk import WorkspaceClient

# Reads DATABRICKS_CONFIG_PROFILE from env, falls back to [DEFAULT] in ~/.databrickscfg
w = WorkspaceClient()

print(f"Connected as : {w.current_user.me().user_name}")
print(f"Workspace    : {w.config.host}")
print(f"Account ID   : {w.config.account_id}")

for warehouse in w.warehouses.list():
    print(f"  {warehouse.name:30s}  {warehouse.state.value}")
```

Run it:

```bash
export DATABRICKS_CONFIG_PROFILE=claudecode-seba  # or whatever your profile is
python sanity.py
```

Expected output:
```
Connected as : sebastian.diaz@qubika.com
Workspace    : https://dbc-b8652565-9e89.cloud.databricks.com
Account ID   : <uuid>
  Starter Warehouse              RUNNING
  ...
```

If `current_user.me()` raises `Unauthenticated`, your profile token is stale — run `databricks auth login --profile <name>` to refresh.

---

## Common Patterns

### Pattern 1: Picking the right tool

The SDK is one of four ways to drive Databricks. Pick deliberately:

| Need                                        | Use                                | Why                                                                 |
|---------------------------------------------|------------------------------------|---------------------------------------------------------------------|
| Create/list/mutate platform resources       | **SDK** (`WorkspaceClient`)        | Typed responses, paging baked in, future-proof                      |
| Run Spark code locally against a cluster    | **Databricks Connect**             | `DatabricksSession.builder` — feels like local Spark                |
| Quick one-off from your shell               | **CLI** (`databricks ...`)         | Best for interactive ops; never script around it from Python        |
| New API not yet in the SDK                  | **`w.api_client.do(...)`**         | Direct REST under SDK auth — only when SDK lacks the method         |

**Anti-pattern**: shelling out to the CLI from Python (`subprocess.run(["databricks", ...])`). Always use the SDK from Python; reserve the CLI for terminals and `install.sh`.

```python
# ✓ CORRECT — SDK from Python
from databricks.sdk import WorkspaceClient
w = WorkspaceClient()
for job in w.jobs.list():
    print(job.settings.name)

# ❌ WRONG — CLI from Python
import subprocess, json
out = subprocess.run(["databricks", "jobs", "list", "--output", "json"], capture_output=True, text=True)
jobs = json.loads(out.stdout)  # brittle, untyped, slow
```

---

### Pattern 2: Authentication — Qubika conventions

Qubika uses **profile-based auth** (`~/.databrickscfg`) for every human and CI runner. PATs are never written into code, never committed to repos, and never passed as constructor args in shared code.

**Profile naming convention:**

```
[DEFAULT]            ← do not rely on this — it's whatever was set up last
[claudecode-seba]    ← per-user Claude Code profile (OAuth-backed)
[dev]                ← workspace alias (qubika dev workspace)
[staging]            ← workspace alias (qubika staging workspace)
[prod]               ← workspace alias (qubika prod workspace — read-only for most DEs)
```

Per-user `claudecode-*` profiles are for interactive work. Workspace aliases (`dev`/`staging`/`prod`) are for scripts and Asset Bundles.

**Code patterns:**

```python
from databricks.sdk import WorkspaceClient

# Pattern A — let env decide. THIS IS THE DEFAULT FOR QUBIKA CODE.
# Caller sets DATABRICKS_CONFIG_PROFILE=staging before running.
w = WorkspaceClient()

# Pattern B — explicit profile. OK in CLI tools where the profile is a flag.
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--profile", default="dev")
args = parser.parse_args()
w = WorkspaceClient(profile=args.profile)

# Pattern C — service principal (CI, scheduled jobs). Read from Databricks secret scope.
# ❌ Never hardcode the token; always read from a secret backend.
w = WorkspaceClient(
    host=os.environ["DATABRICKS_HOST"],
    client_id=os.environ["DATABRICKS_CLIENT_ID"],
    client_secret=os.environ["DATABRICKS_CLIENT_SECRET"],
)
```

**Key points:**
- Never write `WorkspaceClient(host=..., token="dapi...")` with a literal token in committed code.
- For local dev, OAuth-backed profiles auto-refresh — prefer them over PATs.
- For CI / scheduled work, use a Service Principal with client-credentials grant.
- `DATABRICKS_HOST` + `DATABRICKS_TOKEN` env vars work too, but profile-based wins because it stays portable across `dev`/`staging`/`prod`.

---

### Pattern 3: Executing SQL

For one-shot queries from Python, use the **Statement Execution API** — it doesn't require a notebook, just a SQL warehouse.

```python
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

w = WorkspaceClient()

# Pick a warehouse — never hardcode the ID. Look it up by name.
warehouse = next(wh for wh in w.warehouses.list() if wh.name == "Starter Warehouse")

resp = w.statement_execution.execute_statement(
    warehouse_id=warehouse.id,
    statement="""
        SELECT count(*) AS n
        FROM qubika_dev.curated.marketing.events
        WHERE event_date >= current_date() - INTERVAL 7 DAYS
    """,
    wait_timeout="30s",
)

if resp.status.state != StatementState.SUCCEEDED:
    raise RuntimeError(f"Query failed: {resp.status.error.message}")

print(resp.result.data_array)
```

**Key points:**
- Always fully qualify tables (`qubika_dev.curated.marketing.events`, not `events`). The skill `qubika-unity-catalog-governance` covers naming.
- `wait_timeout` is a string with unit (`"30s"`, `"5m"`). Max is `"50s"` for sync; longer queries return a `statement_id` you poll.
- For large results, page with `get_statement_result_chunk_n` — the first chunk comes back inline.

---

### Pattern 4: Inspecting Unity Catalog

The most common Qubika SDK use case — "what tables exist, who owns them, when were they last touched."

```python
from databricks.sdk import WorkspaceClient
w = WorkspaceClient()

# Walk all catalogs you can see
for catalog in w.catalogs.list():
    if not catalog.name.startswith("qubika_"):
        continue  # ignore system + finops + shared

    for schema in w.schemas.list(catalog_name=catalog.name):
        for table in w.tables.list(catalog_name=catalog.name, schema_name=schema.name):
            print(f"{table.full_name:60s} {table.owner:30s} {table.updated_at}")

# Existence check (cheap — does not fetch full metadata)
if w.tables.exists(full_name="qubika_prod.curated.marketing.events").table_exists:
    print("table exists")

# Get one table's columns
t = w.tables.get(full_name="qubika_dev.curated.marketing.events")
for c in t.columns:
    print(f"  {c.name:30s} {c.type_text:20s} {c.comment or '(no comment)'}")
```

**Key points:**
- `tables.list()` is paged automatically when you iterate it — don't add manual `page_token` plumbing.
- `tables.get()` is a network call per table. For bulk scans, prefer `tables.list()` and only `.get()` the tables you actually need to drill into. This is the same pattern `/de-audit --catalogs` uses.
- Catalog/schema filters apply at the API level. Don't fetch everything and `.filter()` in Python — it's 10–100x slower.

---

### Pattern 5: Long-running operations — the `Wait` object

Several SDK methods (`clusters.create`, `clusters.start`, `warehouses.start`, `jobs.run_now`) return immediately with a `Wait[T]` object instead of the final resource. You must call `.result()` (blocking) or use the `*_and_wait` variant to get the resolved object.

```python
from datetime import timedelta
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

# Style A — fire and wait
cluster = w.clusters.create_and_wait(
    cluster_name="qubika-ephemeral",
    spark_version=w.clusters.select_spark_version(latest=True, long_term_support=True),
    node_type_id=w.clusters.select_node_type(min_memory_gb=16, local_disk=True),
    num_workers=2,
    autotermination_minutes=30,
    timeout=timedelta(minutes=15),
)
print(f"Up: {cluster.cluster_id}")

# Style B — fire-and-forget, wait later
wait = w.clusters.start(cluster_id="0123-456789-abcdef")
# ... do other work ...
cluster = wait.result(timeout=timedelta(minutes=10))

# Style C — start without waiting (test harnesses, fire-then-poll-elsewhere)
w.clusters.start(cluster_id="0123-456789-abcdef")  # discards the Wait — you won't see failures here
```

**Key points:**
- The `Wait` object is the source of truth for *failures*. Discarding it (Style C) hides errors silently — only do it in tests where another check verifies the outcome.
- `autotermination_minutes` on every ephemeral cluster you create from a script. Forgetting this is how Qubika DEs leak DBUs into the [[qubika-finops-catalog]] dashboards.

---

### Pattern 6: Async services (FastAPI, asyncio) — **CRITICAL**

**The Databricks SDK is fully synchronous.** Every call blocks the calling thread. In an async server (FastAPI, Starlette, aiohttp), a single un-wrapped SDK call freezes the event loop until it returns — which on a `clusters.create_and_wait` can be 10 minutes.

```python
import asyncio
from fastapi import FastAPI
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()
app = FastAPI()

# ❌ WRONG — blocks the event loop for every other request on this worker
@app.get("/clusters-bad")
async def list_clusters_bad():
    return [c.cluster_name for c in w.clusters.list()]  # BLOCKS!

# ✓ CORRECT — runs the SDK call in a thread pool
@app.get("/clusters")
async def list_clusters():
    clusters = await asyncio.to_thread(lambda: list(w.clusters.list()))
    return [c.cluster_name for c in clusters]

# ✓ CORRECT — for simple single-call methods
@app.get("/cluster/{cluster_id}")
async def get_cluster(cluster_id: str):
    cluster = await asyncio.to_thread(w.clusters.get, cluster_id)
    return {"id": cluster.cluster_id, "state": cluster.state.value}
```

**Key points:**
- `asyncio.to_thread` runs the call on the default executor — fine for most cases. Use a dedicated executor if you have >100 concurrent SDK calls.
- `w.config.host` / `w.config.account_id` are property reads, NOT network calls. They don't need `asyncio.to_thread`.
- This is the #1 source of "FastAPI app gets slow under load" reports inside Qubika. If you're code-reviewing an async file that imports `databricks.sdk`, search for raw `w.*` calls outside `asyncio.to_thread`.

---

### Pattern 7: Pagination

All `*.list()` methods on the SDK return an iterator that *transparently* pages. You almost never need to think about `page_token`.

```python
# ✓ CORRECT — iterator handles paging
for job in w.jobs.list():
    print(job.settings.name)

# ❌ WRONG — pretends pagination doesn't exist by indexing
all_jobs = list(w.jobs.list())[:50]  # this still fetches every page first
```

If you only want the first N items, break the loop:

```python
seen = []
for job in w.jobs.list():
    seen.append(job)
    if len(seen) >= 50:
        break
```

---

### Pattern 8: Error handling

The SDK raises typed exceptions from `databricks.sdk.errors`. Catch the specific class, never bare `Exception`.

```python
from databricks.sdk.errors import NotFound, PermissionDenied, ResourceAlreadyExists

try:
    w.tables.get(full_name="qubika_prod.curated.marketing.does_not_exist")
except NotFound:
    print("table missing — fall back to listing the schema")
except PermissionDenied:
    print("not your catalog — ask the owner")
```

For retryable transient errors, the SDK already retries internally (HTTP 5xx, rate limits). Don't add a second retry layer on top.

---

## Anti-Patterns

| Anti-pattern                                                | Why it's wrong                                         | Correct alternative                                              |
|-------------------------------------------------------------|--------------------------------------------------------|------------------------------------------------------------------|
| `WorkspaceClient(host=..., token="dapi...")` in committed code | Leaks a credential into git history                   | Use `WorkspaceClient()` with `DATABRICKS_CONFIG_PROFILE`         |
| `subprocess.run(["databricks", ...])` from Python           | Brittle, untyped, no auth flow                         | Use the SDK directly                                              |
| Raw `w.*.list()` inside `async def` (no `to_thread`)        | Freezes the event loop                                 | `await asyncio.to_thread(lambda: list(w.*.list()))`              |
| Hardcoded warehouse IDs                                     | Breaks on workspace move; opaque to readers            | `next(wh for wh in w.warehouses.list() if wh.name == "...")`     |
| Discarding the `Wait` object on cluster create / job run    | Silent failures — caller never sees the error          | Use `*_and_wait` or call `.result()`                              |
| Ephemeral cluster without `autotermination_minutes`         | DBU leak — surfaces in [[qubika-finops-catalog]] later | Always set `autotermination_minutes` (≤30 for transient work)    |
| Logging `WorkspaceClient` instance or `w.config` to stdout  | May include the token                                  | Log only what you need: `w.config.host`, `w.current_user.me()`   |

---

## Reference

**External**

- Python SDK reference — https://databricks-sdk-py.readthedocs.io/en/latest/
- Authentication — https://databricks-sdk-py.readthedocs.io/en/latest/authentication.html
- SDK GitHub — https://github.com/databricks/databricks-sdk-py
- Clusters API — https://databricks-sdk-py.readthedocs.io/en/latest/workspace/compute/clusters.html
- Jobs API — https://databricks-sdk-py.readthedocs.io/en/latest/workspace/jobs/jobs.html
- Statement Execution — https://databricks-sdk-py.readthedocs.io/en/latest/workspace/sql/statement_execution.html
- Unity Catalog (catalogs/schemas/tables) — https://databricks-sdk-py.readthedocs.io/en/latest/workspace/catalog/
- Serving Endpoints — https://databricks-sdk-py.readthedocs.io/en/latest/workspace/serving/serving_endpoints.html
- Vector Search — https://databricks-sdk-py.readthedocs.io/en/latest/workspace/vectorsearch/

**Internal**

- `/de-check` — verifies your `.databrickscfg` profile is reachable
- `scripts/audit/workspace_scanner.py` — the canonical "SDK-driven scanner" inside this kit, worth reading as a real-world example
- `agents/qubika-cost-investigator.md` — another SDK consumer (system.* queries via warehouse + SDK)

---

## FAQ

| Question | Answer |
|----------|--------|
| Should I use `databricks-sql-connector` instead of `WorkspaceClient.statement_execution`? | Only if you need PEP 249 / DB-API 2 semantics (cursors, `fetchall`) inside an existing data-access layer. For everything else, `statement_execution` is simpler. |
| How do I pass complex types as parameters to a SQL query? | Use named parameters in `execute_statement(parameters=[...])` — the SDK marshals them safely. Don't f-string SQL. |
| Does the SDK work in a Databricks notebook? | Yes — `WorkspaceClient()` auto-detects notebook context. You don't need a profile. |
| How do I authenticate as a service principal locally for testing? | Set `DATABRICKS_CLIENT_ID` + `DATABRICKS_CLIENT_SECRET` + `DATABRICKS_HOST` env vars. Don't share these creds — request a personal SP from `#data-engineering`. |
| Why does my `clusters.create` return immediately with no cluster ID? | You got a `Wait[ClusterDetails]` — call `.result()` to block, or use `create_and_wait`. |
| Can I share one `WorkspaceClient` across threads? | Yes — `WorkspaceClient` is thread-safe. Don't construct one per request. |

---

## Related Skills

- `qubika-unity-catalog-governance` — catalog/schema/table conventions the SDK operates against
- `qubika-medallion-architecture` — pipeline patterns whose orchestration uses the SDK
- `qubika-monitoring-observability` — job alerts and freshness checks built on `w.jobs.*`
- `qubika-pipeline-testing` — pytest patterns that mock or hit `WorkspaceClient`
- *(future)* `qubika-databricks-bundles` — DAB authoring (see backlog Tier 1)

---

## Changelog

| Version | Date       | Change          |
|---------|------------|-----------------|
| 1.0.0   | 2026-05-21 | Initial version |
