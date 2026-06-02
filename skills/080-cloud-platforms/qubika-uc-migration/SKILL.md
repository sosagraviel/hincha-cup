---
name: qubika-uc-migration
description: "Migrate Hive Metastore tables and workspace assets to Unity Catalog using UCX, and replicate across workspaces with Databricks-Replicator"
version: 1.1.0
domain: governance
owner: data-platform-team
---

# Unity Catalog Migration with UCX

UCX is the Databricks Labs tool for migrating from Hive Metastore (HMS) to Unity Catalog. Never attempt a UC migration without running UCX assessment first — it will surface blockers before you touch any data.

---

## When to Use This Skill

Use this skill when:
- Migrating tables from `hive_metastore` to a UC catalog (`qubika_dev`, `qubika_prod`)
- Assessing a workspace for UC readiness
- Migrating dashboards, jobs, or DLT pipelines to UC-compatible versions
- Troubleshooting UC migration blockers

Do NOT use this skill when:
- Creating new tables (use `qubika-unity-catalog-governance` for that)
- Tables are already in UC — no migration needed

---

## Prerequisites

```bash
# Requires
python --version          # Must be 3.10+
databricks --version      # Must be CLI 0.213+

# You must have:
# - Workspace Admin permissions
# - A Unity Catalog Metastore already attached to the workspace
# - A PRO or Serverless SQL Warehouse
```

---

## Quick Start

```bash
# 1. Install UCX into your workspace
databricks labs install ucx

# 2. Run the assessment (REQUIRED before anything else)
databricks labs ucx ensure-assessment-run --force-refresh true

# 3. View results in the auto-created dashboard
# Workspace → Dashboards → "UCX Assessment"
# or export:
databricks labs ucx export-assessment --export-format excel

# 4. Fix blockers (see FAQ below), then migrate
databricks labs ucx migrate-tables
```

---

## Common Patterns

### Pattern 1: Full Assessment Workflow

**When to use:** Before any migration — always run this first.

```bash
# Install (interactive — prompts for warehouse, catalog names, etc.)
databricks labs install ucx
# Key prompts:
#   inventory_database: ucx          ← where UCX stores its tables
#   ucx_catalog: ucx                 ← UC catalog for UCX artifacts
#   warehouse_id: <your-PRO-warehouse-id>
#   num_threads: 10

# Force a fresh assessment (ignores cached results)
databricks labs ucx ensure-assessment-run --force-refresh true

# Export results
databricks labs ucx export-assessment --export-format excel
# Output: assessment_export_*.zip in current directory

# View assessment tables directly in SQL
# All stored in: hive_metastore.ucx.*
```

**Key assessment tables to review:**

```sql
-- Tables that will be migrated
SELECT * FROM hive_metastore.ucx.tables
WHERE migration_status != 'MIGRATED'
ORDER BY table_type, size_in_bytes DESC;

-- Tables with migration blockers
SELECT table_name, table_type, upgrade_advice
FROM hive_metastore.ucx.tables
WHERE upgrade_advice IS NOT NULL;

-- External storage locations detected
SELECT * FROM hive_metastore.ucx.external_locations;

-- Jobs that will break after migration
SELECT * FROM hive_metastore.ucx.jobs
WHERE failures IS NOT NULL;

-- Current permissions that need to be migrated
SELECT * FROM hive_metastore.ucx.grants
ORDER BY object_type, object_id;
```

---

### Pattern 2: Table Migration (Standard Flow)

**When to use:** After assessment is clean — migrate tables from HMS to UC.

```bash
# Step 1: Generate table mapping file (interactive)
databricks labs ucx create-table-mapping
# Creates a CSV in the workspace — download and review it

# Step 2: Setup storage credentials (Azure example)
databricks labs ucx principal-prefix-access \
  --subscription-ids "your-azure-subscription-id"

databricks labs ucx migrate-credentials

# Step 3: Setup external locations in UC
databricks labs ucx validate-external-locations
databricks labs ucx migrate-locations

# Step 4: Create catalogs and schemas in UC
databricks labs ucx create-catalogs-schemas

# Step 5: Migrate tables
databricks labs ucx migrate-tables
# Each table uses the best strategy:
#   Delta tables     → DEEP CLONE (fast, preserves history)
#   External tables  → SYNC (register existing storage in UC)
#   Hive SerDe       → CTAS (recreate as Delta)
```

**Table mapping CSV format** (edit before migration):

