---
name: qubika-lakebridge
description: "Transpile legacy SQL (Snowflake, Oracle, Teradata, T-SQL, DataStage) to Databricks SQL and validate data accuracy after migration using Lakebridge"
version: 1.0.0
domain: data-engineering
owner: data-platform-team
---

# Qubika Lakebridge — SQL Transpilation & Migration Validation

Lakebridge converts legacy SQL dialects and ETL code to Databricks SQL/PySpark, then validates the migrated data matches the source using configurable reconciliation reports. Use it when migrating from Snowflake, Oracle, Teradata, SQL Server/Synapse, or DataStage.

---

## When to Use This Skill

Use this skill when:
- Migrating SQL queries or stored procedures from a legacy warehouse to Databricks SQL
- Converting DataStage or Informatica ETL jobs to PySpark/Spark SQL
- Validating that migrated data matches the source row-by-row or via aggregates
- Running a migration readiness analysis on an existing database

Do NOT use this skill when:
- Tables are already on Databricks (use `qubika-uc-migration` for HMS → UC moves instead)
- You only need to restructure existing Databricks code (no dialect translation needed)

---

## Prerequisites

```bash
# Requirements
python --version    # 3.10.1 – 3.13.x
java --version      # Java 11+
databricks --version  # Databricks CLI configured with target workspace

# Install Lakebridge into your workspace
databricks labs install lakebridge --profile <your-profile>

# Install transpiler engines (interactive — choose Morpheus, BladeBridge, or Switch)
databricks labs lakebridge install-transpile
```

---

## Quick Start

```bash
# Transpile a directory of Snowflake SQL files to Databricks SQL
databricks labs lakebridge transpile \
  --source-dialect snowflake \
  --input-source /path/to/snowflake/sql/ \
  --output-folder /path/to/output/ \
  --catalog-name qubika_dev \
  --schema-name curated.sales

# Review transpilation errors
cat /path/to/output/errors.log

# Validate migrated data matches source
databricks labs lakebridge configure-reconcile   # generates config template
databricks labs lakebridge reconcile
```

---

## Common Patterns

### Pattern 1: Transpile — Full Command Reference

**When to use:** Converting any batch of legacy SQL files to Databricks SQL.

```bash
databricks labs lakebridge transpile \
  --transpiler-config-path /abs/path/to/transpiler.toml \   # optional: engine-specific tuning
  --input-source /abs/path/to/legacy/sql/ \                 # directory scanned recursively
  --source-dialect snowflake \                              # see supported dialects below
  --output-folder /abs/path/to/output/ \
  --skip-validation False \                                 # True = skip syntax check on output
  --catalog-name qubika_dev \                               # UC catalog for resolved references
  --schema-name curated.sales \                             # default schema for unqualified tables
  --error-file-path /abs/path/to/errors.log
```

**Supported source dialects:**

| Dialect flag | Source system |
|---|---|
| `snowflake` | Snowflake SQL |
| `oracle` | Oracle SQL / PL-SQL |
| `mssql` | SQL Server T-SQL |
| `synapse` | Azure Synapse Analytics |
| `teradata` | Teradata SQL / BTEQ |
| `netezza` | Netezza SQL |
| `datastage` | IBM DataStage (XML export) |
| `informatica` | Informatica Desktop / Cloud mappings |

**Input/output format:**
- Input: `.sql` files (or `.xml` for DataStage) in `--input-source` directory
- Output: Transpiled `.sql` files in `--output-folder`, preserving directory structure
- Errors: `errors.log` listing files that failed with reasons

---

### Pattern 2: Transpiler Engines — Choosing the Right One

**When to use:** Picking the right engine for your source system complexity.

```
Morpheus    → Deterministic ANTLR parser.
              Best for: Snowflake, Oracle, T-SQL batch files.
              Guarantees: Fast, consistent, no LLM API calls.
              Use when: You need reproducible output in CI/CD.

BladeBridge → Extensible converter for ETL platforms.
              Best for: DataStage, Informatica.
              Outputs: Notebooks, stored procedures, Spark SQL, PySpark.
              Use when: Source is an ETL tool, not raw SQL files.

Switch      → LLM-powered (Mosaic AI).
              Best for: Complex business logic, custom SQL dialects, non-standard syntax.
              Use when: Morpheus leaves many errors.log failures.
              Note: Slower and requires Mosaic AI credits.
```

Configure the engine in `transpiler.toml`:

```toml
[transpiler]
engine = "morpheus"          # morpheus | bladebridge | switch
max_file_size_mb = 10
output_format = "spark_sql"  # spark_sql | pyspark | notebook
```

---

### Pattern 3: Reconcile — Validating Migrated Data

**When to use:** After migrating tables, verify row counts, column values, and schema match between source and Databricks target.

```bash
# 1. Generate config template
databricks labs lakebridge configure-reconcile
# Creates: .lakebridge/recon_config_<SOURCE>_<CATALOG>_<REPORT_TYPE>.json

# 2. Edit the config (see below)

# 3. Run reconciliation
databricks labs lakebridge reconcile
```

**Reconcile config (`recon_config_snowflake_qubika_prod_data.json`):**

