---
name: qubika-unity-catalog-governance
description: "Create and govern Unity Catalog resources (catalogs, schemas, tables, volumes) following Qubika's naming, tagging, and access control conventions"
version: 2.0.0
domain: governance
owner: data-platform-team
---

# Qubika Unity Catalog Governance

Unity Catalog is the single source of truth for all Qubika data assets. All catalogs, schemas, tables, and volumes must follow naming and tagging conventions. Access control is managed through groups, not individual users.

---

## When to Use This Skill

Use this skill when:
- Creating a new catalog, schema, or table
- Granting or revoking permissions
- Adding tags to data assets
- Setting up row-level security or column-level masking
- Investigating what data exists and who owns it

---

## Catalog Naming Convention

```
qubika_{env}           ← main data catalog (dev | staging | prod)
qubika_{env}_ml        ← ML experiments, models, feature store
qubika_{env}_external  ← external/partner data (read-only ingestion)
qubika_shared          ← cross-environment reference data (no env suffix)
```

Never create catalogs outside this naming pattern without data platform approval.

---

## Quick Start

```sql
-- Create a new schema for a team/domain
CREATE SCHEMA IF NOT EXISTS qubika_dev.curated.marketing
  COMMENT 'Marketing team curated data — owned by @marketing-data team'
  WITH DBPROPERTIES (
    'owner'       = 'marketing-data',
    'domain'      = 'marketing',
    'pii_contains' = 'false',
    'env'         = 'dev'
  );

-- Grant access to a team group (never to individual users)
GRANT USE SCHEMA, SELECT ON SCHEMA qubika_dev.curated.marketing TO `marketing-data-readers`;
GRANT USE SCHEMA, SELECT, MODIFY ON SCHEMA qubika_dev.curated.marketing TO `marketing-data-writers`;
```

---

## Common Patterns

### Pattern 1: Creating a New Schema

**When to use:** Setting up a new domain area within an existing catalog layer.

```sql
-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS qubika_dev.curated.{domain}
  COMMENT '{Domain} team curated data'
  WITH DBPROPERTIES (
    'owner'        = '{team-name}',
    'domain'       = '{domain}',
    'pii_contains' = 'false',      -- change to 'true' if schema contains PII
    'env'          = 'dev',
    'created_by'   = '{your-email}'
  );

-- 2. Grant catalog access (if not already granted)
GRANT USE CATALOG ON CATALOG qubika_dev TO `{team}-data-readers`;

-- 3. Grant schema access
GRANT USE SCHEMA ON SCHEMA qubika_dev.curated.{domain} TO `{team}-data-readers`;
GRANT SELECT    ON SCHEMA qubika_dev.curated.{domain} TO `{team}-data-readers`;
GRANT USE SCHEMA, SELECT, MODIFY, CREATE TABLE
  ON SCHEMA qubika_dev.curated.{domain} TO `{team}-data-writers`;
```

---

### Pattern 2: Creating a Table with Tags and Comments

**When to use:** All new Silver and Gold table creation.

```sql
CREATE TABLE IF NOT EXISTS qubika_dev.curated.sales.opportunity (
  opportunity_id   STRING  NOT NULL COMMENT 'Salesforce opportunity ID (18-char)',
  opportunity_name STRING           COMMENT 'Human-readable opportunity name',
  amount_usd       DECIMAL(18, 2)   COMMENT 'Total deal value in USD',
  close_date       DATE             COMMENT 'Expected or actual close date',
  stage            STRING           COMMENT 'Pipeline stage (see valid_stage constraint)',
  account_id       STRING           COMMENT 'FK to curated.sales.account.account_id',
  owner_id         STRING           COMMENT 'FK to curated.hr.employee.employee_id',
  _updated_at      TIMESTAMP        COMMENT 'Last updated by pipeline',
  _bronze_source   STRING           COMMENT 'Source file path from Bronze layer'
)
USING DELTA
PARTITIONED BY (close_date)
COMMENT 'Salesforce opportunities — Silver layer. Owned by sales-data team.'
TBLPROPERTIES (
  'owner'                              = 'sales-data',
  'delta.enableChangeDataFeed'         = 'true',
  'delta.autoOptimize.optimizeWrite'   = 'true',
  'delta.autoOptimize.autoCompact'     = 'true',
  'pii'                                = 'false'
);

-- Add column tags for PII classification (required for any PII column)
-- ALTER TABLE ... ALTER COLUMN email SET TAGS ('pii' = 'true', 'pii_type' = 'email');
```

---

### Pattern 3: Access Control Groups

**When to use:** Granting any permission. Always use groups — never individual users.

