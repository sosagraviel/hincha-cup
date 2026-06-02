---
name: qubika-data-quality
description: "Add data quality validation to Qubika pipelines using DQX (primary framework), Delta constraints, and DLT expectations"
version: 2.0.0
domain: data-engineering
owner: data-platform-team
---

# Qubika Data Quality

Data quality is enforced at every layer of the medallion architecture. **DQX** is the primary framework — use it for all Silver and Gold validation. Use Delta constraints as hard guards on the table itself. Use DLT expectations for pipeline-level monitoring in declarative pipelines.

---

## When to Use This Skill

Use this skill when:
- Adding validation to any Bronze → Silver or Silver → Gold pipeline
- Creating a new Silver or Gold table (always include constraints)
- Investigating data quality issues
- Setting up quality alerts on a pipeline

Do NOT use this skill when:
- Writing ad-hoc analytical queries (no quality enforcement needed)

---

## Quick Start

```bash
# Install DQX (primary quality framework)
pip install databricks-labs-dqx
```

```python
# Validate a Silver DataFrame before writing — drop bad rows, quarantine them
from databricks.labs.dqx.engine import DQEngine
from databricks.labs.dqx.rule import DQRowRule, DQDatasetRule
from databricks.sdk import WorkspaceClient

ws = WorkspaceClient()
engine = DQEngine(spark=spark, workspace_client=ws)

rules = [
    DQRowRule(name="nn_opportunity_id", column="opportunity_id", check_function="is_not_null"),
    DQRowRule(name="valid_amount",       column="amount_usd",      check_function="is_not_less_than", value=0),
    DQRowRule(name="valid_stage",        column="stage",           check_function="is_in_list",
              allowed=["Prospecting","Discovery","Proposal","Negotiation","Closed Won","Closed Lost"]),
    DQDatasetRule(name="unique_opportunity_id", column="opportunity_id", check_function="is_unique"),
]

good_df, bad_df = engine.apply_checks_and_split(df=silver_df, checks=rules)

# Write good rows to Silver, bad rows to quarantine
good_df.write.format("delta").mode("append").saveAsTable("qubika_dev.curated.sales.opportunity")
bad_df.write.format("delta").mode("append").saveAsTable("qubika_dev.quarantine.sales.opportunity")
```

---

## Common Patterns

### Pattern 0: DQX — Profiler (Auto-Generate Rules)

**When to use:** Starting fresh on a table — let DQX analyze it and suggest rules instead of writing them by hand.

```python
from databricks.labs.dqx.profiler.profiler import DQProfiler
from databricks.labs.dqx.config import InputConfig
from databricks.sdk import WorkspaceClient

profiler = DQProfiler(spark=spark, workspace_client=WorkspaceClient())

# Profile a Bronze table and auto-generate quality rules
summary_metrics, quality_profiles = profiler.profile_table(
    input_config=InputConfig(location="qubika_dev.raw.salesforce.opportunity")
)

# Optionally detect primary keys with LLM assistance
primary_keys = profiler.detect_primary_keys_with_llm(
    schema="raw.salesforce",
    table="opportunity"
)

print(f"Suggested PKs: {primary_keys}")
print(f"Generated {len(quality_profiles)} quality rules")
# Review and copy rules you want into your DQRowRule / DQDatasetRule list
```

---

### Pattern 1: DQX — Row-Level Rules

**When to use:** Per-row validation — nulls, ranges, allowed values, regex, date validity.

```python
from databricks.labs.dqx.rule import DQRowRule

rules = [
    # Null checks
    DQRowRule(name="nn_id",     column="opportunity_id", check_function="is_not_null"),
    DQRowRule(name="nn_date",   column="close_date",     check_function="is_not_null"),

    # Range checks
    DQRowRule(name="pos_amount", column="amount_usd",    check_function="is_not_less_than", value=0),
    DQRowRule(name="valid_date", column="close_date",    check_function="is_in_range",
              min="2020-01-01", max="2030-12-31"),

    # Allowed values
    DQRowRule(name="valid_stage", column="stage",        check_function="is_in_list",
              allowed=["Prospecting","Discovery","Proposal","Negotiation","Closed Won","Closed Lost"]),

    # Regex
    DQRowRule(name="valid_email", column="owner_email",  check_function="regex_match",
              pattern=r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"),

    # Freshness
    DQRowRule(name="not_future", column="close_date",    check_function="is_not_in_future"),

    # Custom SQL expression
    DQRowRule(name="amount_or_null", column="amount_usd", check_function="sql_expression",
              expression="amount_usd IS NULL OR amount_usd >= 0",
              criticality="warn"),   # warn = log but keep row; error (default) = drop/quarantine
]
```

---

### Pattern 2: DQX — Dataset-Level Rules (Cross-Row)

**When to use:** Rules that span multiple rows — uniqueness, referential integrity, aggregation checks, freshness windows.

