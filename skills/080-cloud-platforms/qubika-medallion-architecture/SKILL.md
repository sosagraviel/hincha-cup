---
name: qubika-medallion-architecture
description: "Build Bronze/Silver/Gold data lake pipelines following Qubika's medallion architecture conventions on Databricks Delta Lake"
version: 1.2.0
domain: data-engineering
owner: data-platform-team
---

# Qubika Medallion Architecture

Qubika's data lake is organized into three layers: Bronze (raw ingestion), Silver (cleaned and typed), and Gold (business-ready aggregations). All pipeline code must follow these conventions to ensure consistency across teams.

---

## When to Use This Skill

Use this skill when:
- Creating any new data pipeline on Databricks
- Reading or writing to the Qubika data lake
- Naming catalogs, schemas, or tables
- Designing ingestion or transformation jobs

Do NOT use this skill when:
- Writing ad-hoc SQL for analysis (no naming constraints)
- Working with external/vendor data that has its own schema

---

## Catalog and Naming Conventions

```
Unity Catalog structure:
  qubika_{env}/                  ← environment: dev | staging | prod
  ├── raw/                       ← Bronze: exact copy of source data
  │   └── {source_system}/      ← e.g., salesforce, netsuite, postgres_crm
  │       └── {entity}          ← snake_case, singular: opportunity, account
  ├── curated/                  ← Silver: cleaned, typed, deduplicated
  │   └── {domain}/             ← e.g., sales, finance, operations, product
  │       └── {entity}          ← same name as Bronze counterpart
  └── analytics/                ← Gold: business aggregations and metrics
      └── {team}/               ← e.g., revenue_ops, finance, marketing
          └── {metric_name}     ← descriptive: daily_arr_by_segment

Environment aliases:
  dev      → qubika_dev
  staging  → qubika_staging
  prod     → qubika_prod
```

---

## Quick Start

```python
# Bronze → Silver pipeline skeleton
# Copy and adapt this for every new Silver table

catalog_env = "dev"  # change to staging or prod

bronze_table = f"qubika_{catalog_env}.raw.salesforce.opportunity"
silver_table = f"qubika_{catalog_env}.curated.sales.opportunity"

spark.sql(f"""
  MERGE INTO {silver_table} AS target
  USING (
    SELECT
      id                                       AS opportunity_id,
      name                                     AS opportunity_name,
      amount::DECIMAL(18,2)                    AS amount_usd,
      close_date::DATE                         AS close_date,
      stage_name                               AS stage,
      account_id,
      CURRENT_TIMESTAMP()                      AS _updated_at,
      _source_file                             AS _bronze_source,
      _ingested_at                             AS _bronze_ingested_at
    FROM {bronze_table}
    WHERE _ingested_at >= (SELECT COALESCE(MAX(_bronze_ingested_at), '1900-01-01') FROM {silver_table})
  ) AS source
  ON target.opportunity_id = source.opportunity_id
  WHEN MATCHED THEN UPDATE SET *
  WHEN NOT MATCHED THEN INSERT *
""")
```

---

## Common Patterns

### Pattern 1: Bronze Ingestion (Auto Loader)

**When to use:** Ingesting files from cloud storage (S3/ADLS/GCS) into the Bronze layer.

```python
from pyspark.sql import functions as F

source_path   = "abfss://landing@qubikastorage.dfs.core.windows.net/salesforce/opportunity/"
bronze_table  = "qubika_dev.raw.salesforce.opportunity"
checkpoint    = "abfss://checkpoints@qubikastorage.dfs.core.windows.net/salesforce/opportunity/"

(
  spark.readStream
    .format("cloudFiles")
    .option("cloudFiles.format", "json")
    .option("cloudFiles.inferColumnTypes", "true")
    .option("cloudFiles.schemaLocation", checkpoint + "_schema")
    .load(source_path)
    .withColumn("_ingested_at", F.current_timestamp())
    .withColumn("_source_file", F.input_file_name())
    .writeStream
    .format("delta")
    .option("checkpointLocation", checkpoint)
    .option("mergeSchema", "true")
    .outputMode("append")
    .toTable(bronze_table)
)
```

