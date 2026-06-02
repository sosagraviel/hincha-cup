---
name: qubika-saas-api-ingestion
description: "Ingest data from SaaS REST APIs (HubSpot, Salesforce, Zendesk, Stripe) into Bronze using secret-scope auth, cursor pagination, incremental watermarks, and retry/backoff"
version: 1.0.0
domain: data-engineering
owner: data-engineering
---

# SaaS API Ingestion

Pull data from SaaS REST APIs into a Bronze Delta table on Databricks following Qubika conventions. Covers token storage in Databricks secret scopes, cursor pagination, incremental loads with a modified-at watermark, retry/backoff on 429/5xx, and the raw-payload-plus-typed-projection Bronze layout.

This skill is the SaaS-API counterpart to `qubika-federated-ingestion` (JDBC databases) and `qubika-streaming-pipelines` (file landing / Auto Loader).

---

## When to Use This Skill

Use this skill when:
- A DE asks to ingest data from a SaaS product's REST API (HubSpot, Salesforce, Zendesk, Stripe, Intercom, Pipedrive, etc.)
- The source emits JSON over HTTPS, paginated by cursor or offset
- The pipeline needs to land raw data in Bronze and run on a schedule (daily/hourly)

Do NOT use this skill when:
- The source is a JDBC database → use `qubika-federated-ingestion`
- The source drops files into S3/ADLS/GCS → use `qubika-streaming-pipelines` (Auto Loader)
- The source is a Kafka topic or other streaming feed → use `qubika-kafka-patterns`
- The source is already landed by Fivetran or another connector → use `qubika-medallion-architecture` starting at Silver
- You're calling an API to *enrich* an existing table (UDF / per-row HTTP call) — that is not Bronze ingestion

---

## Quick Start

Pull HubSpot companies into Bronze with incremental watermark, cursor pagination, and retry.

```python
import requests, time, random
from pyspark.sql import functions as F

CATALOG = "qubika_dev"
SCHEMA  = "hubspot_bronze"
TABLE   = "companies"
SECRET_SCOPE = "qubika-hubspot"
SECRET_KEY   = "private-app-token"

token = dbutils.secrets.get(scope=SECRET_SCOPE, key=SECRET_KEY)
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Read the high-water mark from the existing Bronze table (defaults to epoch on first run)
watermark = spark.sql(
    f"SELECT coalesce(max(updated_at), TIMESTAMP'1970-01-01') AS w "
    f"FROM {CATALOG}.{SCHEMA}.{TABLE}"
).collect()[0]["w"]
watermark_ms = int(watermark.timestamp() * 1000)

def get_with_retry(url, params, max_attempts=5):
    for attempt in range(max_attempts):
        r = requests.get(url, headers=headers, params=params, timeout=30)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 500, 502, 503, 504):
            wait = float(r.headers.get("Retry-After", 0)) or min(2 ** attempt + random.uniform(0, 1), 60)
            time.sleep(wait)
            continue
        r.raise_for_status()
    raise RuntimeError(f"Exhausted retries for {url}")

after, rows = None, []
url = "https://api.hubapi.com/crm/v3/objects/companies"
while True:
    params = {
        "limit": 100,
        "properties": "domain,name,industry,createdate,hs_lastmodifieddate",
        "filterGroups": [{"filters": [{
            "propertyName": "hs_lastmodifieddate",
            "operator": "GTE",
            "value": str(watermark_ms),
        }]}],
    }
    if after:
        params["after"] = after
    payload = get_with_retry(url, params)
    rows.extend(payload.get("results", []))
    after = payload.get("paging", {}).get("next", {}).get("after")
    if not after:
        break

# Land raw payload AND a typed projection
df = (
    spark.createDataFrame([(str(r),) for r in rows], schema="raw_payload STRING")
    .withColumn("payload_json", F.from_json("raw_payload", "MAP<STRING,STRING>"))
    .withColumn("id",         F.col("payload_json")["id"])
    .withColumn("updated_at", F.to_timestamp(F.col("payload_json")["updatedAt"]))
    .withColumn("created_at", F.to_timestamp(F.col("payload_json")["createdAt"]))
    .withColumn("ingested_at", F.current_timestamp())
    .drop("payload_json")
)

# Idempotent MERGE — re-running the same watermark window doesn't duplicate
df.createOrReplaceTempView("staging_companies")
spark.sql(f"""
    MERGE INTO {CATALOG}.{SCHEMA}.{TABLE} AS t
    USING staging_companies AS s
    ON t.id = s.id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")
```

Expected output:
```
Pulled 1,247 companies from HubSpot (watermark: 2026-05-17T06:30:00Z)
Merged into qubika_dev.hubspot_bronze.companies: 1,247 rows affected
```

