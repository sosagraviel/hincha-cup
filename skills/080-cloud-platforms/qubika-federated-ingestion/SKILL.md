---
name: qubika-federated-ingestion
description: "Ingest data from external databases (SQL Server, Oracle, PostgreSQL, Redshift, Synapse) into Databricks using Lakefed-Ingest metadata-driven orchestration"
version: 1.0.0
domain: data-engineering
owner: data-platform-team
---

# Qubika Federated Ingestion

Lakefed-Ingest moves data from external relational databases into the Qubika Bronze layer using Lakehouse Federation. All configuration lives in a control table — no custom ingestion code needed for standard patterns.

---

## When to Use This Skill

Use this skill when:
- Ingesting from SQL Server, Oracle, PostgreSQL, Redshift, or Synapse into Bronze
- Setting up incremental (watermark-based) loads from a relational database
- Ingesting large tables that need distributed partitioned reads
- Replacing manual JDBC notebooks with metadata-driven orchestration

Do NOT use this skill when:
- Source is a SaaS app with a Lakeflow Connect native connector (Salesforce, Workday, ServiceNow, Google Analytics, SharePoint) → use **Lakeflow Connect** instead (no code, managed by Databricks)
- Source is a file system (use Auto Loader / `qubika-streaming-pipelines` instead)
- Source is another Databricks workspace (use `qubika-uc-migration` + Replicator)
- Source requires custom transformation logic (add Silver layer after ingestion)

**Lakefed-Ingest vs Lakeflow Connect:**
| | Lakefed-Ingest | Lakeflow Connect |
|---|---|---|
| Source type | Relational DBs (JDBC) | SaaS APIs |
| Config | Control table (SQL) | Databricks pipeline YAML |
| Incremental | Watermark-based | Managed by Databricks |
| Custom SQL | Yes (`use_remote_query`) | No |
| Partitioned reads | Yes | Managed automatically |

---

## Prerequisites

```sql
-- A Lakehouse Federation connection must already exist for your source
-- Check with data platform if your source is registered:
SHOW CONNECTIONS;

-- The foreign catalog should already be mounted:
SHOW CATALOGS LIKE '*_federated';

-- Control table must exist (created once by data platform):
DESCRIBE TABLE qubika_dev.lakefed.control;
```

---

## Quick Start

```sql
-- Register a new ingestion task in the control table
INSERT INTO qubika_dev.lakefed.control VALUES (
  DEFAULT,                        -- id (auto)
  'daily_salesforce_accounts',    -- job_name
  'salesforce_batch',             -- task_collection (logical group)
  'sqlserver',                    -- src_type
  'prod_salesforce_conn',         -- src_connection (Federation connection name)
  'SalesforceDB',                 -- src_database
  'salesforce',                   -- src_catalog (foreign catalog)
  'dbo',                          -- src_schema
  'Account',                      -- src_table
  'qubika_dev',                   -- sink_catalog
  'raw.salesforce',               -- sink_schema
  'account',                      -- sink_table
  'incremental',                  -- load_type
  false,                          -- load_partitioned
  NULL,                           -- select_list (NULL = all columns)
  false,                          -- use_remote_query
  'SystemModstamp',               -- watermark_col_name
  'TIMESTAMP',                    -- watermark_col_type
  '2020-01-01 00:00:00',         -- watermark_col_start_value
  NULL,                           -- partition_col
  NULL,                           -- partition_size_mb
  array('Id'),                    -- primary_key (for upsert)
  array('SystemModstamp'),        -- sink_cluster_cols
  true,                           -- enable_iceberg_reads
  true                            -- task_enabled
);

-- Then trigger the job:
-- databricks bundle run --target prod lakefed_ingest_controller
```

---

## Common Patterns

### Pattern 1: Full Load (Small/Medium Tables)

**When to use:** Tables under ~50GB, no need for incremental, or tables that must be fully refreshed.