**Key points:**
- Always add `_ingested_at` and `_source_file` metadata columns
- Use `mergeSchema = true` on Bronze — schema evolution is expected
- Store checkpoints in the same storage account as source data

---

### Pattern 2: Silver Transformation (MERGE)

**When to use:** Transforming Bronze data into the Silver/curated layer.

```python
from delta.tables import DeltaTable

bronze_table = "qubika_dev.raw.salesforce.opportunity"
silver_table = "qubika_dev.curated.sales.opportunity"

# Create Silver table if it doesn't exist
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS {silver_table} (
    opportunity_id      STRING NOT NULL,
    opportunity_name    STRING,
    amount_usd          DECIMAL(18, 2),
    close_date          DATE,
    stage               STRING,
    account_id          STRING,
    is_closed           BOOLEAN GENERATED ALWAYS AS (stage IN ('Closed Won', 'Closed Lost')),
    _updated_at         TIMESTAMP,
    _bronze_source      STRING,
    _bronze_ingested_at TIMESTAMP
  )
  USING DELTA
  PARTITIONED BY (close_date)
  TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
  )
""")

# Incremental MERGE
new_data = spark.sql(f"""
  SELECT
    id                  AS opportunity_id,
    name                AS opportunity_name,
    amount::DECIMAL(18,2) AS amount_usd,
    close_date::DATE    AS close_date,
    stage_name          AS stage,
    account_id,
    CURRENT_TIMESTAMP() AS _updated_at,
    _source_file        AS _bronze_source,
    _ingested_at        AS _bronze_ingested_at
  FROM {bronze_table}
  WHERE _ingested_at > (
    SELECT COALESCE(MAX(_bronze_ingested_at), TIMESTAMP '1900-01-01')
    FROM {silver_table}
  )
""")

(
  DeltaTable.forName(spark, silver_table)
    .alias("target")
    .merge(new_data.alias("source"), "target.opportunity_id = source.opportunity_id")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute()
)
```

---

### Pattern 3: Gold Aggregation

**When to use:** Creating business metrics and aggregations from Silver tables.

```python
# Gold tables are typically batch (daily/hourly), not streaming
silver_opp   = "qubika_dev.curated.sales.opportunity"
gold_table   = "qubika_dev.analytics.revenue_ops.daily_pipeline_by_stage"

spark.sql(f"""
  CREATE OR REPLACE TABLE {gold_table}
  USING DELTA
  PARTITIONED BY (snapshot_date)
  AS
  SELECT
    CURRENT_DATE()                AS snapshot_date,
    stage,
    COUNT(*)                      AS opportunity_count,
    SUM(amount_usd)               AS total_pipeline_usd,
    AVG(amount_usd)               AS avg_deal_size_usd,
    COUNT_IF(is_closed)           AS closed_count
  FROM {silver_opp}
  WHERE close_date BETWEEN DATE_SUB(CURRENT_DATE(), 90) AND DATE_ADD(CURRENT_DATE(), 90)
  GROUP BY stage
""")
```

**Key points:**
- Gold tables use `CREATE OR REPLACE` (full refresh) unless incremental is explicitly needed
- Always add `snapshot_date` partition for time-travel analysis
- Document the business definition of every metric in the table comments

---

### Pattern 4: SCD Type 2 (Slowly Changing Dimensions)

**When to use:** Tracking historical changes to dimension data (e.g., account name changes, employee role changes).