---

## Common Patterns

### Pattern 1: Incremental with watermark

**When to use:** API exposes a `lastModifiedAt` / `updatedAt` filter and the dataset grows large enough that full refetches are wasteful.

```python
# Read existing high-water mark from Bronze
watermark = spark.sql(
    f"SELECT coalesce(max(updated_at), TIMESTAMP'1970-01-01') AS w "
    f"FROM {CATALOG}.{SCHEMA}.{TABLE}"
).collect()[0]["w"]

# Most SaaS APIs want this as ISO or epoch ms — convert at the boundary
params = {"updatedSince": watermark.isoformat()}                       # Salesforce-style
params = {"filterGroups": [{"filters": [{                              # HubSpot-style
    "propertyName": "hs_lastmodifieddate",
    "operator": "GTE",
    "value": str(int(watermark.timestamp() * 1000)),
}]}]}
```

**Key points:**
- Persist the high-water mark in the Bronze table itself (`max(updated_at)`), not in a separate state table — fewer moving parts.
- On the first run the table is empty so `max()` is NULL — `coalesce(..., TIMESTAMP'1970-01-01')` fetches everything.
- Overlap the watermark window by 5–10 min to catch records modified during the previous run.

---

### Pattern 2: Cursor pagination + retry/backoff

**When to use:** Every SaaS API call. Pagination shape varies (`paging.next.after`, `next_page_token`, `Link` header) but the loop is always the same.

```python
def paginate(url, params, headers, cursor_extractor, max_attempts=5):
    """Yield pages until cursor returns None. Retries 429/5xx with backoff."""
    cursor = None
    while True:
        page_params = {**params, **({"after": cursor} if cursor else {})}
        for attempt in range(max_attempts):
            r = requests.get(url, headers=headers, params=page_params, timeout=30)
            if r.status_code == 200:
                payload = r.json()
                break
            if r.status_code in (429, 500, 502, 503, 504):
                wait = float(r.headers.get("Retry-After", 0)) or min(2 ** attempt + random.uniform(0, 1), 60)
                time.sleep(wait)
            else:
                r.raise_for_status()
        else:
            raise RuntimeError(f"Exhausted retries for {url}")
        yield payload
        cursor = cursor_extractor(payload)
        if not cursor:
            return

# HubSpot
for page in paginate(url, params, headers, lambda p: p.get("paging", {}).get("next", {}).get("after")):
    rows.extend(page["results"])

# Stripe
for page in paginate(url, params, headers, lambda p: p["data"][-1]["id"] if p.get("has_more") else None):
    rows.extend(page["data"])
```

**Key points:**
- Respect `Retry-After` when the API sends it (HubSpot, Stripe do). Fall back to exponential backoff with jitter.
- Cap individual backoff at 60s — beyond that, the API is down. Fail loud, don't sleep forever.
- Don't retry on 4xx other than 429 — client errors won't fix themselves.

---

### Pattern 3: Full snapshot refresh

**When to use:** Small endpoints (<10k rows), seed loads, or APIs without any modified-at filter.

```python
# Same cursor loop as Pattern 2, but no watermark filter
rows = []
for page in paginate(url, {"limit": 100}, headers, cursor_fn):
    rows.extend(page["results"])

# CREATE OR REPLACE — no MERGE needed when refetching everything
df.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA}.{TABLE}")
```

**Key points:**
- `mode("overwrite")` not `MERGE` — the whole dataset is being replaced.
- Document the choice in the table COMMENT: `COMMENT 'Full snapshot — refreshed daily. Source API has no modified-at field.'`
- If the endpoint grows past ~50k rows, escalate: switch to Pattern 1 even if you have to use `created_at` as a partial watermark.

---

### Pattern 4: Semi-structured JSON flattening into Bronze

**When to use:** Always. Land both the raw payload and a typed projection — the AI should default to this.

```python
df = (
    spark.read.json(spark.sparkContext.parallelize([json.dumps(r) for r in rows]))
    .withColumn("raw_payload", F.to_json(F.struct("*")))
    .select(
        F.col("id").cast("string").alias("id"),
        F.to_timestamp("createdAt").alias("created_at"),
        F.to_timestamp("updatedAt").alias("updated_at"),
        F.col("properties.name").alias("name"),
        "raw_payload",
        F.current_timestamp().alias("ingested_at"),
    )
)

# Bronze table DDL — every column gets a COMMENT
spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA}.{TABLE} (
      id          STRING    COMMENT 'HubSpot object id',
      created_at  TIMESTAMP COMMENT 'Object created at source',
      updated_at  TIMESTAMP COMMENT 'Watermark — last modified at source',
      name        STRING    COMMENT 'Projected from properties.name for filtering',
      raw_payload STRING    COMMENT 'Full HubSpot response as JSON — re-parse downstream if schema evolves',
      ingested_at TIMESTAMP COMMENT 'When this row was written to Bronze'
    )
    USING DELTA
    COMMENT 'Bronze landing for HubSpot companies. Source: api.hubapi.com/crm/v3/objects/companies'
""")
```