```json
{
  "source_name": "snowflake",
  "target_name": "qubika_prod",
  "join_columns": ["opportunity_id"],
  "select_columns": ["opportunity_id", "amount_usd", "stage", "close_date"],
  "drop_columns": ["_internal_snowflake_col"],
  "column_mapping": [
    { "source_name": "OPP_ID",    "target_name": "opportunity_id" },
    { "source_name": "CLOSE_DT",  "target_name": "close_date" }
  ],
  "transformations": [
    {
      "column_name": "close_date",
      "source": "TO_VARCHAR(CLOSE_DT, 'YYYY-MM-DD')",
      "target": "DATE_FORMAT(close_date, 'yyyy-MM-dd')"
    }
  ],
  "column_thresholds": [
    {
      "column_name": "amount_usd",
      "lower_bound": "-1%",
      "upper_bound": "+1%",
      "type": "decimal"
    }
  ],
  "table_thresholds": [
    {
      "lower_bound": "0%",
      "upper_bound": "2%",
      "model": "mismatch"
    }
  ],
  "filters": {
    "source": "CLOSE_DT >= '2020-01-01'",
    "target": "close_date >= '2020-01-01'"
  },
  "aggregates": [
    {
      "type": "SUM",
      "agg_columns": ["amount_usd"],
      "group_by_columns": ["stage"]
    }
  ]
}
```

**Report types:**

| Report type | What it checks | Use when |
|---|---|---|
| `schema` | Column names and data types match | Always run first |
| `row` | Hash-based row matching, no join key needed | Quick full-table check |
| `data` | Row + column-level mismatches with join key | Detailed mismatch analysis |
| `aggregates` | Sum/count/avg metrics match by group | Large tables where row-level is too slow |
| `all` | schema + data combined | Final sign-off before cutover |

---

### Pattern 4: Analyze — Migration Readiness

**When to use:** Before transpiling — understand complexity, coverage, and estimated effort.

```bash
# Analyze a source database schema for migration complexity
databricks labs lakebridge analyze \
  --source-dialect snowflake \
  --input-source /path/to/sql/ \
  --output-folder /path/to/analysis-report/

# Review:
# - How many files transpile cleanly (Morpheus coverage %)
# - Which constructs are unsupported (need Switch or manual fix)
# - Estimated effort per file
```

**Key metrics to check in the analysis report:**
- `success_count` — files transpiled without errors
- `partial_count` — files with some unsupported constructs
- `error_count` — files that need manual intervention
- `unsupported_constructs` — list of SQL constructs Morpheus can't handle

---

### Pattern 5: End-to-End Migration Workflow

```bash
# Step 1: Export SQL from source system
# (Snowflake: SHOW PROCEDURES / SHOW VIEWS / GET DDLS)

# Step 2: Analyze complexity
databricks labs lakebridge analyze \
  --source-dialect snowflake \
  --input-source ./snowflake_ddls/ \
  --output-folder ./analysis/

# Step 3: Transpile (use Morpheus first, Switch for failures)
databricks labs lakebridge transpile \
  --source-dialect snowflake \
  --input-source ./snowflake_ddls/ \
  --output-folder ./databricks_sql/ \
  --catalog-name qubika_dev \
  --schema-name curated.sales

# Step 4: Review errors.log, fix or re-run with Switch engine for failures
grep "ERROR" ./databricks_sql/errors.log

# Step 5: Apply transpiled SQL to Databricks
databricks bundle deploy --target dev
# or directly via Databricks SQL UI

# Step 6: Run reconcile (start with 'schema', then 'data')
databricks labs lakebridge reconcile

# Step 7: Review reconcile dashboard
# Workspace → Dashboards → "Lakebridge Reconciliation"
```

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|---|---|---|
| Running transpile without analyzing first | Surprise 40% failure rate discovered mid-migration | Always run `analyze` first to estimate coverage |
| Skipping `--catalog-name` and `--schema-name` | Output SQL has unresolved table references | Always pass catalog + schema flags |
| Using Switch (LLM) for all files | Slow, expensive, non-deterministic output in CI | Use Morpheus first; Switch only for `errors.log` failures |
| Reconciling without `column_mapping` after rename | Mismatches flagged as errors when columns were just renamed | Map old → new column names in config |
| Setting `table_thresholds` to `0%` | Any floating-point rounding difference fails the check | Allow 1–2% mismatch for numeric columns |
| Skipping `schema` report | Type mismatches (DECIMAL precision) silently wrong | Always run `schema` report before `data` |

---

## FAQ

| Question | Answer |
|----------|--------|
| Does Lakebridge move data or just transpile SQL? | Transpile only — it converts SQL text. Data movement is separate (use Lakefed-Ingest or Databricks COPY INTO) |
| Which engine handles DataStage? | BladeBridge — it reads DataStage XML exports directly |
| What's in errors.log? | Files that failed with the unsupported SQL construct and line number |
| Can I use Lakebridge in CI/CD? | Yes — use Morpheus (`--skip-validation False`) for deterministic output; avoid Switch in CI |
| What if my SQL uses Snowflake-specific window functions? | Morpheus handles most; for `QUALIFY` clauses and PIVOT, check errors.log and use Switch if needed |
| Does reconcile need a JDBC connection to the source? | Yes — configure source credentials in `.lakebridge/` via `configure-reconcile` |
| What Databricks permissions does Lakebridge need? | Can create tables, run SQL statements, access the UC catalog specified |

---

## Related Skills

- `qubika-uc-migration` — moving HMS tables to UC after SQL is transpiled
- `qubika-medallion-architecture` — target catalog/schema naming for transpiled objects
- `qubika-federated-ingestion` — ingesting source data after SQL is transpiled
- `qubika-data-quality` — validating migrated data quality beyond row counts

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-05-06 | Initial version — Lakebridge transpile + reconcile patterns |