```python
from databricks.labs.dqx.rule import DQDatasetRule

dataset_rules = [
    # Uniqueness
    DQDatasetRule(name="unique_opportunity_id",
                  column="opportunity_id",
                  check_function="is_unique"),

    # Foreign key integrity
    DQDatasetRule(name="fk_account_exists",
                  column="account_id",
                  check_function="foreign_key",
                  reference_table="qubika_dev.curated.sales.account",
                  reference_column="account_id"),

    # Aggregation bounds (total revenue must be > 0)
    DQDatasetRule(name="total_revenue_positive",
                  check_function="is_aggr_not_less_than",
                  column="amount_usd",
                  aggr_function="sum",
                  value=0),

    # Statistical outlier detection
    DQDatasetRule(name="no_amount_outliers",
                  check_function="has_no_outliers",
                  column="amount_usd",
                  sigma=3),

    # Data freshness
    DQDatasetRule(name="data_arrived_recently",
                  check_function="is_data_fresh_per_time_window",
                  column="_ingested_at",
                  time_window="4 hours"),
]
```

---

### Pattern 3: Delta Table Constraints (Hard Guards)

**When to use:** Non-nullable columns, valid ranges, allowed values. These are the first line of defense.

```sql
-- Apply to Silver and Gold tables (not Bronze — Bronze accepts all data)
CREATE TABLE qubika_dev.curated.finance.invoice (
  invoice_id     STRING  NOT NULL,
  customer_id    STRING  NOT NULL,
  amount_usd     DECIMAL(18,2),
  invoice_date   DATE    NOT NULL,
  status         STRING,
  _updated_at    TIMESTAMP
)
USING DELTA;

ALTER TABLE qubika_dev.curated.finance.invoice
  ADD CONSTRAINT nn_invoice_id    CHECK (invoice_id IS NOT NULL),
  ADD CONSTRAINT positive_amount  CHECK (amount_usd > 0),
  ADD CONSTRAINT valid_status     CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  ADD CONSTRAINT date_not_future  CHECK (invoice_date <= CURRENT_DATE());
```

---

### Pattern 2: DLT Expectations (Pipeline-Level Quality)

**When to use:** Quality monitoring in Declarative Pipeline (DLT) jobs — captures quality metrics without failing the pipeline.

```python
import dlt
from pyspark.sql import functions as F

@dlt.table(name="silver_opportunity")
@dlt.expect_or_drop("valid_opportunity_id", "opportunity_id IS NOT NULL")
@dlt.expect_or_drop("valid_amount",         "amount_usd >= 0")
@dlt.expect("valid_stage", "stage IN ('Prospecting', 'Discovery', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost')")
def silver_opportunity():
    return (
        dlt.read("bronze_opportunity")
        .select(
            F.col("id").alias("opportunity_id"),
            F.col("amount").cast("decimal(18,2)").alias("amount_usd"),
            F.col("stage_name").alias("stage"),
            F.current_timestamp().alias("_updated_at")
        )
    )
```

**Expectation behaviors:**
- `@dlt.expect` — records violation count, doesn't drop rows (soft warning)
- `@dlt.expect_or_drop` — drops rows that fail (recommended for Silver)
- `@dlt.expect_or_fail` — fails the pipeline if any row violates (use for critical dimensions)

---

### Pattern 3: Python Quality Checks (Complex Rules)

**When to use:** Rules that can't be expressed in SQL — cross-table referential integrity, statistical anomalies, regex patterns.

```python
from pyspark.sql import functions as F, DataFrame
from pyspark.sql.types import StructType, StructField, StringType, LongType, TimestampType
import functools

def run_quality_checks(df: DataFrame, table_name: str) -> dict:
    """
    Run quality checks on a DataFrame. Returns a dict of check_name -> pass/fail/count.
    Raises ValueError if any critical check fails.
    """
    results = {}
    total = df.count()

    # Rule 1: No nulls on key columns
    null_ids = df.filter(F.col("opportunity_id").isNull()).count()
    results["no_null_ids"] = {"status": "PASS" if null_ids == 0 else "FAIL", "violations": null_ids}

    # Rule 2: Amount within expected range (statistical — not SQL-expressible)
    stats = df.agg(
        F.mean("amount_usd").alias("mean"),
        F.stddev("amount_usd").alias("stddev")
    ).collect()[0]
    outliers = df.filter(
        F.abs(F.col("amount_usd") - stats["mean"]) > 3 * stats["stddev"]
    ).count()
    results["no_statistical_outliers"] = {"status": "WARN" if outliers > 0 else "PASS", "violations": outliers}

    # Rule 3: Referential integrity — every account_id exists in account table
    account_ids = spark.table("qubika_dev.curated.sales.account").select("account_id")
    orphaned = df.join(account_ids, "account_id", "left_anti").count()
    results["referential_integrity"] = {"status": "FAIL" if orphaned > 0 else "PASS", "violations": orphaned}

    # Write quality results to the quality log table
    _write_quality_log(results, table_name, total)

    # Raise on any FAIL
    failures = [k for k, v in results.items() if v["status"] == "FAIL"]
    if failures:
        raise ValueError(f"Quality checks failed for {table_name}: {failures}")

    return results


def _write_quality_log(results: dict, table_name: str, total_rows: int):
    rows = [
        (table_name, check, v["status"], v["violations"], total_rows)
        for check, v in results.items()
    ]
    schema = StructType([
        StructField("table_name", StringType()),
        StructField("check_name", StringType()),
        StructField("status", StringType()),
        StructField("violation_count", LongType()),
        StructField("total_rows", LongType()),
    ])
    (
        spark.createDataFrame(rows, schema)
        .withColumn("checked_at", F.current_timestamp())
        .write.format("delta").mode("append")
        .saveAsTable("qubika_dev.monitoring.data_quality_log")
    )
```