```sql
INSERT INTO qubika_dev.lakefed.control VALUES (
  DEFAULT,
  'full_load_products',
  'erp_batch',
  'oracle',                       -- src_type: oracle | sqlserver | postgresql | redshift | synapse
  'prod_oracle_conn',
  'ERPDB',
  'erp_federated',                -- foreign catalog name
  'SALES',                        -- src_schema
  'PRODUCTS',                     -- src_table
  'qubika_dev',
  'raw.erp',
  'product',
  'full',                         -- load_type: full (truncate and reload)
  false,
  'product_id, product_name, category, price, updated_at',  -- select_list
  false,
  NULL,                           -- no watermark needed for full load
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,                           -- no primary_key for full loads
  array('category'),              -- cluster cols
  true,
  true
);
```

---

### Pattern 2: Incremental Load (Watermark-Based)

**When to use:** Large tables where you only want new/changed rows since last run. Source must have a reliable timestamp or auto-increment column.

```sql
INSERT INTO qubika_dev.lakefed.control VALUES (
  DEFAULT,
  'incremental_orders',
  'salesforce_batch',
  'sqlserver',
  'prod_sqlserver_conn',
  'SalesDB',
  'sqlserver_federated',
  'dbo',
  'Orders',
  'qubika_dev',
  'raw.salesforce',
  'order',
  'incremental',                  -- load_type
  false,
  NULL,                           -- all columns
  false,
  'UpdatedAt',                    -- watermark_col_name — must be indexed on source
  'TIMESTAMP',                    -- watermark_col_type: TIMESTAMP | DATE | BIGINT
  '2020-01-01 00:00:00',         -- watermark_col_start_value (initial checkpoint)
  NULL,
  NULL,
  array('OrderId'),               -- primary_key (used for MERGE on sink)
  array('UpdatedAt'),
  true,
  true
);
-- After each run, the framework updates watermark_col_start_value automatically
```

---

### Pattern 3: Partitioned Load (Large Tables)

**When to use:** Tables over 50GB that need distributed reads — partitioned queries run in parallel across the source.

```sql
INSERT INTO qubika_dev.lakefed.control VALUES (
  DEFAULT,
  'partitioned_transactions',
  'warehouse_batch',
  'redshift',
  'prod_redshift_conn',
  'warehouse',
  'redshift_federated',
  'public',
  'transactions',
  'qubika_dev',
  'raw.warehouse',
  'transaction',
  'full',
  true,                           -- load_partitioned: distribute across partitions
  NULL,
  false,
  NULL, NULL, NULL,
  'transaction_date',             -- partition_col: must be monotonic/evenly distributed
  2048,                           -- partition_size_mb: target ~2GB per partition
  NULL,
  array('transaction_date'),
  true,
  true
);
-- Framework calls generate_partitions_table() to split source into batches
-- Each batch runs concurrently as a separate Databricks Job task
```

---

### Pattern 4: DAB Deployment

**When to use:** Deploying the ingestion jobs to dev/staging/prod.

```yaml
# databricks.yml
bundle:
  name: qubika-lakefed-ingest

variables:
  warehouse_id:
    description: "SQL Warehouse for statement execution"
  concurrency:
    description: "Max parallel ingestion tasks"
    default: 16

targets:
  dev:
    mode: development
    default: true
    workspace:
      host: https://qubika-dev.azuredatabricks.net
    variables:
      warehouse_id: "Shared SQL Warehouse Dev"
      concurrency: 4             # lower concurrency in dev

  prod:
    mode: production
    workspace:
      host: https://qubika-prod.azuredatabricks.net
    variables:
      warehouse_id: "prod-warehouse-id"
      concurrency: 16
```

```bash
# Deploy
databricks bundle deploy --target dev
databricks bundle deploy --target prod

# Trigger a collection manually
databricks bundle run --target prod \
  lakefed_ingest_controller \
  --params '{"task_collection": "salesforce_batch"}'
```

---

### Pattern 5: Control Table Schema Reference