```
Standard groups (created by IT per team):
  {team}-data-readers   — SELECT on team schemas
  {team}-data-writers   — SELECT + MODIFY + CREATE TABLE on team schemas
  data-platform-admins  — Full admin on all catalogs
  de-developers         — All data engineers (write access to dev)
  analyst-readers       — SELECT on analytics/gold schemas only
```

```sql
-- Reader group: can see and query
GRANT USE CATALOG    ON CATALOG qubika_dev                TO `{team}-data-readers`;
GRANT USE SCHEMA     ON SCHEMA qubika_dev.curated.{domain} TO `{team}-data-readers`;
GRANT SELECT         ON SCHEMA qubika_dev.curated.{domain} TO `{team}-data-readers`;

-- Writer group: can also write
GRANT USE CATALOG, CREATE SCHEMA ON CATALOG qubika_dev TO `{team}-data-writers`;
GRANT ALL PRIVILEGES ON SCHEMA qubika_dev.curated.{domain} TO `{team}-data-writers`;

-- Cross-team read: marketing reading from sales
GRANT USE CATALOG ON CATALOG qubika_dev TO `marketing-data-readers`;
GRANT USE SCHEMA  ON SCHEMA qubika_dev.curated.sales TO `marketing-data-readers`;
GRANT SELECT      ON TABLE qubika_dev.curated.sales.opportunity TO `marketing-data-readers`;
```

---

### Pattern 4: Column-Level Masking (PII)

**When to use:** Tables containing PII that different groups should see differently.

```sql
-- Create masking function (done once per data type by data platform)
CREATE FUNCTION IF NOT EXISTS qubika_dev.governance.mask_email(email STRING)
  RETURNS STRING
  RETURN IF(IS_ACCOUNT_GROUP_MEMBER('pii-data-readers'), email, REGEXP_REPLACE(email, '(.).*(.)@', '$1***$2@'));

-- Apply mask to column
ALTER TABLE qubika_dev.curated.hr.employee
  ALTER COLUMN email
  SET MASK qubika_dev.governance.mask_email;
```

---

### Pattern 5: Row-Level Security

**When to use:** Teams should only see their own rows (e.g., each sales rep sees only their opportunities).

```sql
-- Create row filter
CREATE FUNCTION IF NOT EXISTS qubika_dev.governance.filter_by_owner(owner_email STRING)
  RETURNS BOOLEAN
  RETURN IS_ACCOUNT_GROUP_MEMBER('sales-managers') OR owner_email = CURRENT_USER();

-- Apply filter
ALTER TABLE qubika_dev.curated.sales.opportunity
  SET ROW FILTER qubika_dev.governance.filter_by_owner ON (owner_email);
```

---

---

### Pattern 6: Volumes — Governing Unstructured Files (GA)

**When to use:** Storing files (PDFs, images, JSON exports, ML artifacts) under Unity Catalog governance with the same permissions, lineage, and tags as tables.

```sql
-- Managed volume (Databricks stores files internally)
CREATE VOLUME IF NOT EXISTS qubika_dev.raw.salesforce.attachments
  COMMENT 'Salesforce attachment files — raw binary, not yet processed';

-- External volume (points to existing cloud storage)
CREATE EXTERNAL VOLUME IF NOT EXISTS qubika_dev.raw.landing.s3_drop
  LOCATION 's3://qubika-landing/drop/'
  COMMENT 'S3 drop zone for inbound partner files';

GRANT READ VOLUME  ON VOLUME qubika_dev.raw.salesforce.attachments TO `sales-data-readers`;
GRANT WRITE VOLUME ON VOLUME qubika_dev.raw.salesforce.attachments TO `sales-data-writers`;
```

```python
# Write / read from a volume — same path syntax as DBFS but UC-governed
dbutils.fs.cp("local_file.pdf", "/Volumes/qubika_dev/raw/salesforce/attachments/2025/file.pdf")
with open("/Volumes/qubika_dev/raw/salesforce/attachments/2025/file.pdf", "rb") as f:
    content = f.read()
```

---

### Pattern 7: System Tables — Audit, Billing, and Lineage as SQL (GA)

**When to use:** Compliance audits, cost attribution, access reviews, and data lineage — all queryable as standard SQL from `system.*`.