```csv
workspace_name,catalog_name,src_schema,dst_schema,src_table,dst_table
qubika-workspace,qubika_prod,sales,sales,opportunities,opportunity
qubika-workspace,qubika_prod,finance,finance,invoices,invoice
qubika-workspace,qubika_prod,raw_data,raw.salesforce,opportunity_raw,opportunity
```

---

### Pattern 3: Migrate Specific Objects (Not All Tables)

**When to use:** Phased migration — move one domain at a time.

```bash
# Move a specific table
databricks labs ucx move \
  --from-catalog hive_metastore \
  --from-schema sales_analysis \
  --from-table ytd_opportunities \
  --to-catalog qubika_prod \
  --to-schema sales

# Alias (keep old name pointing to new location — zero-downtime migration)
databricks labs ucx alias \
  --from-catalog hive_metastore \
  --from-schema sales_analysis \
  --from-table opportunities \
  --to-catalog qubika_prod \
  --to-schema sales \
  --to-table opportunity

# Migrate only dashboards
databricks labs ucx migrate-dbsql-dashboards

# Migrate DLT pipelines
databricks labs ucx migrate-dlt-pipelines \
  --include-pipeline-ids "pipeline-abc,pipeline-xyz"

# Lint local notebooks for HMS references before migration
databricks labs ucx lint-local-code --directory /path/to/notebooks
```

---

### Pattern 4: Validate and Reconcile After Migration

**When to use:** After migrate-tables completes — verify data integrity.

```bash
# UCX runs reconciliation automatically (row count comparison)
# Default tolerance: 5% row count difference = OK

# View reconciliation results
```

```sql
-- Check migration status per table
SELECT
  table_name,
  table_type,
  migration_status,    -- MIGRATED | FAILED | PENDING
  upgrade_advice
FROM hive_metastore.ucx.tables
ORDER BY migration_status, table_name;

-- Manual row count check (replace with your tables)
SELECT
  'hive_metastore.sales.opportunity'  AS source,
  COUNT(*)                             AS row_count
FROM hive_metastore.sales.opportunity
UNION ALL
SELECT
  'qubika_prod.sales.opportunity'     AS source,
  COUNT(*)                             AS row_count
FROM qubika_prod.sales.opportunity;
```

```bash
# Revert a specific table if something went wrong
databricks labs ucx revert-migrated-tables \
  --schema sales \
  --table opportunity
```

---

### Pattern 5: Group Migration (Permissions)

**When to use:** After tables are migrated, permissions must move from workspace-local groups to UC account groups.

```bash
# Sync workspace info across account
databricks --profile ACCOUNTS labs ucx sync-workspace-info

# Create account-level groups from workspace groups
databricks labs ucx create-account-groups \
  --workspace-ids 123456789

# Validate group membership is consistent
databricks labs ucx validate-groups-membership

# Assign ownership group to migrated tables
databricks labs ucx assign-owner-group
```

---

## Migration Readiness Checklist

Before running `migrate-tables`, verify:

- [ ] Assessment completed with no `[✗]` critical failures
- [ ] All external storage locations validated (`validate-external-locations`)
- [ ] Storage credentials created (`migrate-credentials`)
- [ ] Target catalog and schemas exist (`create-catalogs-schemas`)
- [ ] Table mapping CSV reviewed and approved by data owners
- [ ] Downstream jobs and notebooks linted (`lint-local-code`)
- [ ] Maintenance window scheduled (migration pauses pipelines)
- [ ] Rollback plan in place (`revert-migrated-tables` is available)

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| Skipping assessment | Hit blockers mid-migration | Always run assessment first |
| Migrating all tables at once | One failure blocks everything | Migrate schema by schema |
| No alias after migration | Downstream jobs break immediately | Use `alias` for zero-downtime handover |
| Ignoring Hive SerDe tables in assessment | CTAS can change column types silently | Review `upgrade_advice` for every SerDe table |
| Not linting notebooks first | Jobs fail after migration due to HMS references | Always run `lint-local-code` before migrating |

---

## FAQ