**Key points:**
- Typed columns make Silver filtering cheap; raw payload is the safety net if the API adds fields.
- Never *only* land typed columns — you lose data when the API evolves.
- Never *only* land raw JSON — every downstream consumer pays the parse cost.

---

## Anti-Patterns

```python
# ❌ WRONG — token hardcoded
token = "pat-na1-abc123..."  # leaks to git, can't rotate

# ✓ CORRECT
token = dbutils.secrets.get(scope="qubika-hubspot", key="private-app-token")


# ❌ WRONG — fails the whole job on a transient 429
r = requests.get(url, headers=headers)
r.raise_for_status()

# ✓ CORRECT — retry with backoff, respect Retry-After
for attempt in range(5):
    r = requests.get(url, headers=headers, timeout=30)
    if r.status_code == 200: break
    if r.status_code in (429, 500, 502, 503, 504):
        time.sleep(float(r.headers.get("Retry-After", 0)) or 2 ** attempt)
        continue
    r.raise_for_status()


# ❌ WRONG — full refetch when the API supports a modified-at filter
params = {"limit": 100}  # pulls all 500k companies every run

# ✓ CORRECT — incremental on hs_lastmodifieddate
params = {"limit": 100, "filterGroups": [{"filters": [
    {"propertyName": "hs_lastmodifieddate", "operator": "GTE", "value": str(watermark_ms)}
]}]}
```

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| Hardcoded API token in notebook | Leaks to git, can't rotate without code change | `dbutils.secrets.get(scope, key)` — one scope per source |
| Full refetch every run when modified-at exists | Burns API quota, charges DBU for unchanged data | Watermark filter (Pattern 1) on `max(updated_at)` from Bronze |
| No retry on 429 / 5xx | One transient blip fails the whole job, pages oncall | Exponential backoff with jitter, respect `Retry-After`, cap at 60s |
| Only raw JSON, no typed projection | Every downstream query pays the parse cost | Land BOTH `raw_payload` AND typed columns (Pattern 4) |
| Only typed columns, no raw payload | Data lost when API adds fields | Keep `raw_payload` as the safety net |
| Calling page 1 and stopping | Silent data loss past 100 rows | Cursor loop (Pattern 2) until paging returns None |

---

## FAQ

| Question | Answer |
|----------|--------|
| Where do I store the API token? | In a Databricks secret scope, one scope per source (e.g. `qubika-hubspot`, `qubika-salesforce`). Read with `dbutils.secrets.get(scope, key)`. Never put tokens in code, env vars, or notebook parameters. Rotate by updating the secret — no code change needed. |
| What if the API doesn't expose a modified-at field? | Fall back to full snapshot (Pattern 3), or use `created_at` as a partial watermark — it catches inserts but misses updates. Document the limitation in the Bronze table COMMENT. If the endpoint grows past ~50k rows, escalate: ask the source team for a modified-at field, or capture deltas with a state table that diffs id sets. |
| How do I backfill historical data on first onboarding? | Don't write special backfill code. The watermark pattern handles it: on the first run `max(updated_at)` is NULL → `coalesce(NULL, TIMESTAMP'1970-01-01')` fetches everything. Subsequent runs use the real high-water mark. For very large backfills, parameterize the start/end window and run in chunks. |
| Should I land raw JSON or parse into typed columns at Bronze? | Both, always. `raw_payload STRING` for schema-evolution safety + typed projection (id, created_at, updated_at, a few hot filter columns) for query performance. See Pattern 4. |

---

## Related Skills

- `qubika-medallion-architecture` — what to do with Bronze once it's populated (Silver MERGE, Gold aggregation)
- `qubika-unity-catalog-governance` — how to name and `COMMENT` the Bronze schema and table
- `qubika-data-quality` — add DQX rules at Silver to catch bad rows from the API
- `qubika-pipeline-testing` — unit-test the pagination loop and watermark logic without hitting the real API
- `qubika-monitoring-observability` — alert on freshness (Bronze hasn't grown in 24h → API broken or quota exhausted)

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-05-18 | Initial version — HubSpot/Salesforce/Stripe patterns, watermark + cursor + retry, raw + typed Bronze layout |