```sql
-- Who accessed what, when (1-year retention)
SELECT event_time,
       user_identity.email            AS user,
       request_params.table_full_name AS table_name,
       action_name
FROM system.access.audit
WHERE action_name IN ('selectFromTable', 'createTable', 'dropTable')
  AND event_time >= NOW() - INTERVAL 7 DAYS
ORDER BY event_time DESC;

-- DBU cost by job (last 30 days)
SELECT workspace_id, usage_metadata.job_id,
       SUM(usage_quantity) AS total_dbu
FROM system.billing.usage
WHERE usage_date >= CURRENT_DATE - 30
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50;

-- Upstream tables feeding a Gold table (lineage)
SELECT source_table_full_name, target_table_full_name, event_time
FROM system.catalog.table_lineage
WHERE target_table_full_name = 'qubika_prod.analytics.revenue_ops.daily_arr'
ORDER BY event_time DESC;
```

**Key system tables:**
| Table | What it contains |
|---|---|
| `system.access.audit` | All workspace actions (user, timestamp, resource) |
| `system.billing.usage` | DBU consumption by job, warehouse, user |
| `system.catalog.tables` | All UC tables metadata |
| `system.catalog.table_lineage` | Upstream → downstream table lineage |
| `system.catalog.column_lineage` | Column-level data lineage |

---

### Pattern 8: AI-Generated Descriptions (Public Preview)

**When to use:** Auto-documenting new tables without writing every comment manually.

```python
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()
# Trigger AI description generation — Genie reads schema + sample data
w.tables.generate_ai_description(
    catalog_name="qubika_dev",
    schema_name="curated.sales",
    table_name="opportunity"
)
# Review in Catalog Explorer → Tables → "AI-generated descriptions"
# Accept, edit, or reject per column; accepted text is saved as COMMENT
```

---

### Pattern 9: Delta UniForm — Multi-Engine Read Access (GA)

**When to use:** Gold or Silver tables that need to be queried by Snowflake, BigQuery, Redshift, or Athena without data replication.

```sql
-- Enable Iceberg metadata generation on a Delta table
ALTER TABLE qubika_dev.analytics.revenue_ops.daily_arr_by_segment
  SET TBLPROPERTIES ('delta.universalFormat.enabledFormats' = 'iceberg');

-- Or at CREATE TABLE time:
CREATE TABLE qubika_dev.analytics.revenue_ops.daily_arr_by_segment (
  snapshot_date DATE, segment STRING, total_arr_usd DECIMAL(18, 2)
)
USING DELTA
TBLPROPERTIES ('delta.universalFormat.enabledFormats' = 'iceberg');
```

After enabling UniForm, external engines connect via the Iceberg REST Catalog on Unity Catalog. No data copy, no ETL — single source of truth.

**Supported external readers:** Snowflake, BigQuery, Redshift, Apache Athena, Apache Flink.

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| Granting to individual user emails | Breaks when people leave/change teams | Always grant to groups |
| Creating schemas without `COMMENT` | Impossible to know who owns it | Always document owner and domain |
| Using `GRANT ALL PRIVILEGES` on prod | Over-permissioned; security risk | Use specific privilege lists |
| Tables without column comments | Data catalog is useless | Document every column |
| No `pii` tag on PII tables | Compliance risk | Tag all PII columns |
| Storing files in DBFS root | No UC governance, no lineage | Use Volumes for all unstructured data |
| Not enabling UniForm on shared Gold tables | Downstream teams replicate data | Enable UniForm at Gold layer creation |

---

## FAQ

| Question | Answer |
|----------|--------|
| What catalog do I use in local dev? | `qubika_dev` — never `qubika_prod` |
| How do I create a new team schema? | Follow Pattern 1 and open a PR for review |
| What group should analysts use? | `analyst-readers` for Gold, team-specific readers for Silver |
| Can I use `GRANT ALL PRIVILEGES` in prod? | No — use explicit privilege lists |
| Where do I document what a table is for? | `COMMENT` on the table + `COMMENT` on every column |
| How do I see who has access to a table? | `SHOW GRANTS ON TABLE catalog.schema.table` |
| Where are UC audit logs? | `system.access.audit` — queryable SQL, 1-year retention |
| How do I let Snowflake query a Delta table? | Enable UniForm (`delta.universalFormat.enabledFormats = 'iceberg'`) on the table |
| Can Volumes store any file type? | Yes — PDFs, images, CSVs, Parquet, model artifacts, anything |

---

## Related Skills

- `qubika-medallion-architecture` — where each catalog layer fits
- `qubika-data-quality` — constraints on Silver/Gold tables
- `qubika-monitoring-observability` — auditing catalog access and pipeline health
- `qubika-lakehouse-monitoring` — statistical drift and quality profiling on UC tables

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-01-01 | Initial version |
| 2.0.0 | 2026-05-07 | Added Volumes (Pattern 6), System Tables (Pattern 7), AI Descriptions (Pattern 8), Delta UniForm (Pattern 9); updated anti-patterns and FAQ |