| Question | Answer |
|----------|--------|
| How long does assessment take? | 15–60 min depending on workspace size |
| What if a table fails to migrate? | Check `hive_metastore.ucx.tables.upgrade_advice` — it tells you why |
| Can I run UCX in production during business hours? | Assessment: yes (read-only). Migration: no — schedule a maintenance window |
| What about Hive SerDe tables? | UCX uses CTAS — review column types carefully; some types may change |
| What's the recon tolerance? | 5% row count difference by default — configurable at install |
| How do I migrate jobs that reference HMS? | `lint-local-code` finds them; edit them to use UC paths after migration |
| Can I undo the migration? | Yes — `databricks labs ucx revert-migrated-tables` for individual tables |
| What permissions do I need? | Workspace Admin + Account Admin for group migration |
| When should I use Replicator vs UCX? | UCX: HMS → UC migration (one-time). Replicator: UC → UC cross-workspace sync (ongoing) |
| Can Replicator handle cross-cloud (Azure → AWS)? | Yes — use `cloud_url_mapping` and `storage_credential_config` in the YAML |
| Does Replicator replicate DLT checkpoints? | No — pipelines must be re-run from scratch on the target workspace |
| Can I use Replicator without Delta Sharing? | No — Replicator uses Delta Sharing under the hood; ensure it's enabled at the account level |

---

## Pattern 6: Cross-Workspace Replication with Databricks-Replicator

**When to use:** Copying entire catalogs or schemas from one Databricks workspace to another — DR setup, prod-to-dev seeding, cross-cloud migration (Azure → AWS).

```bash
# Install (runs as a Databricks App or local CLI)
pip install databricks-replicator

# Deploy
data-replicator config.yaml --target-catalogs qubika_prod
```

**Replication config (`replication_config.yaml`):**

```yaml
replication_groups:
  - replication_group_name: "qubika_dr_replica"

    backup_config:
      create_backup: true        # create Delta Share on source
      create_catalog: true       # register foreign catalog on target
      create_recipient: true     # provision Delta Sharing recipient
      create_share: true

    replication_config:
      create_shared_catalog: true  # mount the share as a UC catalog

    reconciliation_config:
      perform_reconciliation: true
      schema_check: true           # verify column names + types match
      row_count_check: true
      sampling_percentage: 5       # spot-check 5% of rows

    # Required for cross-cloud (Azure source → AWS target)
    cloud_url_mapping:
      - source_cloud_url: "abfss://data@qubikastorage.dfs.core.windows.net"
        target_cloud_url: "s3://qubika-dr-bucket/data"

    storage_credential_config:
      - source_credential: "az-storage-creds"     # UC storage credential name on source
        target_credential: "aws-iam-role-creds"   # UC storage credential name on target

    catalogs:
      - catalog_name: "qubika_prod"
        schemas:
          - schema_name: "curated"
            replicate_all: true        # replicate all tables in schema
          - schema_name: "analytics"
            replicate_all: true
          - schema_name: "raw.salesforce"
            tables:                    # selective table list
              - table_name: "opportunity"
              - table_name: "account"
```

**What IS replicated:**
- Delta tables (via Delta Sharing)
- Volumes (binary copy)
- UC metadata: comments, tags, column-level permissions
- External table storage references

**What is NOT replicated:**
- DLT pipeline checkpoints (pipelines must be re-run from scratch on target)
- Hive Metastore tables (use UCX for those first)
- Workspace-level assets (notebooks, jobs — use Databricks Repos or bundle deploy)
- Active streams (streaming state is not transferred)

**Replication CLI commands:**

```bash
# Full replication run
data-replicator replication_config.yaml

# Dry run — shows what would be replicated without making changes
data-replicator replication_config.yaml --dry-run

# Reconcile only (no data copy — just verify counts/schema)
data-replicator replication_config.yaml --reconcile-only

# Replicate specific catalog only
data-replicator replication_config.yaml --target-catalogs qubika_prod

# Force full re-sync (ignores existing shares)
data-replicator replication_config.yaml --force-refresh
```

**Anti-patterns for Replicator:**

| Anti-pattern | Problem | Correct alternative |
|---|---|---|
| Replicating Bronze tables to DR | Unnecessary storage cost — Bronze is re-ingested | Replicate Silver+ only; re-run ingestion on DR |
| Not using `--dry-run` first | Unexpected share creation surprises | Always dry-run in new environments |
| Replicating without `reconciliation_config` | Silent data loss not caught | Always enable schema + row_count checks |
| Using Replicator for HMS tables | Replicator only handles UC tables | Run UCX migration first, then Replicator |

---

## Related Skills

- `qubika-unity-catalog-governance` — creating catalogs, schemas, and permissions post-migration
- `qubika-medallion-architecture` — the target naming convention for migrated tables
- `qubika-monitoring-observability` — monitoring migrated pipelines after go-live

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-01-01 | Initial version — UCX migration workflow for Qubika |
| 1.1.0 | 2025-05-06 | Added Pattern 6: Cross-workspace replication with Databricks-Replicator |