```python
from delta.tables import DeltaTable
from pyspark.sql import functions as F

silver_account = "qubika_dev.curated.sales.account_scd2"

# Mark old records as closed
DeltaTable.forName(spark, silver_account).alias("target").merge(
  new_data.alias("source"),
  "target.account_id = source.account_id AND target.is_current = true"
).whenMatchedUpdate(
  condition="target.account_name != source.account_name",
  set={
    "is_current": "false",
    "valid_to": F.current_timestamp().cast("string")
  }
).execute()

# Insert new/changed records
(
  new_data
    .withColumn("valid_from", F.current_timestamp())
    .withColumn("valid_to", F.lit(None).cast("timestamp"))
    .withColumn("is_current", F.lit(True))
    .write.format("delta")
    .mode("append")
    .saveAsTable(silver_account)
)
```

---

### Pattern 5: Deploying Across Environments with Lakeflow Framework (Asset Bundles)

**When to use:** Promoting a pipeline from dev → staging → prod. Never manually reconfigure — use DAB targets.

```yaml
# databricks.yml — at the root of your pipeline repo
bundle:
  name: qubika-sales-pipelines

variables:
  catalog_env:
    description: "Catalog environment: dev | staging | prod"
    default: "dev"

targets:
  dev:
    mode: development        # pauses schedules, prefixes resources with username
    default: true
    variables:
      catalog_env: "dev"

  staging:
    mode: development
    variables:
      catalog_env: "staging"

  prod:
    mode: production         # schedules active, no username prefix
    variables:
      catalog_env: "prod"
```

```yaml
# pipelines/bronze_salesforce.yml
resources:
  pipelines:
    bronze_salesforce:
      name: "qubika-${var.catalog_env}-salesforce-bronze"
      catalog: "qubika_${var.catalog_env}"
      target: "raw.salesforce"
      serverless: true
      channel: CURRENT
      configuration:
        layer: "bronze"
        env: "${var.catalog_env}"
```

```bash
# Deploy to dev (default)
databricks bundle deploy

# Promote to staging
databricks bundle deploy --target staging

# Promote to prod (requires explicit target to avoid accidents)
databricks bundle deploy --target prod

# Validate bundle without deploying
databricks bundle validate

# Tear down dev resources when done
databricks bundle destroy --target dev --force
```

**Key points:**
- Never hardcode `qubika_prod` in pipeline configs — always use `${var.catalog_env}`
- `mode: development` automatically pauses all schedules so dev pipelines don't run on cron
- One `databricks.yml` per pipeline repo — use `include:` to split resources into separate files
- CI/CD: run `databricks bundle deploy --target staging` on PR merge to main

---

## Anti-Patterns

```sql
-- ❌ WRONG: Unqualified table name — breaks in any environment
SELECT * FROM opportunity;

-- ✓ CORRECT: Always qualify with catalog and schema
SELECT * FROM qubika_dev.curated.sales.opportunity;
```

```python
# ❌ WRONG: INSERT OVERWRITE destroys history and breaks idempotency
spark.sql("INSERT OVERWRITE TABLE silver_table SELECT * FROM bronze_table")

# ✓ CORRECT: MERGE is idempotent and preserves history
DeltaTable.forName(spark, silver_table).alias("t").merge(...).execute()
```

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| No `_ingested_at` on Bronze | Can't do incremental processing downstream | Always add metadata columns |
| Hardcoded `prod` catalog | Breaks in dev/staging | Use env variable or config |
| Gold table without `snapshot_date` | Can't time-travel | Always partition by date |
| `SELECT *` from Bronze to Silver | Picks up internal Delta columns | Explicitly name all columns |

---

## Reference Files

- [patterns.md](patterns.md) — Extended patterns (SCD3, multi-hop, schema evolution)

---

## FAQ