---

### Pattern 4: Freshness Checks

**When to use:** Ensuring tables are updated on time — detect stuck pipelines before business users notice.

```python
from datetime import datetime, timedelta

def assert_table_freshness(table: str, max_age_hours: int = 24):
    """Raise if the table hasn't been updated within max_age_hours."""
    result = spark.sql(f"""
        SELECT MAX(_updated_at) AS last_update
        FROM {table}
    """).collect()[0]["last_update"]

    if result is None:
        raise ValueError(f"Table {table} has no data")

    age = datetime.utcnow() - result.replace(tzinfo=None)
    if age > timedelta(hours=max_age_hours):
        raise ValueError(
            f"Table {table} is stale: last updated {age} ago (max allowed: {max_age_hours}h)"
        )

    print(f"[OK] {table} is fresh (last updated {age} ago)")
```

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| Hand-writing all rules from scratch | Time-consuming and misses edge cases | Run DQX Profiler first, then refine |
| No constraints on Silver tables | Silent corrupt data flows to Gold | Always add Delta constraints alongside DQX |
| Constraints on Bronze tables | Bronze must accept all data | Constraints only on Silver+ |
| Raising on warnings in DLT | Pipeline fails for non-critical issues | Use `expect` (warn) vs `expect_or_drop` (critical) |
| Not logging quality check results | Can't trend quality over time | Write bad_df to `qubika_dev.quarantine.*` |
| Using `criticality="error"` for every rule | Pipeline stops on minor issues | Use `"warn"` for non-critical rules, `"error"` only for blocking failures |

---

## Quality Stack Decision Guide

| Need | Tool |
|------|------|
| Auto-generate rules from data | `DQX Profiler` |
| Per-row null/range/regex checks | `DQRowRule` |
| Uniqueness, FK, outliers, freshness | `DQDatasetRule` |
| Hard table-level guards (block bad writes) | `Delta constraints` |
| In-DLT/Lakeflow pipeline quality gates | `@dlt.expect_or_drop` |
| Custom SQL rule | `DQRowRule(check_function="sql_expression")` |
| Ongoing drift / distribution monitoring | `qubika-lakehouse-monitoring` |
| Schema-level freshness + completeness (built-in UC) | UC Data Quality Monitoring (Databricks workspace → Catalog Explorer → table → Quality tab) |

---

## Reference Files

- [expectations.md](expectations.md) — Standard Qubika DQX rule sets by domain

---

## FAQ

| Question | Answer |
|----------|--------|
| DQX or Delta constraints — which takes priority? | Both. DQX catches issues before the write; Delta constraints are the last line of defense |
| Where should constraints live — Bronze or Silver? | Silver and Gold only. Bronze accepts any data |
| Where do quarantined rows go? | `qubika_dev.quarantine.{domain}.{table_name}` |
| Can DQX check cross-table referential integrity? | Yes — `DQDatasetRule(check_function="foreign_key", reference_table=...)` |
| How do I auto-generate rules for a new table? | `DQProfiler.profile_table(InputConfig(location="catalog.schema.table"))` |
| What's `criticality`? | `"error"` = drop/quarantine the row. `"warn"` = log but keep it. Default is `"error"` |
| How do I save/load rules from a file? | `engine.save_checks(rules, path)` / `engine.load_checks(path)` — stores as versioned Delta table |

---

## Related Skills

- `qubika-medallion-architecture` — where quality checks fit in the pipeline
- `qubika-dlt-meta` — DQE JSON format for DLT-META quality gates
- `qubika-monitoring-observability` — alerting on quality failures
- `qubika-pipeline-testing` — unit testing DQX rules

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-01-01 | Initial version — Delta constraints + DLT expectations |
| 2.0.0 | 2025-05-06 | Added DQX as primary framework — Profiler, DQRowRule, DQDatasetRule patterns |
| 2.1.0 | 2026-05-07 | Added UC Data Quality Monitoring and Lakehouse Monitoring to decision guide; fixed duplicate changelog |