```sql
-- Full control table definition (reference)
CREATE TABLE IF NOT EXISTS qubika_dev.lakefed.control (
  id                      BIGINT GENERATED BY DEFAULT AS IDENTITY,
  job_name                STRING,          -- unique human-readable name
  task_collection         STRING,          -- logical group (e.g., "salesforce_batch")
  src_type                STRING,          -- sqlserver | oracle | postgresql | redshift | synapse
  src_connection          STRING,          -- Lakehouse Federation connection name
  src_database            STRING,          -- source database name
  src_catalog             STRING,          -- foreign catalog in UC
  src_schema              STRING,          -- source schema
  src_table               STRING,          -- source table
  sink_catalog            STRING,          -- target UC catalog
  sink_schema             STRING,          -- target schema (e.g., "raw.salesforce")
  sink_table              STRING,          -- target table name
  load_type               STRING,          -- 'full' or 'incremental'
  load_partitioned        BOOLEAN,         -- true = distributed partitioned reads
  select_list             STRING,          -- comma-separated columns, NULL = all
  use_remote_query        BOOLEAN,         -- push query to source (not for Synapse)
  watermark_col_name      STRING,          -- incremental: timestamp/date column
  watermark_col_type      STRING,          -- TIMESTAMP | DATE | BIGINT
  watermark_col_start_value STRING,        -- initial checkpoint value
  partition_col           STRING,          -- column for partitioned reads
  partition_size_mb       INT,             -- target partition size in MB
  primary_key             ARRAY<STRING>,   -- key columns for incremental upsert
  sink_cluster_cols       ARRAY<STRING>,   -- Liquid Clustering columns on sink
  enable_iceberg_reads    BOOLEAN,
  task_enabled            BOOLEAN,         -- false = skip this task

  CONSTRAINT valid_load_type CHECK (load_type IN ('full', 'incremental')),
  CONSTRAINT valid_src_type  CHECK (src_type IN ('sqlserver','oracle','postgresql','redshift','synapse'))
)
```

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| `use_remote_query = true` on Synapse | Not supported — will fail | Always `false` for Synapse sources |
| `load_type = 'incremental'` without `watermark_col_name` | Config validation error | Always set watermark fields for incremental |
| `primary_key` set on full loads | Conflict with truncate+reload logic | Set `primary_key = NULL` for full loads |
| Non-indexed `watermark_col_name` | Source query scans entire table on every run | Use indexed timestamp columns only |
| High `concurrency` on small source | Overwhelms source DB connection pool | Use `concurrency: 4` for dev/small sources |
| Changing `partition_col` on existing tasks | Partition boundaries shift, may cause data gaps | Keep partition_col stable; reset task if changing |

---

## FAQ

| Question | Answer |
|----------|--------|
| How do I check if my source connection exists? | `SHOW CONNECTIONS` in Databricks SQL |
| Who sets up Lakehouse Federation connections? | Data Platform — request in `#data-ai-dev-help` |
| What's the difference between `src_catalog` and `src_database`? | `src_catalog` is the UC foreign catalog name; `src_database` is the actual DB name at the source |
| Can I ingest from Synapse with `use_remote_query = true`? | No — Synapse constraint. Always `false` |
| How do I disable a task without deleting it? | `UPDATE lakefed.control SET task_enabled = false WHERE job_name = 'my_task'` |
| Where does the watermark checkpoint live? | In the `watermark_col_start_value` column — updated after each successful run |
| What happens if a partitioned job fails mid-run? | Completed partitions are not re-run; failed partitions retry on next execution |
| Which sources support partitioned reads? | All except Synapse |

---

## Related Skills

- `qubika-medallion-architecture` — target catalog naming for ingested Bronze tables
- `qubika-streaming-pipelines` — when source is file-based (use Auto Loader instead)
- `qubika-dlt-meta` — for DLT-based ingestion with richer CDC patterns
- `qubika-data-quality` — add DQX validation on top of federated ingestion

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-05-06 | Initial version — Lakefed-Ingest control table and job patterns |