| Question | Answer |
|----------|--------|
| Which catalog do I write to in dev? | `qubika_dev` — never write to `qubika_prod` locally |
| Do I need to partition all tables? | Bronze: no. Silver: yes by date. Gold: yes by snapshot_date |
| Can I use `INSERT OVERWRITE` on Silver? | No — always use MERGE for idempotency |
| Should Bronze tables have a schema? | Use `mergeSchema=true`; Bronze accepts schema evolution |
| What's the correct format for all tables? | Delta format — always |
| Where do checkpoints go? | Same storage account as source, separate container `checkpoints/` |

---

---

### Pattern 6: Lakeflow Connect — Native SaaS Ingestion (No Code)

**When to use:** Bronze ingestion from enterprise SaaS sources. Lakeflow Connect handles auth, incremental loads, and schema mapping natively — no custom API code.

> **Lakeflow** is the umbrella platform covering Spark Declarative Pipelines (what was Delta Live Tables), Lakeflow Connect (ingestion), and Lakeflow Jobs (orchestration). All existing DLT code runs unchanged.

Supported sources (GA): Salesforce, Workday, ServiceNow, Google Analytics, SharePoint, SQL Server, MySQL, PostgreSQL, and more.

```yaml
# pipelines/dab_salesforce_connect.yml
resources:
  pipelines:
    salesforce_bronze:
      name: "qubika-${var.catalog_env}-salesforce-connect"
      catalog: "qubika_${var.catalog_env}"
      target: "raw.salesforce"
      serverless: true
      ingestion_definition:
        connection_name: "prod_salesforce_conn"
        objects:
          - object:
              src_schema: "salesforce"
              src_table:  "opportunity"
              destination_catalog: "qubika_${var.catalog_env}"
              destination_schema:  "raw.salesforce"
```

**Source → tool decision:**

| Source type | Recommended approach |
|---|---|
| SaaS APIs (Salesforce, Workday, etc.) | **Lakeflow Connect** — native, no code |
| Files in cloud storage (S3, ADLS) | **Auto Loader** — streaming file ingestion |
| Relational DBs with complex watermarking | **Lakefed-Ingest** — metadata-driven JDBC |
| Custom API / unsupported source | Custom Bronze notebook |

---

### Pattern 7: Real-Time Mode — Sub-5ms Streaming (GA)

**When to use:** Pipelines with sub-second latency requirements (fraud detection, real-time personalization, live inventory). One config change — no Flink, no replatforming.

```python
(
    spark.readStream
        .table("qubika_dev.raw.events.transactions")
        .writeStream
        .format("delta")
        .option("checkpointLocation", checkpoint)
        .trigger(continuous="1 second")   # Real-Time Mode — p99 latency ~5ms
        .toTable("qubika_dev.curated.events.transactions_rt")
)
```

**Trigger guide:**
| Trigger | Latency | Use case |
|---|---|---|
| `availableNow=True` | Minutes | Scheduled batch jobs |
| `processingTime='1 minute'` | ~1 min | Standard streaming |
| `continuous='1 second'` | 5ms p99 | Fraud, live decisions |

Real-Time Mode is stateless only — for windowed aggregations keep `processingTime`.

---

## Related Skills

- `qubika-data-quality` — validate data between Bronze and Silver
- `qubika-dlt-meta` — config-driven Bronze/Silver pipeline scaffolding (no boilerplate code)
- `qubika-streaming-pipelines` — when Bronze ingestion is real-time or sub-second
- `qubika-unity-catalog-governance` — creating catalogs and schemas
- `qubika-pipeline-testing` — testing your pipeline logic
- `qubika-monitoring-observability` — alerting on pipeline failures
- `qubika-uc-migration` — migrating existing HMS tables into this structure
- `qubika-federated-ingestion` — JDBC-based ingestion for relational databases

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-01-01 | Initial version |
| 1.1.0 | 2025-05-06 | Added Pattern 5: Lakeflow Framework DAB deployment across environments |
| 1.2.0 | 2026-05-07 | Added Pattern 6: Lakeflow Connect for SaaS ingestion; Pattern 7: Real-Time Mode (5ms latency); Lakeflow branding note |
